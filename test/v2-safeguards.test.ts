import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

async function getEthers() {
  const connection = await network.create();
  return connection.ethers;
}

describe("V2 safeguards", function () {
  it("pauses the engine and blocks arbitrage execution", async function () {
    const ethers = await getEthers();
    const [owner] = await ethers.getSigners();
    const engine = await ethers.deployContract("ArbitrageEngineV2", [owner.address, owner.address]);

    await engine.setPaused(true);

    const route = {
      swaps: [],
      profitToken: owner.address,
      minProfit: 0,
    };

    await assert.rejects(
      engine.executeArbitrage(owner.address, 1000, route),
      (error: any) => {
        assert.match(error.message, /InvalidState/);
        return true;
      }
    );
  });

  it("rejects routes that use unapproved adapters", async function () {
    const ethers = await getEthers();
    const [owner] = await ethers.getSigners();
    const engine = await ethers.deployContract("ArbitrageEngineV2", [owner.address, owner.address]);

    const route = {
      swaps: [
        {
          adapter: owner.address,
          tokenIn: owner.address,
          tokenOut: owner.address,
          fee: 3000,
          amountIn: 1000,
          minAmountOut: 1,
          data: "0x",
          deadline: 9999999999,
        },
      ],
      profitToken: owner.address,
      minProfit: 0,
    };

    await assert.rejects(
      engine.executeArbitrage(owner.address, 1000, route),
      (error: any) => {
        assert.match(error.message, /InvalidAdapter/);
        return true;
      }
    );
  });

  it("pauses the flash loan wrapper and blocks requests", async function () {
    const ethers = await getEthers();
    const [owner] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MorphoFlashLoanV2", [owner.address, owner.address]);

    await wrapper.setEngine(owner.address);
    await wrapper.setPaused(true);

    await assert.rejects(
      wrapper.requestFlashLoan(owner.address, 1000, "0x"),
      (error: any) => {
        assert.match(error.message, /InvalidState/);
        return true;
      }
    );
  });
});
