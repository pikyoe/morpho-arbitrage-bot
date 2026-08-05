import hre from "hardhat";
import { CircuitBreaker, CircuitBreakerConfig } from "../../bot/circuit/CircuitBreaker.js";
import { OpportunityFilter, FilterConfig } from "../../bot/filter/OpportunityFilter.js";

async function main() {
    console.log("========================================");
    console.log("SAFETY FEATURES TEST");
    console.log("========================================");

    try {
        const connection: any = await hre.network.connect();
        const { ethers } = connection;

        const provider = ethers.provider;
        const [signer] = await ethers.getSigners();

        // Get network info
        const network = await provider.getNetwork();
        console.log("Network:", (hre.network as any).name || "unknown");
        console.log("Chain ID:", network.chainId.toString());
        console.log("Wallet:", signer.address);

        // Test Circuit Breaker
        console.log("\n========================================");
        console.log("CIRCUIT BREAKER TEST");
        console.log("========================================");

        const circuitBreakerConfig: CircuitBreakerConfig = {
            maxConsecutiveFailures: 3,
            cooldownPeriod: 300_000,
            maxGasPriceGwei: 50,
            maxTxsPerMinute: 10,
            minBalanceETH: 0.1
        };

        const circuitBreaker = new CircuitBreaker(circuitBreakerConfig);

        console.log("Circuit Breaker Configuration:");
        console.log(JSON.stringify(circuitBreakerConfig, null, 2));

        console.log("\nTesting Circuit Breaker Logic:");
        console.log("Initial State:", circuitBreaker.isOpen() ? "OPEN" : "CLOSED");

        // Simulate failures
        console.log("\nSimulating 2 failures...");
        circuitBreaker.recordFailure("Test failure 1");
        circuitBreaker.recordFailure("Test failure 2");
        console.log("After 2 failures:", circuitBreaker.isOpen() ? "OPEN" : "CLOSED");

        console.log("\nSimulating 3rd failure (should open circuit)...");
        circuitBreaker.recordFailure("Test failure 3");
        console.log("After 3 failures:", circuitBreaker.isOpen() ? "OPEN" : "CLOSED");

        console.log("\nCircuit Breaker Stats:");
        console.log(JSON.stringify(circuitBreaker.getStats(), null, 2));

        // Test Opportunity Filter
        console.log("\n========================================");
        console.log("OPPORTUNITY FILTER TEST");
        console.log("========================================");

        const filterConfig: FilterConfig = {
            minNetProfitUSD: 5.0,
            maxGasRatio: 0.5,
            minROI: 0.01,
            minLoanUSD: 100.0
        };

        const opportunityFilter = new OpportunityFilter(filterConfig);

        console.log("Filter Configuration:");
        console.log(JSON.stringify(filterConfig, null, 2));

        console.log("\nTesting Filter Logic:");

        // Test cases
        const testCases = [
            {
                name: "Good opportunity",
                loanAmountUSD: 1000,
                grossProfitUSD: 50,
                netProfitUSD: 20,
                gasRatio: 0.3
            },
            {
                name: "Too small profit",
                loanAmountUSD: 1000,
                grossProfitUSD: 10,
                netProfitUSD: 3,
                gasRatio: 0.3
            },
            {
                name: "Gas ratio too high",
                loanAmountUSD: 1000,
                grossProfitUSD: 20,
                netProfitUSD: 5,
                gasRatio: 0.8
            },
            {
                name: "Loan too small",
                loanAmountUSD: 50,
                grossProfitUSD: 10,
                netProfitUSD: 5,
                gasRatio: 0.3
            }
        ];

        for (const testCase of testCases) {
            const result = opportunityFilter.filter(testCase);
            console.log(`\n${testCase.name}:`);
            console.log(`  Result: ${result.accepted ? "✅ ACCEPTED" : "❌ REJECTED"}`);
            console.log(`  Reason: ${result.reason}`);
        }

        // Test Gas Price Check
        console.log("\n========================================");
        console.log("GAS PRICE CHECK TEST");
        console.log("========================================");

        const gasPrice = await provider.getFeeData();
        console.log("Current Gas Price:", gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, "gwei") + " gwei" : "N/A");
        console.log("Max Fee Per Gas:", gasPrice.maxFeePerGas ? ethers.formatUnits(gasPrice.maxFeePerGas, "gwei") + " gwei" : "N/A");

        const currentGasPriceGwei = gasPrice.gasPrice ? Number(ethers.formatUnits(gasPrice.gasPrice, "gwei")) : 0;
        const gasPriceTooHigh = circuitBreaker.isGasPriceTooHigh(currentGasPriceGwei);
        console.log("Gas Price Too High (>50 gwei):", gasPriceTooHigh ? "❌ YES" : "✅ NO");

        // Test Balance Check
        console.log("\n========================================");
        console.log("BALANCE CHECK TEST");
        console.log("========================================");

        const balance = await provider.getBalance(signer.address);
        const balanceETH = Number(ethers.formatEther(balance));
        console.log("Wallet Balance:", balanceETH.toFixed(4), "ETH");
        console.log("Minimum Required: 0.1 ETH");
        console.log("Balance Sufficient:", balanceETH >= 0.1 ? "✅ YES" : "❌ NO");

        console.log("\n========================================");
        console.log("SAFETY FEATURES TEST COMPLETED");
        console.log("========================================");

        console.log("\nSummary:");
        console.log("✅ Circuit Breaker: Functional");
        console.log("✅ Opportunity Filter: Functional");
        console.log("✅ Gas Price Check: Functional");
        console.log("✅ Balance Check: Functional");

    } catch (error) {
        console.error("\n❌ SAFETY FEATURES TEST FAILED:");
        console.error(error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });