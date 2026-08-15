export class RateLimiter {
    private requests: number[] = [];
    private maxRequests: number;
    private windowMs: number;

    constructor(maxRequests: number = 5, windowMs: number = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    async wait(): Promise<void> {
        const now = Date.now();
        
        // Remove old requests outside the window
        this.requests = this.requests.filter(
            timestamp => now - timestamp < this.windowMs
        );

        // If we've hit the limit, wait
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const waitTime = this.windowMs - (now - oldestRequest);
            
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // Add current request
        this.requests.push(now);
    }

    getRemaining(): number {
        const now = Date.now();
        this.requests = this.requests.filter(
            timestamp => now - timestamp < this.windowMs
        );
        return Math.max(0, this.maxRequests - this.requests.length);
    }
}

// Singleton instances for different operations
export const rpcRateLimiter = new RateLimiter(20, 1000); // 20 requests per second
export const quoteRateLimiter = new RateLimiter(10, 1000); // 10 quotes per second
export const stateRateLimiter = new RateLimiter(15, 1000); // 15 state updates per second
export const zeroXRateLimiter = new RateLimiter(1, 2000); // 1 request per 2 seconds (30 req/min - conservative for free tier)