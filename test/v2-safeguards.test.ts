<<<<<<< HEAD
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

  it("rejects routes with zero minimum output protection", async function () {
    const ethers = await getEthers();
    const [owner] = await ethers.getSigners();
    const engine = await ethers.deployContract("ArbitrageEngineV2", [owner.address, owner.address]);

    await engine.setApprovedAdapter(owner.address, true);

    const route = {
      swaps: [
        {
          adapter: owner.address,
          tokenIn: owner.address,
          tokenOut: owner.address,
          fee: 3000,
          amountIn: 1000,
          minAmountOut: 0,
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
        assert.match(error.message, /InvalidSlippage/);
        return true;
      }
    );
  });

  it("rejects flash-loan callbacks without a valid prior request", async function () {
    const ethers = await getEthers();
    const [owner] = await ethers.getSigners();
    const engine = await ethers.deployContract("ArbitrageEngineV2", [owner.address, owner.address]);

    await assert.rejects(
      engine.executeOperation(owner.address, 1000, "0x"),
      (error: any) => {
        assert.match(error.message, /InvalidState|InvalidToken|InvalidAmount/);
        return true;
      }
    );
  });

  it("restricts rescue operations to the owner", async function () {
    const ethers = await getEthers();
    const [owner, other] = await ethers.getSigners();
    const engine = await ethers.deployContract("ArbitrageEngineV2", [owner.address, owner.address]);

    await assert.rejects(
      engine.connect(other).rescueToken(owner.address, 1),
      (error: any) => {
        assert.match(error.message, /Ownable|ownable/);
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
=======
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
>>>>>>> 12717916c10abdf9ee40368b4eb46062d6add995
