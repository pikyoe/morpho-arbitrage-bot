import { setActiveUniverse, TOKEN_UNIVERSES, recordUniverseMetrics, resetMetrics, compareUniverses, UniverseMetrics } from "../../bot/scanner/TokenUniverse.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Universe Comparison Experiment Script
 * 
 * This script runs the bot with different token universes (A/B/C) and compares:
 * - # triangles found
 * - # executable triangles
 * - # positive gross profit
 * - # positive net profit
 * - max net profit
 * - median net profit
 */

interface ScanResult {
    trianglesFound: number;
    executableTriangles: number;
    positiveGrossProfit: number;
    positiveNetProfit: number;
    maxNetProfit: number;
    scanDuration: number;
}

async function runScan(universeName: keyof typeof TOKEN_UNIVERSES): Promise<ScanResult> {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🧪 Running Universe ${universeName}`);
    console.log(`📋 ${TOKEN_UNIVERSES[universeName].name}`);
    console.log(`📝 ${TOKEN_UNIVERSES[universeName].description}`);
    console.log(`🎯 Tokens: ${TOKEN_UNIVERSES[universeName].tokens.length}`);
    console.log(`${"=".repeat(80)}\n`);

    // Set active universe
    setActiveUniverse(universeName);

    // Run the bot for a fixed duration (3 scan cycles)
    const startTime = Date.now();
    
    try {
        // Run bot with universe-specific configuration
        const { stdout, stderr } = await execAsync(
            `npx dotenv-cli -e .env.mainnet -- npx tsx scripts/mainnet/runBot.ts`,
            { 
                timeout: 180000, // 3 minutes
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            }
        );

        const output = stdout + stderr;
        const endTime = Date.now();
        const scanDuration = (endTime - startTime) / 1000;

        // Parse results from output
        const trianglesFound = parseMetric(output, /Phase B Complete: Found (\d+) profitable triangles/);
        const executableTriangles = parseMetric(output, /Total executable edges: (\d+)/);
        const positiveGrossProfit = parseMetric(output, /positive gross profit: (\d+)/);
        const positiveNetProfit = parseMetric(output, /positive net profit: (\d+)/);
        const maxNetProfit = parsePercentage(output, /max net profit: ([\d.]+)%/);

        return {
            trianglesFound,
            executableTriangles,
            positiveGrossProfit,
            positiveNetProfit,
            maxNetProfit,
            scanDuration
        };
    } catch (error: any) {
        console.error(`❌ Error running universe ${universeName}:`, error.message);
        return {
            trianglesFound: 0,
            executableTriangles: 0,
            positiveGrossProfit: 0,
            positiveNetProfit: 0,
            maxNetProfit: 0,
            scanDuration: 0
        };
    }
}

function parseMetric(output: string, pattern: RegExp): number {
    const match = output.match(pattern);
    return match ? parseInt(match[1], 10) : 0;
}

function parsePercentage(output: string, pattern: RegExp): number {
    const match = output.match(pattern);
    return match ? parseFloat(match[1]) : 0;
}

async function runExperiment() {
    console.log("🔬 Starting Token Universe Comparison Experiment");
    console.log("=" .repeat(80));
    console.log("\nThis experiment will compare three token universes:");
    console.log("  Universe A: 10 Tier-1 high-quality tokens");
    console.log("  Universe B: 10 Tier-1 + 20 Tier-2 tokens (30 total)");
    console.log("  Universe C: All available tokens (baseline)");
    console.log("\nEach universe will be scanned for 3 minutes.");
    console.log("Results will be compared at the end.\n");

    // Reset previous metrics
    resetMetrics();

    // Run each universe
    const universes: (keyof typeof TOKEN_UNIVERSES)[] = ['UNIVERSE_A', 'UNIVERSE_B', 'UNIVERSE_C'];
    
    for (const universe of universes) {
        const result = await runScan(universe);
        
        // Record metrics
        const metrics: UniverseMetrics = {
            universeName: TOKEN_UNIVERSES[universe].name,
            tokenCount: TOKEN_UNIVERSES[universe].tokens.length,
            trianglesFound: result.trianglesFound,
            executableTriangles: result.executableTriangles,
            positiveGrossProfit: result.positiveGrossProfit,
            positiveNetProfit: result.positiveNetProfit,
            maxNetProfit: result.maxNetProfit,
            medianNetProfit: 0, // Would need more detailed parsing
            averageNetProfit: 0, // Would need more detailed parsing
            scanDuration: result.scanDuration
        };
        
        recordUniverseMetrics(metrics);
        
        // Wait between scans
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Compare results
    console.log("\n" + "=".repeat(80));
    console.log("📊 EXPERIMENT COMPLETE - UNIVERSE COMPARISON");
    console.log("=".repeat(80));
    compareUniverses();

    // Summary recommendation
    console.log("\n💡 RECOMMENDATION:");
    console.log("Based on the comparison above, select the universe that provides:");
    console.log("  - The most profitable opportunities");
    console.log("  - Reasonable scan duration");
    console.log("  - Manageable token count for operational efficiency");
    console.log("\nTo use a specific universe in production, update ACTIVE_UNIVERSE in TokenUniverse.ts");
}

// Run the experiment
runExperiment().catch(console.error);
