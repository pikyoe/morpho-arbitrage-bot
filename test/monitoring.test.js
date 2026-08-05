import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeExecutionSummary, readExecutionSummary } from "../dist/scripts/utils/monitoring.js";

describe("monitoring", function () {
  it("writes and reads an execution summary", async function () {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "flashloan-monitor-"));
    const filePath = path.join(tempDir, "execution.json");

    const summary = {
      status: "success",
      txHash: "0xabc",
      engine: "0x123",
      wrapper: "0x456",
      profit: "0"
    };

    await writeExecutionSummary(filePath, summary);
    const loaded = await readExecutionSummary(filePath);

    assert.deepEqual(loaded, summary);

    await rm(tempDir, { recursive: true, force: true });
  });
});
