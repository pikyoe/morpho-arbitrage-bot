import { runSimpleExecutor } from "./simpleExecutor.js";

async function main() {
  const outputPath = process.env.EXEC_SUMMARY_PATH || "./executions/latest.json";
  const txHash = process.env.TX_HASH || "0xexample";

  const result = await runSimpleExecutor(outputPath, txHash);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
