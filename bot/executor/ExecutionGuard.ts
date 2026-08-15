import { formatUnits } from "ethers";
import { TOKEN_DECIMALS } from "../scanner/TokenList.js";
import { convertUSDToTokenAmount, getTokenPriceUSD } from "../utils/USDAmountConverter.js";
import { QuoteResult } from "../scanner/quote/index.js";

export interface ExecutionSafetyInput {
    grossProfitUSD: number;
    netProfitUSD: number;
    loanAmountUSD: number;
    quoteAgeMs: number;
    maxQuoteAgeMs?: number;
    minNetProfitUSD?: number;
    minGrossProfitUSD?: number;
    maxLoanUSD?: number;
    maxSlippageBps?: number;
    /** Slippage component only; gas must not be counted as slippage. */
    slippageUSD?: number;
}

export interface ExecutionSafetyResult {
    allowed: boolean;
    reason?: string;
}

export interface ExecutableProfitInput {
    tokenA: string;
    tokenB: string;
    tokenC: string;
    inputAmount: bigint;
    subgraphQuotes: { amountOut: bigint; dex: string }[];
    zeroXQuote?: { amountOut: bigint; input: bigint };
    gasCost?: bigint;
    flashLoanFee?: bigint;
    slippageBuffer?: bigint;
}

export interface ExecutableProfitResult {
    valid: boolean;
    reason?: string;
    rawProfit: number; // percentage
    validatedProfit: number; // percentage
    netProfit: number; // percentage
    costs: {
        gasCost: number; // percentage
        flashLoanFee: number; // percentage
        slippageBuffer: number; // percentage
    };
    details: {
        rawAmountOut: bigint;
        validatedAmountOut: bigint;
        netAmountOut: bigint;
    };
}

export function evaluateExecutionSafety(input: ExecutionSafetyInput): ExecutionSafetyResult {
    const maxQuoteAgeMs = input.maxQuoteAgeMs ?? 10_000;
    const minNetProfitUSD = input.minNetProfitUSD ?? 20;
    const minGrossProfitUSD = input.minGrossProfitUSD ?? 25;
    const maxLoanUSD = input.maxLoanUSD ?? 5_000;
    const maxSlippageBps = input.maxSlippageBps ?? 50;

    if (![maxQuoteAgeMs, minNetProfitUSD, minGrossProfitUSD, maxLoanUSD, maxSlippageBps]
        .every(Number.isFinite) || maxQuoteAgeMs < 0 || maxLoanUSD <= 0 || maxSlippageBps < 0) {
        return { allowed: false, reason: "invalid-safety-config" };
    }

    // Missing/NaN values must fail closed; otherwise comparisons below can
    // silently evaluate to false and allow an unpriced opportunity through.
    if (![input.grossProfitUSD, input.netProfitUSD, input.loanAmountUSD, input.quoteAgeMs]
        .every(Number.isFinite)) {
        return { allowed: false, reason: "invalid-profit-metrics" };
    }

    if (input.loanAmountUSD <= 0 || input.quoteAgeMs < 0 || input.grossProfitUSD < 0 ||
        input.netProfitUSD > input.grossProfitUSD) {
        return { allowed: false, reason: "invalid-profit-metrics" };
    }

    if (input.loanAmountUSD > maxLoanUSD) {
        return { allowed: false, reason: "loan-too-large" };
    }

    if (input.netProfitUSD < minNetProfitUSD) {
        return { allowed: false, reason: "net-profit-too-low" };
    }

    if (input.grossProfitUSD < minGrossProfitUSD) {
        return { allowed: false, reason: "gross-profit-too-low" };
    }

    if (input.quoteAgeMs > maxQuoteAgeMs) {
        return { allowed: false, reason: "quote-stale" };
    }

    const slippageUsd = input.slippageUSD ?? 0;
    if (!Number.isFinite(slippageUsd) || slippageUsd < 0) {
        return { allowed: false, reason: "invalid-slippage" };
    }
    const slippageBps = input.loanAmountUSD > 0 ? (slippageUsd / input.loanAmountUSD) * 10_000 : 0;

    if (slippageBps > maxSlippageBps) {
        return { allowed: false, reason: "slippage-budget-exceeded" };
    }

    return { allowed: true };
}

/**
 * Validate executable profit pipeline
 * Pipeline: Subgraph quote â†’ Raw profit > 0 â†’ 0x validation â†’ Costs â†’ Net profit > 0
 */
export function validateExecutableProfit(input: ExecutableProfitInput): ExecutableProfitResult {
    const { inputAmount, subgraphQuotes, zeroXQuote, gasCost = 0n, flashLoanFee = 0n, slippageBuffer = 0n } = input;
    
    // Step 1: Calculate raw profit from subgraph quotes
    let rawAmountOut = inputAmount;
    for (const quote of subgraphQuotes) {
        rawAmountOut = quote.amountOut;
    }
    
    if (inputAmount <= 0n) {
        return {
            valid: false,
            reason: "Invalid input amount",
            rawProfit: 0,
            validatedProfit: 0,
            netProfit: 0,
            costs: { gasCost: 0, flashLoanFee: 0, slippageBuffer: 0 },
            details: { rawAmountOut, validatedAmountOut: 0n, netAmountOut: 0n }
        };
    }

    const rawProfitPercentage = Number(rawAmountOut - inputAmount) / Number(inputAmount);
    
    // Step 2: Check raw profit > 0
    if (rawProfitPercentage <= 0) {
        return {
            valid: false,
            reason: "Raw profit <= 0",
            rawProfit: rawProfitPercentage,
            validatedProfit: 0,
            netProfit: 0,
            costs: { gasCost: 0, flashLoanFee: 0, slippageBuffer: 0 },
            details: { rawAmountOut, validatedAmountOut: 0n, netAmountOut: 0n }
        };
    }
    
    // Step 3: 0x validation (if available)
    let validatedAmountOut = rawAmountOut;
    if (zeroXQuote) {
        if (zeroXQuote.input <= 0n || zeroXQuote.input !== inputAmount || zeroXQuote.amountOut <= 0n) {
            return {
                valid: false,
                reason: "0x quote input mismatch",
                rawProfit: rawProfitPercentage,
                validatedProfit: 0,
                netProfit: 0,
                costs: { gasCost: 0, flashLoanFee: 0, slippageBuffer: 0 },
                details: { rawAmountOut, validatedAmountOut: 0n, netAmountOut: 0n }
            };
        }
        validatedAmountOut = zeroXQuote.amountOut;
        const validatedProfitPercentage = Number(validatedAmountOut - inputAmount) / Number(inputAmount);
        
        // Check 0x output > input
        if (validatedProfitPercentage <= 0) {
            return {
                valid: false,
                reason: "0x output <= input",
                rawProfit: rawProfitPercentage,
                validatedProfit: validatedProfitPercentage,
                netProfit: 0,
                costs: { gasCost: 0, flashLoanFee: 0, slippageBuffer: 0 },
                details: { rawAmountOut, validatedAmountOut, netAmountOut: 0n }
            };
        }
    }
    
    // Step 4: Calculate costs as percentages
    const gasCostPercentage = Number(gasCost) / Number(validatedAmountOut);
    const flashLoanFeePercentage = Number(flashLoanFee) / Number(validatedAmountOut);
    const slippageBufferPercentage = Number(slippageBuffer) / Number(validatedAmountOut);
    
    // Step 5: Calculate net profit
    const netAmountOut = validatedAmountOut - gasCost - flashLoanFee - slippageBuffer;
    const netProfitPercentage = Number(netAmountOut - inputAmount) / Number(inputAmount);
    
    // Step 6: Check net profit > 0
    if (netProfitPercentage <= 0) {
        return {
            valid: false,
            reason: "Net profit <= 0 after costs",
            rawProfit: rawProfitPercentage,
            validatedProfit: Number(validatedAmountOut - inputAmount) / Number(inputAmount),
            netProfit: netProfitPercentage,
            costs: {
                gasCost: gasCostPercentage,
                flashLoanFee: flashLoanFeePercentage,
                slippageBuffer: slippageBufferPercentage
            },
            details: { rawAmountOut, validatedAmountOut, netAmountOut }
        };
    }
    
    return {
        valid: true,
        rawProfit: rawProfitPercentage,
        validatedProfit: Number(validatedAmountOut - inputAmount) / Number(inputAmount),
        netProfit: netProfitPercentage,
        costs: {
            gasCost: gasCostPercentage,
            flashLoanFee: flashLoanFeePercentage,
            slippageBuffer: slippageBufferPercentage
        },
        details: { rawAmountOut, validatedAmountOut, netAmountOut }
    };
}

/**
 * Log candidate validation in production format
 * Format: [DISCOVERY] â†’ [SUBGRAPH] â†’ [0x VALIDATION] â†’ [COST] â†’ [NET] â†’ [EXECUTION]
 */
export function logCandidateValidation(
    tokenA: string,
    tokenB: string,
    tokenC: string,
    validation: ExecutableProfitResult,
    executed: boolean = false
): void {
    console.log("[DISCOVERY]");
    console.log(`${tokenA.slice(0,6)} â†’ ${tokenB.slice(0,6)} â†’ ${tokenC.slice(0,6)} â†’ ${tokenA.slice(0,6)}`);
    
    console.log("[SUBGRAPH]");
    console.log(`1 ${tokenA.slice(0,6)} â†’ ${(1 + validation.rawProfit).toFixed(5)} ${tokenA.slice(0,6)}`);
    console.log(`Raw profit: ${(validation.rawProfit * 100).toFixed(3)}%`);
    
    console.log("[0x VALIDATION]");
    console.log(`1 ${tokenA.slice(0,6)} â†’ ${(1 + validation.validatedProfit).toFixed(5)} ${tokenA.slice(0,6)}`);
    console.log(`Validated profit: ${(validation.validatedProfit * 100).toFixed(3)}%`);
    
    console.log("[COST]");
    console.log(`Gas:       -${(validation.costs.gasCost * 100).toFixed(3)}%`);
    console.log(`Flashloan: -${(validation.costs.flashLoanFee * 100).toFixed(3)}%`);
    console.log(`Buffer:    -${(validation.costs.slippageBuffer * 100).toFixed(3)}%`);
    
    console.log("[NET]");
    const netProfitPercent = (validation.netProfit * 100).toFixed(3);
    if (validation.valid) {
        console.log(`+${netProfitPercent}% âœ…`);
    } else {
        console.log(`${netProfitPercent}% âŒ (${validation.reason})`);
    }
    
    if (executed && validation.valid) {
        console.log("[EXECUTION]");
        console.log("Submitted");
    }
}

/**
 * Validate on-chain quote against subgraph quote
 * Prevents execution with stale data
 */
export function validateOnChainQuote(
    subgraphQuote: bigint,
    onChainQuote: bigint,
    maxPriceDeviation: number = 0.005 // 0.5% max deviation
): boolean {
    if (subgraphQuote <= 0n || onChainQuote < 0n || !Number.isFinite(maxPriceDeviation) || maxPriceDeviation < 0) {
        return false;
    }
    const priceDiff = Math.abs(Number(onChainQuote - subgraphQuote)) / Number(subgraphQuote);
    return priceDiff <= maxPriceDeviation;
}

/**
 * Find optimal flash loan amount for maximum net profit
 * Tests multiple amounts and selects the one with best net profit USD
 * 
 * @param route Route to test
 * @param getQuote Function to get quote for a specific amount
 * @param getCost Function to get cost estimate for a specific amount
 * @param minAmount Minimum amount to test (default: 100 USDC)
 * @param maxAmount Maximum amount to test (default: 10,000 USDC)
 * @returns Optimal amount and estimated net profit
 */
export interface OptimalAmountResult {
    optimalAmount: bigint;
    estimatedNetProfitUSD: number;
    estimatedGasCostUSD: number;
    roi: number; // ROI as percentage
    testedAmounts: Array<{
        amount: bigint;
        netProfitUSD: number;
        gasCostUSD: number;
        roi: number;
        priceImpactApprox: number; // Approximate price impact percentage
    }>;
}

export async function findOptimalAmount(
    route: any,
    getQuote: (amount: bigint) => Promise<QuoteResult[]>,
    getCost: (amount: bigint) => Promise<{ gasCostUSD: number; flashLoanFeeUSD: number }>,
    minAmountUSD: number = 100, // $100 USD
    maxAmountUSD: number = 10000, // $10,000 USD
    testSteps: number = 6, // Number of test amounts to try
    tokenAddress: string = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" // Default to USDC
): Promise<OptimalAmountResult> {
    const testedAmounts: OptimalAmountResult['testedAmounts'] = [];
    let bestAmountUSD = minAmountUSD;
    let bestNetProfitUSD = 0;
    let bestROI = 0;
    
    // Generate USD test amounts logarithmically for better coverage
    const usdAmounts: number[] = [];
    const safeTestSteps = Math.max(1, Math.floor(testSteps));
    for (let i = 0; i < safeTestSteps; i++) {
        const step = safeTestSteps > 1 ? (maxAmountUSD - minAmountUSD) / (safeTestSteps - 1) : 0;
        const usdAmount = minAmountUSD + (step * i);
        usdAmounts.push(usdAmount);
    }
    
    console.log(`[OPTIMAL SIZING] Testing ${usdAmounts.length} USD amounts for optimal sizing`);
    
    for (const usdAmount of usdAmounts) {
        try {
            // Convert USD amount to token-specific amount
            const tokenAmount = convertUSDToTokenAmount(usdAmount, tokenAddress);
            
            console.log(`  Testing $${usdAmount} USD (${tokenAmount.toString()} token units)`);
            
            // Get quote for this amount
            const quotes = await getQuote(tokenAmount);
            if (quotes.length === 0) {
                console.log(`    No quote available`);
                continue;
            }
            
            // Validate triangular route structure (must have 3 legs)
            if (quotes.length !== 3) {
                console.log(`  Invalid triangular route: Expected 3 quotes, got ${quotes.length}`);
                continue;
            }
            
            const quoteAB = quotes[0]; // A â†’ B
            const quoteBC = quotes[1]; // B â†’ C  
            const quoteCA = quotes[2]; // C â†’ A
            
            if (!quoteAB || !quoteBC || !quoteCA) {
                console.log(`  Missing required quotes for triangular route`);
                continue;
            }
            
            // QUALITY FILTER: Minimum DEX variety (cross-DEX arbitrage requirement)
            const dexVariety = new Set(quotes.map(q => q.dex)).size;
            if (dexVariety < 2) {
                console.log(`  âŒ Filtered: Single-DEX triangle in optimal sizing (${quotes.map(q => q.dex).join(' â†’ ')})`);
                continue;
            }
            
            console.log(`  âœ… DEX variety check passed: ${dexVariety} different DEX${dexVariety > 1 ? 's' : ''}`);
            
            // Debug: Check if any 0X quotes are getting through
            const has0XQuotes = quotes.some(q => q.dex === "0X");
            if (has0XQuotes) {
                console.error(`âš ï¸ WARNING: 0X quotes detected in ExecutionGuard!`);
                console.log(`This indicates discoveryQuoteEngine is contaminated with 0x aggregator`);
            }
            
            // Validate quote chaining (output of previous leg must match input of next leg)
            console.log("\n=== EXECUTION GUARD QUOTES ===");
            console.log(`Input: $${usdAmount} USD (${tokenAmount.toString()} token units)`);
            
            let chainBroken = false;
            for (let i = 0; i < quotes.length; i++) {
                const q = quotes[i];
                const decimalsIn = TOKEN_DECIMALS[q.tokenIn.toLowerCase()] ?? 18;
                const decimalsOut = TOKEN_DECIMALS[q.tokenOut.toLowerCase()] ?? 18;
                
                console.log(`\nLeg ${i + 1}:`);
                console.log(`  DEX:       ${q.dex}`);
                console.log(`  tokenIn:   ${q.tokenIn.slice(0, 8)}...`);
                console.log(`  tokenOut:  ${q.tokenOut.slice(0, 8)}...`);
                console.log(`  amountIn:  ${formatUnits(q.amountIn, decimalsIn)}`);
                console.log(`  amountOut: ${formatUnits(q.amountOut, decimalsOut)}`);
                
                // Validate chaining for legs 2 and 3
                if (i > 0) {
                    const previous = quotes[i - 1];
                    if (q.amountIn !== previous.amountOut) {
                        console.error(
                            "QUOTE CHAIN BROKEN",
                            `Previous leg ${i} output: ${previous.amountOut.toString()}`,
                            `Current leg ${i + 1} input: ${q.amountIn.toString()}`
                        );
                        chainBroken = true;
                    }
                }
            }
            
            if (chainBroken) {
                console.log(`  Skipping due to broken quote chain`);
                continue;
            }
            
            // Calculate final output amount
            const amountOut = quoteCA.amountOut;
            
            // Get costs
            const { gasCostUSD, flashLoanFeeUSD } = await getCost(tokenAmount);
            
            // Calculate net profit with proper BigInt handling
            const grossProfit = amountOut - tokenAmount;
            const tokenDecimals = TOKEN_DECIMALS[tokenAddress.toLowerCase()] ?? 18;
            const grossProfitUSD = Number(formatUnits(grossProfit, tokenDecimals)) * getTokenPriceUSD(tokenAddress);
            const netProfitUSD = grossProfitUSD - gasCostUSD - flashLoanFeeUSD;
            const roi = usdAmount > 0 ? (netProfitUSD / usdAmount) * 100 : 0;
            
            console.log(`\n$${usdAmount} USD: Gross: $${grossProfitUSD.toFixed(2)}, Net: $${netProfitUSD.toFixed(2)}, ROI: ${roi.toFixed(2)}%`);
            
            testedAmounts.push({
                amount: tokenAmount,
                netProfitUSD,
                gasCostUSD,
                roi,
                priceImpactApprox: (usdAmount / 100000) * 100 // Approximate based on $100k minimum liquidity assumption
            });
            
            // Update best if this amount has better net profit
            if (netProfitUSD > bestNetProfitUSD && netProfitUSD >= 1) { // Minimum $1 net profit
                bestNetProfitUSD = netProfitUSD;
                bestAmountUSD = usdAmount;
                bestROI = roi;
            }
        } catch (error) {
            console.log(`  $${usdAmount} USD: Quote failed - ${error instanceof Error ? error.message : error}`);
        }
    }
    
    // Convert best USD amount back to token amount
    const optimalTokenAmount = convertUSDToTokenAmount(bestAmountUSD, tokenAddress);
    
    console.log(`[OPTIMAL SIZING] Best amount: $${bestAmountUSD} USD (${optimalTokenAmount.toString()} token units), Net profit: $${bestNetProfitUSD.toFixed(2)}, ROI: ${bestROI.toFixed(2)}%`);
    
    return {
        optimalAmount: optimalTokenAmount,
        estimatedNetProfitUSD: bestNetProfitUSD,
        estimatedGasCostUSD: testedAmounts.find(t => t.amount === optimalTokenAmount)?.gasCostUSD || 0,
        roi: bestROI,
        testedAmounts
    };
}
