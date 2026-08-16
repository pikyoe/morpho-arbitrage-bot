<<<<<<< HEAD
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V2 safeguards", function () {
  it("pauses the engine and blocks arbitrage execution", async function () {
    const [owner] = await ethers.getSigners();
    const engine = await ethers.deployContract("ArbitrageEngineV2", [owner.address, owner.address]);

    await expect(engine.setPaused(true))
      .to.emit(engine, "Paused")
      .withArgs(true);

    const route = {
      swaps: [],
      profitToken: owner.address,
      minProfit: 0,
    };

    await expect(engine.executeArbitrage(owner.address, 1000, route)).to.be.revertedWithCustomError(
      engine,
      "InvalidState"
    );
  });

  it("rejects routes that use unapproved adapters", async function () {
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

    await expect(engine.executeArbitrage(owner.address, 1000, route)).to.be.revertedWithCustomError(
      engine,
      "InvalidAdapter"
    );
  });

  it("pauses the flash loan wrapper and blocks requests", async function () {
    const [owner] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MorphoFlashLoanV2", [owner.address, owner.address]);

    await wrapper.setEngine(owner.address);

    await expect(wrapper.setPaused(true))
      .to.emit(wrapper, "Paused")
      .withArgs(true);

    await expect(wrapper.requestFlashLoan(owner.address, 1000, "0x")).to.be.revertedWithCustomError(
      wrapper,
      "InvalidState"
    );
  });
});
=======
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V2 safeguards", function () {
  it("pauses the engine and blocks arbitrage execution", async function () {
    const [owner] = await ethers.getSigners();
    const engine = await ethers.deployContract("ArbitrageEngineV2", [owner.address, owner.address]);

    await expect(engine.setPaused(true))
      .to.emit(engine, "Paused")
      .withArgs(true);

    const route = {
      swaps: [],
      profitToken: owner.address,
      minProfit: 0,
    };

    await expect(engine.executeArbitrage(owner.address, 1000, route)).to.be.revertedWithCustomError(
      engine,
      "InvalidState"
    );
  });

  it("rejects routes that use unapproved adapters", async function () {
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

    await expect(engine.executeArbitrage(owner.address, 1000, route)).to.be.revertedWithCustomError(
      engine,
      "InvalidAdapter"
    );
  });

  it("pauses the flash loan wrapper and blocks requests", async function () {
    const [owner] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MorphoFlashLoanV2", [owner.address, owner.address]);

    await wrapper.setEngine(owner.address);

    await expect(wrapper.setPaused(true))
      .to.emit(wrapper, "Paused")
      .withArgs(true);

    await expect(wrapper.requestFlashLoan(owner.address, 1000, "0x")).to.be.revertedWithCustomError(
      wrapper,
      "InvalidState"
    );
  });
});
>>>>>>> 12717916c10abdf9ee40368b4eb46062d6add995
