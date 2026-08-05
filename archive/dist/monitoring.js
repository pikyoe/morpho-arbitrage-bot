import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export async function writeExecutionSummary(filePath, summary) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(summary, null, 2));
}
export async function readExecutionSummary(filePath) {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
}
