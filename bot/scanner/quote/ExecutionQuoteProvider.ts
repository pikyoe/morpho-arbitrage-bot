import { QuoteRequest, QuoteResult } from "./index.js";
import { TriangleCandidate } from "../TriangleDiscoveryEngine.js";

/**
 * Interface for execution quote providers
 * These providers validate discovered triangles and provide executable quotes
 * with gas estimation and slippage protection
 */
export interface ExecutionQuoteProvider {
    /**
     * Validate a triangle candidate for execution
     * @param candidate Triangle candidate from discovery phase
     * @returns true if triangle is executable via this provider
     */
    validateTriangle(candidate: TriangleCandidate): Promise<boolean>;
    
    /**
     * Get executable quote for a triangle
     * @param candidate Triangle candidate from discovery phase
     * @returns Executable quote with gas estimation, or null if not executable
     */
    getExecutableQuote(candidate: TriangleCandidate): Promise<ExecutionQuote | null>;
    
    /**
     * Get the name of this execution provider
     */
    getProviderName(): string;
}

export interface ExecutionQuote {
    provider: string;
    triangle: TriangleCandidate;
    quotes: QuoteResult[]; // Validated quotes for each leg
    estimatedGas: bigint;
    gasPrice: bigint;
    isExecutable: boolean;
}
