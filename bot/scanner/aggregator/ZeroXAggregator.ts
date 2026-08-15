import { QuoteRequest, QuoteResult } from "../quote/index.js";
import { zeroXRateLimiter } from "../../utils/RateLimiter.js";

interface ZeroXQuoteResponse {
    buyAmount: string;
    sellAmount: string;
    allowanceTarget: string;
    to: string;
    data: string;
    estimatedGas: string;
    gasPrice: string;
    guaranteedPrice: string;
    sources: ZeroXSource[];
    price: string;
}

interface ZeroXSource {
    name: string;
    proportion: string;
}

export function parseZeroXQuoteResponse(data: any): { amountOut: bigint; estimatedGas: bigint; gasPrice: bigint; sources: string[] } | null {
    if (!data || typeof data !== "object") {
        return null;
    }

    const buyAmount = data.buyAmount;
    if (!buyAmount || buyAmount === undefined || buyAmount === null || buyAmount === "") {
        return null;
    }

    let amountOut: bigint;
    try {
        amountOut = BigInt(String(buyAmount));
    } catch {
        return null;
    }

    let estimatedGas: bigint = BigInt(0);
    if (data.estimatedGas) {
        try {
            estimatedGas = BigInt(String(data.estimatedGas));
        } catch {
            // Use default
        }
    }

    let gasPrice: bigint = BigInt(0);
    if (data.gasPrice) {
        try {
            gasPrice = BigInt(String(data.gasPrice));
        } catch {
            // Use default
        }
    }

    const sources = data.sources ? data.sources.map((s: any) => s.name) : [];

    return {
        amountOut,
        estimatedGas,
        gasPrice,
        sources
    };
}

export class ZeroXAggregator {
    private apiKey: string;
    private baseUrl: string;
    private chainId: number;
    private takerAddress: string;
    private consecutiveFailures = 0;
    private disabled = false;
    private provider: any; // Store provider for gas estimation

    constructor(apiKey?: string, baseUrl?: string, chainId: number = 8453, takerAddress?: string, provider?: any) {
        this.apiKey = apiKey || "";
        this.baseUrl = baseUrl || "https://api.0x.org";
        this.chainId = chainId; // Base chain ID
        this.takerAddress = takerAddress || "0x0000000000000000000000000000000000000000"; // Default zero address
        this.provider = provider;
    }

    public isEnabled(): boolean {
        return !this.disabled;
    }

    public getProvider(): any {
        return this.provider;
    }

    private handleFailure(reason: string): void {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= 3) {
            this.disabled = true;
            console.warn(`0x aggregator disabled after repeated failures (${reason})`);
        }
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'User-Agent': 'morpho-arbitrage-bot/2.0'
        };
        
        // Add 0x-specific headers
        if (this.apiKey) {
            headers['0x-api-key'] = this.apiKey;
        }
        headers['0x-version'] = 'v2';
        
        return headers;
    }

    /**
     * Get best quote from 0x API
     * 0x will automatically find the best route across all supported DEXes
     */
    public async getQuote(request: QuoteRequest): Promise<QuoteResult | null> {
    if (!this.isEnabled()) {
        return null;
    }

    try {
        // Rate limit 0x API calls to prevent hitting rate limits
        await zeroXRateLimiter.wait();

        if (!this.apiKey) {
            return null;
        }

        if (!this.takerAddress) {
            return null;
        }

        const baseUrl = this.baseUrl.replace(/\/$/, "");

        const params = new URLSearchParams({
            chainId: this.chainId.toString(),
            sellToken: request.tokenIn,
            buyToken: request.tokenOut,
            sellAmount: request.amountIn.toString(),
            taker: this.takerAddress,
        });

        const url = `${baseUrl}/swap/permit2/quote?${params.toString()}`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "0x-api-key": this.apiKey,
                "0x-version": "v2",
                "Content-Type": "application/json",
            },
        });

        const bodyText = await response.text();

        if (!response.ok) {
            this.handleFailure(`http-${response.status}`);
            return null;
        }

        let data: any;

        try {
            data = JSON.parse(bodyText);
        } catch {
            this.handleFailure("invalid-response");
            return null;
        }

        if (!data?.buyAmount) {
            this.handleFailure("invalid-response");
            return null;
        }

        const amountOut = BigInt(data.buyAmount);
        const sources = data.route?.fills?.map((fill: any) => fill.source) ?? [];

        this.consecutiveFailures = 0;

        return {
            dex: "0X",
            pool: sources.join("+") || "AGGREGATED",
            tokenIn: request.tokenIn,
            tokenOut: request.tokenOut,
            amountIn: request.amountIn,
            amountOut,
            fee: 0,
        };

    } catch (error) {
        this.handleFailure("request-exception");
        return null;
    }
    }

    /**
     * Get swap data from 0x API (for execution)
     */
    public async getSwapData(
        request: QuoteRequest,
        fromAddress: string,
        slippage: number = 1
    ): Promise<any | null> {
        try {
            const baseUrl = this.baseUrl.replace(/\/$/, '');
            
            // Direct 0x API format
            const params = new URLSearchParams({
                chainId: this.chainId.toString(),
                sellToken: request.tokenIn,
                buyToken: request.tokenOut,
                sellAmount: request.amountIn.toString(),
                taker: fromAddress
            });

            const url = `${baseUrl}/swap/permit2/quote?${params.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    console.warn("0x swap authentication failed: check the API key and QuickNode plan access.");
                } else {
                    console.warn(`0x swap API error: ${response.status} ${response.statusText}`);
                }
                return null;
            }

            return await response.json();
        } catch (error) {
            console.warn("0x swap API request failed:", error instanceof Error ? error.message : error);
            return null;
        }
    }

    /**
     * Check if 0x API is available
     */
    public async checkHealth(): Promise<boolean> {
        try {
            // Simple health check by querying a known pair
            const WETH = "0x4200000000000000000000000000000000000006";
            const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
            const amount = "1000000000000000000"; // 1 WETH

            const baseUrl = this.baseUrl.replace(/\/$/, '');
            
            // Direct 0x API format
            const params = new URLSearchParams({
                chainId: this.chainId.toString(),
                sellToken: WETH,
                buyToken: USDC,
                sellAmount: amount,
                taker: this.takerAddress
            });
            const url = `${baseUrl}/swap/permit2/quote?${params.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders()
            });

            return response.ok;
        } catch (error) {
            console.warn("0x health check failed:", error instanceof Error ? error.message : error);
            return false;
        }
    }
}
