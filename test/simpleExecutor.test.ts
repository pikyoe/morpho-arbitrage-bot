import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runSimpleExecutor } from "../scripts/executor/simpleExecutor.ts";
import { readExecutionSummary } from "../scripts/utils/monitoring.ts";

describe("simpleExecutor", function () {
  it("writes a success summary", async function () {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "executor-test-"));
    const filePath = path.join(tempDir, "summary.json");

    const result = await runSimpleExecutor(filePath, "0xabc");

    assert.equal(result.status, "success");
    assert.equal(result.txHash, "0xabc");

    await rm(tempDir, { recursive: true, force: true });
  });

  it("retries once when the first attempt fails", async function () {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "executor-retry-"));
    const filePath = path.join(tempDir, "summary.json");
    let attempts = 0;

    const result = await runSimpleExecutor(filePath, "0xretry", {
      maxAttempts: 3,
      retryDelayMs: 1,
      executor: async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error("temporary failure");
        }
        return { ok: true };
      }
    });

    assert.equal(result.status, "success");
    assert.equal(attempts, 2);

    const summary = await readExecutionSummary(filePath);
    assert.equal(summary.status, "success");
    assert.equal(summary.attempts, 2);

    await rm(tempDir, { recursive: true, force: true });
  });
});
