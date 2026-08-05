export interface CircuitBreakerConfig {
    // Maximum consecutive failures before opening
    maxConsecutiveFailures: number;

    // Timeout in milliseconds before attempting to close circuit
    cooldownPeriod: number;

    // Maximum gas price (in gwei) before blocking transactions
    maxGasPriceGwei: number;

    // Maximum number of transactions per minute
    maxTxsPerMinute: number;

    // Minimum balance required (in ETH)
    minBalanceETH: number;
}

export interface CircuitBreakerState {
    isOpen: boolean;

    lastFailureTime: number;

    consecutiveFailures: number;

    totalFailures: number;

    txCount: number;

    windowStartTime: number;
}

export class CircuitBreaker {

    private state: CircuitBreakerState = {
        isOpen: false,
        lastFailureTime: 0,
        consecutiveFailures: 0,
        totalFailures: 0,
        txCount: 0,
        windowStartTime: Date.now()
    };

    constructor(
        private readonly config: CircuitBreakerConfig
    ) {}

    // Check if circuit is open (blocking operations)
    isOpen(): boolean {
        if (!this.state.isOpen) {
            return false;
        }

        // Check if cooldown period has passed
        const now = Date.now();
        if (now - this.state.lastFailureTime > this.config.cooldownPeriod) {
            console.log("Circuit breaker cooldown period passed, attempting to close...");
            this.close();
            return false;
        }

        return true;
    }

    // Record a successful operation
    recordSuccess(): void {
        this.state.consecutiveFailures = 0;
        this.state.txCount++;

        // Reset tx counter if window has passed
        const now = Date.now();
        if (now - this.state.windowStartTime > 60000) { // 1 minute window
            this.state.txCount = 0;
            this.state.windowStartTime = now;
        }

        console.log("Circuit breaker: Success recorded, consecutive failures reset");
    }

    // Record a failed operation
    recordFailure(error?: string): void {
        this.state.consecutiveFailures++;
        this.state.totalFailures++;
        this.state.lastFailureTime = Date.now();

        console.log(`Circuit breaker: Failure recorded (${this.state.consecutiveFailures}/${this.config.maxConsecutiveFailures})`);

        // Open circuit if threshold reached
        if (this.state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
            this.open();
        }
    }

    // Manually open the circuit
    open(): void {
        this.state.isOpen = true;
        this.state.lastFailureTime = Date.now();
        console.error("🚨 CIRCUIT BREAKER OPENED - Operations blocked");
    }

    // Manually close the circuit
    close(): void {
        this.state.isOpen = false;
        this.state.consecutiveFailures = 0;
        console.log("✅ Circuit breaker closed - Operations resumed");
    }

    // Check if transaction rate limit would be exceeded
    wouldExceedRateLimit(): boolean {
        const now = Date.now();

        // Reset counter if window has passed
        if (now - this.state.windowStartTime > 60000) {
            this.state.txCount = 0;
            this.state.windowStartTime = now;
            return false;
        }

        return this.state.txCount >= this.config.maxTxsPerMinute;
    }

    // Check if gas price is too high
    isGasPriceTooHigh(currentGasPriceGwei: number): boolean {
        if (currentGasPriceGwei > this.config.maxGasPriceGwei) {
            console.warn(`Gas price too high: ${currentGasPriceGwei} gwei (max: ${this.config.maxGasPriceGwei} gwei)`);
            return true;
        }
        return false;
    }

    // Get current state
    getState(): CircuitBreakerState {
        return { ...this.state };
    }

    // Reset circuit breaker (for manual intervention)
    reset(): void {
        this.state = {
            isOpen: false,
            lastFailureTime: 0,
            consecutiveFailures: 0,
            totalFailures: 0,
            txCount: 0,
            windowStartTime: Date.now()
        };
        console.log("Circuit breaker reset to initial state");
    }

    // Get statistics
    getStats(): {
        isOpen: boolean;
        consecutiveFailures: number;
        totalFailures: number;
        txCount: number;
        uptime: number;
    } {
        const uptime = Date.now() - this.state.windowStartTime;
        return {
            isOpen: this.state.isOpen,
            consecutiveFailures: this.state.consecutiveFailures,
            totalFailures: this.state.totalFailures,
            txCount: this.state.txCount,
            uptime
        };
    }
}