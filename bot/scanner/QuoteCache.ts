import { QuoteResult } from "./quote/index.js";

interface CachedQuote {
    result: QuoteResult;
    timestamp: number;
}

export class QuoteCache {
    private cache: Map<string, CachedQuote>;
    private ttl: number; // Time to live in milliseconds

    constructor(ttl: number = 3000) {
        this.cache = new Map();
        this.ttl = ttl;
    }

    private generateKey(tokenIn: string, tokenOut: string, amountIn: bigint, dex: string, pool?: string): string {
        const baseKey = `${tokenIn.toLowerCase()}-${tokenOut.toLowerCase()}-${amountIn.toString()}-${dex}`;
        return pool ? `${baseKey}-${pool.toLowerCase()}` : baseKey;
    }

    set(tokenIn: string, tokenOut: string, amountIn: bigint, dex: string, result: QuoteResult, pool?: string): void {
        const key = this.generateKey(tokenIn, tokenOut, amountIn, dex, pool);
        this.cache.set(key, {
            result,
            timestamp: Date.now()
        });
    }

    get(tokenIn: string, tokenOut: string, amountIn: bigint, dex: string, pool?: string): QuoteResult | null {
        const key = this.generateKey(tokenIn, tokenOut, amountIn, dex, pool);
        const cached = this.cache.get(key);

        if (!cached) {
            return null;
        }

        // Check if cache entry is expired
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return cached.result;
    }

    getMultiple(tokenIn: string, tokenOut: string, amountIn: bigint, dex: string): QuoteResult[] {
        const results: QuoteResult[] = [];
        const now = Date.now();

        for (const [key, cached] of this.cache.entries()) {
            // Check if key matches pattern (simple matching)
            if (key.includes(`${tokenIn.toLowerCase()}-${tokenOut.toLowerCase()}-${amountIn.toString()}-${dex}`)) {
                if (now - cached.timestamp <= this.ttl) {
                    results.push(cached.result);
                } else {
                    this.cache.delete(key);
                }
            }
        }

        return results;
    }

    clear(): void {
        this.cache.clear();
    }

    cleanup(): void {
        const now = Date.now();
        for (const [key, cached] of this.cache.entries()) {
            if (now - cached.timestamp > this.ttl) {
                this.cache.delete(key);
            }
        }
    }

    size(): number {
        return this.cache.size;
    }

    getStats(): { size: number; ttl: number } {
        return {
            size: this.cache.size,
            ttl: this.ttl
        };
    }
}

// Singleton instance
let quoteCache: QuoteCache | null = null;

export function getQuoteCache(ttl: number = 3000): QuoteCache {
    if (!quoteCache) {
        quoteCache = new QuoteCache(ttl);
    }
    return quoteCache;
}