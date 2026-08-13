# Existing Deployment Verification

Date: 2026-08-13
Network: Base (chain ID 8453)
Expected deployer/owner: `0x5E2F886b10a49685317De61f521b0Cfa59579d60`

## Bytecode

| Contract | Address | Bytecode |
|---|---|---|
| MorphoFlashLoanV2 | `0x9372a039638Ff82eD316Bc8Ee5f0A888AcE039C8` | present |
| ArbitrageEngineV2 | `0x910aCcFf26a829e0D2b282f6B5745B92d44c6AE1` | present |
| UniswapV3AdapterV2 | `0x41ad307453822E4529877a8391D086dBFcB461Fa` | present |
| AerodromeAdapterV2 | `0x2e869A066DbC3bE823B50bB9D7DDF62263eF443A` | present |

## Wiring

- `engine.owner()` = `0x5E2F886b10a49685317De61f521b0Cfa59579d60`; expected match: true
- `engine.morphoFlashLoan()` = `0x9372a039638Ff82eD316Bc8Ee5f0A888AcE039C8`; configured match: true
- `engine.authorizedCaller(deployer)` = `true`
- `engine.approvedAdapter(uniswap)` = `true`
- `engine.approvedAdapter(aerodrome)` = `true`
- Uniswap adapter owner matches expected: true
- Uniswap adapter engine matches configured engine: true
- Uniswap adapter router matches configured router: true
- Aerodrome adapter owner matches expected: true
- Aerodrome adapter engine matches configured engine: true
- Aerodrome adapter router matches configured router: true

## Creation records

Creation transaction hash and transaction `from`: `unavailable` from the standard Base RPC provider used by the read-only script. No creation sender was inferred from local source or deployment configuration.

## Command

`ENV_FILE=.env.mainnet npx tsx scripts/mainnet/verifyExistingDeployments.ts`
