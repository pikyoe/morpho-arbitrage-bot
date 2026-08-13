# SushiSwap and PancakeSwap Adapter Decision

## Scope
This document records the local compatibility decision for Base router addresses in `.env.mainnet`. It does not authorize or execute a deployment or engine registration transaction.

## Existing adapter contract
`contracts/v2/adapters/UniswapV3AdapterV2.sol` calls:

- `IUniswapV3Router.exactInputSingle(ExactInputSingleParams)`
- `tokenIn`, `tokenOut`, `uint24 fee`, `recipient`, `amountIn`, `amountOutMinimum`, and `sqrtPriceLimitX96`
- recipient is the configured engine
- `Strategy.SwapStep.data` is not decoded by this adapter; the adapter uses the typed step fields

## Evidence in the repository

- `bot/scanner/abis/SushiSwapQuoter.ts` defines the V3-shaped `quoteExactInputSingle` parameter set.
- `bot/scanner/abis/PancakeSwapQuoter.ts` defines the same V3-shaped `quoteExactInputSingle` parameter set.
- `SushiSwapDexProvider.ts` and `PancakeSwapDexProvider.ts` discover V3 pools using `(tokenIn, tokenOut, fee)` and return `tokenIn`, `tokenOut`, `amountIn`, `amountOut`, and `fee`.
- `.env.mainnet` provides the Base router addresses under `SUSHISWAP_ROUTER` and `PANCAKESWAP_ROUTER_ADDRESS`.

## Decision

- SushiSwap: reuse `UniswapV3AdapterV2` and deploy a separate instance configured with the SushiSwap router address. The deployed address is still recorded as `SUSHISWAP_ADAPTER_V2_ADDRESS`.
- PancakeSwap: reuse `UniswapV3AdapterV2` and deploy a separate instance configured with the PancakeSwap router address. The deployed address is still recorded as `PANCAKESWAP_ADAPTER_V2_ADDRESS`.
- No duplicate Solidity adapter contracts are created by this decision.

## Deployment scripts

- `scripts/mainnet/deploySushiSwapAdapterV2.ts`
- `scripts/mainnet/deployPancakeSwapAdapterV2.ts`

Both scripts validate the chain, owner, router, and engine before calling `Factory.deploy`. They print only public deployment information. They do not run unless explicitly invoked by the operator.

## Required post-deployment actions

1. Add each mined adapter address to `.env.mainnet` manually.
2. Verify bytecode, owner, engine, and router through Base RPC.
3. Execute `setApprovedAdapter(adapter, true)` only after reviewing the final addresses.
4. Verify `approvedAdapter(adapter) == true`.
5. Keep `WATCH_ENABLE_EXECUTION=false` until all checks pass.

## Caveat
The local quote ABIs and provider code establish the intended V3-compatible interface. The deployment scripts must still be tested against the configured Base router bytecode before any production transaction is sent. If a router rejects the typed `exactInputSingle` call, deployment must stop and a DEX-specific adapter is required.
