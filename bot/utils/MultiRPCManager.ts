import { ethers } from "ethers";

export class MultiRPCManager {
    private providers: ethers.JsonRpcProvider[] = [];
    private currentIndex: number = 0;
    private failureCount: Map<number, number> = new Map();
    private maxFailures: number = 3;

    constructor(rpcUrls: string[]) {
        this.providers = rpcUrls.map(url => new ethers.JsonRpcProvider(url));
        console.log("Multi-RPC Manager initialized with", this.providers.length, "RPCs");
    }

    getProvider(): ethers.JsonRpcProvider {
        // Round-robin with simple load balancing
        const provider = this.providers[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.providers.length;
        return provider;
    }

    getProviderByIndex(index: number): ethers.JsonRpcProvider {
        return this.providers[index];
    }

    recordFailure(providerIndex: number): void {
        const current = this.failureCount.get(providerIndex) || 0;
        this.failureCount.set(providerIndex, current + 1);

        if (this.failureCount.get(providerIndex)! >= this.maxFailures) {
            console.warn(`RPC ${providerIndex} has ${this.failureCount.get(providerIndex)} failures, skipping for now`);
        }
    }

    recordSuccess(providerIndex: number): void {
        this.failureCount.set(providerIndex, 0);
    }

    getHealthyProvider(): ethers.JsonRpcProvider {
        // Find a provider with less than max failures
        for (let i = 0; i < this.providers.length; i++) {
            const failures = this.failureCount.get(i) || 0;
            if (failures < this.maxFailures) {
                return this.providers[i];
            }
        }

        // If all failed, reset and return first
        console.warn("All RPCs have failures, resetting");
        this.failureCount.clear();
        return this.providers[0];
    }

    getAllProviders(): ethers.JsonRpcProvider[] {
        return this.providers;
    }

    getStats(): { total: number; failures: Map<number, number> } {
        return {
            total: this.providers.length,
            failures: new Map(this.failureCount)
        };
    }
}

// Singleton instance
let multiRPCManager: MultiRPCManager | null = null;

export function getMultiRPCManager(): MultiRPCManager {
    if (!multiRPCManager) {
        const rpc1 = process.env.BASE_RPC_URL_1 || process.env.BASE_RPC_URL;
        const rpc2 = process.env.BASE_RPC_URL_2 || "";
        
        if (rpc2) {
            multiRPCManager = new MultiRPCManager([rpc1, rpc2]);
        } else {
            // Single RPC fallback
            multiRPCManager = new MultiRPCManager([rpc1]);
        }
    }
    return multiRPCManager;
}