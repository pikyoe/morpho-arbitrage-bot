import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ExecutionSummary {
  status: "success" | "failed" | "pending";
  txHash?: string;
  engine?: string;
  wrapper?: string;
  profit?: string;
  error?: string;
  attempts?: number;
}

export async function writeExecutionSummary(filePath: string, summary: ExecutionSummary): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(summary, null, 2));
}

export async function readExecutionSummary(filePath: string): Promise<ExecutionSummary> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as ExecutionSummary;
}
