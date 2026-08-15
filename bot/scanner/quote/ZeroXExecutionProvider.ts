import { QuoteRequest, QuoteResult } from "./index.js";
import { TriangleCandidate } from "../TriangleDiscoveryEngine.js";
import { ExecutionQuoteProvider, ExecutionQuote } from "./ExecutionQuoteProvider.js";
import { ZeroXAggregator } from "../aggregator/ZeroXAggregator.js";

/**
 * 0x-based execution quote provider
 * Validates discovered triangles and provides executable quotes with gas estimation
 */
export class ZeroXExecutionProvider implements ExecutionQuoteProvider {
    private zeroXAggregator: ZeroXAggregator;

    constructor(zeroXAggregator: ZeroXAggregator) {
        this.zeroXAggregator = zeroXAggregator;
    }

    /**
     * Validate a triangle candidate for execution via 0x
     * Checks if 0x can provide executable quotes for all legs
     */
    async validateTriangle(candidate: TriangleCandidate): Promise<boolean> {
        try {
            // Check if 0x is enabled
            if (!this.zeroXAggregator.isEnabled()) {
                return false;
            }

            // Try to get quotes for all legs via 0x
            for (const leg of candidate.legs) {
                const quote = await this.zeroXAggregator.getQuote({
                    tokenIn: leg.from,
                    tokenOut: leg.to,
                    amountIn: leg.amountIn
                });

                if (!quote) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get executable quote for a triangle via 0x
     * Provides gas estimation and validates execution feasibility
     */
    async getExecutableQuote(candidate: TriangleCandidate): Promise<ExecutionQuote | null> {
        try {
            if (!this.zeroXAggregator.isEnabled()) {
                return null;
            }

            const quotes: QuoteResult[] = [];
            let estimatedGas = 0n;
            let gasPrice = 0n;

            // Get quotes for all legs via 0x
            for (const leg of candidate.legs) {
                const quote = await this.zeroXAggregator.getQuote({
                    tokenIn: leg.from,
                    tokenOut: leg.to,
                    amountIn: leg.amountIn
                });

                if (!quote) {
                    return null;
                }

                quotes.push(quote);
            }

            // Estimate gas (use default for triangular arbitrage)
            estimatedGas = 650000n; // ~650k gas for 3 swaps

            // Get current gas price (simplified - use default)
            gasPrice = 1000000000n; // 1 gwei default

            return {
                provider: "0x",
                triangle: candidate,
                quotes,
                estimatedGas,
                gasPrice,
                isExecutable: true
            };
        } catch (error) {
            return null;
        }
    }

    getProviderName(): string {
        return "0x";
    }
}
