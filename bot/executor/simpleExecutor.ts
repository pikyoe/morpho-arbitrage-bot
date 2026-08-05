import { writeExecutionSummary } from "../../scripts/utils/monitoring.js";

export interface SimpleExecutorResult {
  status: "success" | "failed" | "pending";
  txHash?: string;
  error?: string;
  attempts?: number;
}

export interface SimpleExecutorOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  executor?: () => Promise<unknown>;
}

export async function runSimpleExecutor(
  filePath: string,
  txHash: string,
  options: SimpleExecutorOptions = {}
): Promise<SimpleExecutorResult> {
  const maxAttempts = options.maxAttempts ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 0;
  const executor = options.executor ?? (async () => ({ ok: true }));

  let lastError: Error | undefined;
  let attempts = 0;

  for (attempts = 1; attempts <= maxAttempts; attempts += 1) {
    try {
      await executor();
      const summary = {
        status: "success" as const,
        txHash,
        engine: "0x0000000000000000000000000000000000000000",
        wrapper: "0x0000000000000000000000000000000000000000",
        profit: "0",
        attempts
      };

      await writeExecutionSummary(filePath, summary);
      return summary;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempts >= maxAttempts) {
        break;
      }
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  const failedSummary = {
    status: "failed" as const,
    txHash,
    error: lastError?.message,
    attempts
  };

  await writeExecutionSummary(filePath, failedSummary);
  return failedSummary;
}
