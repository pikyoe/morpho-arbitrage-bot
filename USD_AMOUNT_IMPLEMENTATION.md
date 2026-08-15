# USD-Equivalent Test Amounts Implementation

## Overview
This implementation converts all test amounts to USD-equivalent values to ensure fair comparison across tokens and avoid extreme price impact on non-stablecoin tokens.

## Problem
Previously, the bot used fixed token amounts (e.g., 0.01 WETH ~$19 instead of $100 worth of WETH). This caused:
- **Inconsistent testing**: Different tokens had vastly different USD values
- **Extreme price impact**: Testing with too much WETH relative to pool liquidity
- **Unfair arbitrage detection**: Opportunities not properly evaluated on USD basis

## Solution
Implemented USD-based conversion that ensures all test amounts represent the same USD value across different tokens.

## Files Modified

### 1. New File: `bot/utils/USDAmountConverter.ts`
**Purpose**: Central utility for USD-to-token conversion

**Key Functions**:
- `convertUSDToTokenAmount(usdAmount, tokenAddress)`: Converts USD value to token-specific amount
- `convertUSDToUSDC(usdAmount)`: Converts USD to USDC (6 decimals)
- `getTokenPriceUSD(tokenAddress)`: Gets token price in USD
- `updateTokenPrice(tokenAddress, priceUSD)`: Updates token price dynamically

**Token Prices**: Fallback prices for discovery (WETH: $1,900, CBBTC: $95,000, etc.)

### 2. `scripts/mainnet/runBot.ts`
**Changes**:
- Imported `convertUSDToUSDC` from `USDAmountConverter`
- Changed `TEST_AMOUNTS` from fixed USDC amounts to USD-based amounts
- Updated to use `TEST_AMOUNTS_USD` array: [100, 500, 1000, 2000, 5000, 10000]
- Convert USD amounts to USDC for compatibility
- Pass `TEST_AMOUNTS` (now USD-equivalent) to `collectExecutableEdges`

### 3. `bot/scanner/DiscrepancyDiscoveryEngine.ts`
**Changes**:
- Updated `collectExecutableEdges` signature to accept `testAmounts: bigint[]` instead of single `testAmount`
- Added loop to test each USD amount per token pair
- Updated logging to show USD values being tested
- Each token pair now tested with multiple USD amounts for comprehensive discovery

### 4. `bot/executor/ExecutionGuard.ts`
**Changes**:
- Imported `TOKEN_DECIMALS` from `TokenList` (removed duplicate)
- Imported `convertUSDToTokenAmount` from `USDAmountConverter`
- Updated `findOptimalAmount` signature:
  - Changed `minAmount/maxAmount` from bigint to `minAmountUSD/maxAmountUSD` (number)
  - Added `tokenAddress` parameter for USD-to-token conversion
- Generate USD test amounts first, then convert to token-specific amounts
- Updated logging to show USD values instead of USDC-only values
- Return USD-equivalent optimal amount

### 5. `scripts/mainnet/testOptimizedConfig.ts`
**Changes**:
- Imported `convertUSDToUSDC` from `USDAmountConverter`
- Changed `TEST_AMOUNTS` from WETH-based to USD-based
- Updated `TEST_AMOUNTS_USD` array: [30, 150, 300, 1500, 3000]
- Convert USD amounts to USDC for compatibility
- Updated logging to show USD values

## Example Conversion

### Before:
- WETH: 0.01 WETH = ~$19 USD
- USDC: 100 USDC = $100 USD
- VIRTUAL: 100 VIRTUAL = ~$150 USD

### After:
- WETH: $100 USD = 0.0526 WETH (100/1900)
- USDC: $100 USD = 100 USDC (100/1)
- VIRTUAL: $100 USD = 66.67 VIRTUAL (100/1.5)

## Benefits

1. **Fair Comparison**: All tokens tested with same USD value
2. **Reduced Price Impact**: Test amounts proportional to token price
3. **Better Opportunity Detection**: Arbitrage evaluated on consistent USD basis
4. **Flexible Sizing**: Easy to adjust test amounts by changing USD values
5. **Future-Ready**: Can integrate with PriceOracle for dynamic pricing

## Usage Example

```typescript
import { convertUSDToTokenAmount, convertUSDToUSDC } from "./utils/USDAmountConverter";

// Define USD amounts
const usdAmounts = [100, 500, 1000, 2000, 5000, 10000];

// Convert to USDC for compatibility
const testAmounts = usdAmounts.map(amount => convertUSDToUSDC(amount));

// Convert USD to token-specific amount for WETH
const wethAmount = convertUSDToTokenAmount(100, TOKENS.WETH);
// Result: 0.0526 WETH (assuming $1,900 per WETH)
```

## Next Steps

1. **Integrate PriceOracle**: Replace fallback prices with real-time prices from PriceOracle
2. **Dynamic Price Updates**: Use `updateTokenPrice` to keep prices current
3. **Profit Calculation**: Ensure all profit calculations use USD-equivalent values
4. **Testing**: Run discovery with new USD-equivalent amounts to verify improved results

## Notes

- Fallback prices are estimates for discovery phase
- Production should use PriceOracle for accurate pricing
- Token decimals automatically handled by conversion functions
- All amounts in USD for easy configuration and understanding
