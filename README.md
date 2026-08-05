# Morpho Arbitrage Bot

## Ringkasan

Proyek ini adalah bot arbitrage berbasis Morpho flash loans dengan adapter DEX V2 yang dilengkapi dengan safety features untuk production deployment di Base mainnet.

## ✨ Fitur Baru (Production-Ready)

### 🔒 Keamanan & Safety
- **Circuit Breaker**: Otomatis stop operasi setelah 3 consecutive failures
- **Configuration Validation**: Validasi environment variables sebelum startup
- **Rate Limiting**: Maksimal 10 transaksi per menit
- **Gas Price Protection**: Block eksekusi jika gas > 50 gwei
- **Balance Check**: Minimum balance requirement sebelum eksekusi

### 💹 Risk Management
- **Opportunity Filter**: Filter berdasarkan:
  - Minimum net profit: $5
  - Maximum gas ratio: 50%
  - Minimum ROI: 1%
  - Minimum loan size: $100
- **Deduplication**: Hindari processing opportunity yang sama
- **Position Sizing**: Optimal size calculation

### 🛡️ MEV Protection (Flashbots)
- **Flashbots Integration**: Protection dari front-running dan sandwich attacks
- **Smart Routing**: Otomatis pilih antara Flashbots vs public mempool
- **Profit Threshold**: Gunakan Flashbots hanya untuk profitable transactions
- **Fallback Mechanism**: Otomatis fallback ke public mempool jika Flashbots gagal
- **Dynamic Configuration**: Adjustable thresholds dan retry logic

### ⚡ Performance
- **Dynamic Gas Management**: EIP-1559 support dengan automatic gas adjustment
- **Error Classification**: Smart retry logic berdasarkan error type
- **Exponential Backoff**: Automatic retry dengan delay yang meningkat
- **Gas Estimation**: Dynamic gas limit calculation

### 🛠️ Reliability
- **Error Handling**: Comprehensive error classification dan recovery
- **Graceful Shutdown**: Proper cleanup pada SIGINT/SIGTERM
- **Logging**: Structured logging untuk monitoring
- **State Tracking**: Opportunity repository dengan TTL

### Struktur aktif vs legacy

- Implementasi aktif saat ini berada di folder [contracts/v2](contracts/v2) dan script deployment/testing di [scripts/v2](scripts/v2) serta [scripts/mainnet](scripts/mainnet).
- File lama di root [contracts](contracts) dan [contracts/adapters](contracts/adapters) masih ada sebagai referensi legacy/v1 dan tidak digunakan oleh alur V2 yang sekarang.
- Beberapa file memiliki nama yang sama di folder berbeda (misalnya adapter V2 di [contracts/adapters/UniswapV3AdapterV2.sol](contracts/adapters/UniswapV3AdapterV2.sol) dan [contracts/v2/adapters/UniswapV3AdapterV2.sol](contracts/v2/adapters/UniswapV3AdapterV2.sol)); untuk deployment dan debugging, gunakan yang ada di folder [contracts/v2](contracts/v2).

- Kontrak utama V2:
  - `ArbitrageEngineV2`
  - `MorphoFlashLoanV2`
  - `UniswapV3AdapterV2`
  - `AerodromeAdapterV2`
- Folder skrip deploy:
  - `scripts/v2/` untuk uji Sepolia
  - `scripts/mainnet/` untuk deploy mainnet

## Environment

Gunakan file `.env.mainnet` untuk deployment mainnet.

Contoh variabel penting:

```dotenv
PRIVATE_KEY=0x...
BASE_RPC_URL=https://mainnet.base.org
MORPHO_ADDRESS=0x...
UNISWAP_ROUTER_ADDRESS=0x...
AERODROME_ROUTER=0x...
```

Setelah deploy, tambahkan alamat yang sudah terdeploy:

```dotenv
MORPHO_FLASHLOAN_V2_ADDRESS=0x...
ARBITRAGE_ENGINE_V2_ADDRESS=0x...
UNISWAP_ADAPTER_V2_ADDRESS=0x...
AERODROME_ADAPTER_V2_ADDRESS=0x...
```

Opsional:

```dotenv
SAMPLE_AUTHORIZED_ADDRESS=0x...
```

## Compile dan test

```bash
npx hardhat compile
npx hardhat test
```

## Deploy & wiring mainnet

1. Deploy `MorphoFlashLoanV2`

```bash
npx hardhat run scripts/mainnet/deployMorphoFlashLoanV2.ts --network base
```

2. Deploy adapter V2

```bash
npx hardhat run scripts/mainnet/deployUniswapAdapterV2.ts --network base
```

atau untuk Aerodrome:

```bash
npx hardhat run scripts/mainnet/deployAerodromeAdapterV2.ts --network base
```

3. Deploy `ArbitrageEngineV2`

```bash
npx hardhat run scripts/mainnet/deployArbitrageEngineV2.ts --network base
```

4. Set `MorphoFlashLoanV2.engine`

```bash
npx hardhat run scripts/mainnet/setMorphoEngineV2.ts --network base
```

5. Set adapter engine

```bash
npx hardhat run scripts/mainnet/setAdapterEngineV2.ts --network base
```

6. Validasi wiring

```bash
npx hardhat run scripts/mainnet/checkWiringV2.ts --network base
```

## Uji Sepolia

Gunakan skrip di `scripts/v2/` untuk deploy dan uji di Sepolia.

Contoh:

```bash
npx hardhat run scripts/v2/deployMorphoFlashLoanV2.ts --network baseSepolia
npx hardhat run scripts/v2/deployUniswapV3AdapterV2.ts --network baseSepolia
npx hardhat run scripts/v2/deployArbitrageEngineV2.ts --network baseSepolia
npx hardhat run scripts/v2/setMorphoEngineV2.ts --network baseSepolia
npx hardhat run scripts/v2/setAdapterEngineV2.ts --network baseSepolia
npx hardhat run scripts/v2/checkWiringV2.ts --network baseSepolia
```

## Catatan penting

- `ARBITRAGE_ENGINE=` di `.env.mainnet` tidak digunakan oleh skrip V2.
- Pastikan variabel environment yang dibutuhkan sudah terisi sebelum menjalankan skrip deploy atau wiring.
- Jika kamu ingin deploy ke mainnet, selalu gunakan `--network base` atau pastikan skrip mainnet menggunakan network yang benar.

## 🚀 Menjalankan Bot di Mainnet

### Prerequisites
1. Pastikan semua kontrak sudah di-deploy dan wired dengan benar
2. Environment variables sudah terkonfigurasi di `.env.mainnet`
3. Wallet memiliki cukup ETH untuk gas (minimal 0.1 ETH disarankan)

### Starting the Bot

```bash
# Run bot dengan environment mainnet
npx hardhat run scripts/mainnet/runBot.ts --network base
```

### Configuration Parameters

Di dalam `runBot.ts`, ada beberapa parameter yang bisa disesuaikan:

**Opportunity Filter Config:**
```typescript
const filterConfig: FilterConfig = {
    minNetProfitUSD: 5.0,           // Minimum $5 profit
    maxGasRatio: 0.5,               // Gas max 50% of gross profit
    minROI: 0.01,                   // Minimum 1% ROI
    minLoanUSD: 100.0               // Minimum $100 loan size
};
```

**Circuit Breaker Config:**
```typescript
const circuitBreakerConfig: CircuitBreakerConfig = {
    maxConsecutiveFailures: 3,           // Open after 3 consecutive failures
    cooldownPeriod: 300_000,             // 5 minutes cooldown
    maxGasPriceGwei: 50,                 // Block if gas > 50 gwei
    maxTxsPerMinute: 10,                // Rate limit: 10 tx/min
    minBalanceETH: 0.1                   // Minimum 0.1 ETH balance
};
```

**Flashbots MEV Protection Config:**
```typescript
const flashbotsConfig: FlashbotsConfig = {
    enabled: true,                       // Enable/disable Flashbots
    relayUrl: 'https://relay.flashbots.net',
    minProfitThreshold: 10.0,           // Minimum $10 profit to use Flashbots
    maxRetries: 3,                       // Max retries for Flashbots
    fallbackToPublic: true               // Fallback to public mempool on failure
};
```

## 🔍 Monitoring

### Logs Output
Bot akan mencetak:
- Scan results dan opportunity details
- Circuit breaker status
- Gas prices dan transaction costs
- Error classification dan retry attempts
- Execution summary

### Circuit Breaker Status
Circuit breaker otomatis:
- Membuka setelah 3 consecutive failures
- Menutup setelah cooldown period (5 menit)
- Melakukan rate limiting (max 10 tx/menit)
- Block eksekusi jika gas price terlalu tinggi

## ⚠️ Security Reminders

1. **NEVER commit `.env` files** ke git
2. **Use separate wallets** untuk testing dan mainnet
3. **Rotate private keys** secara berkala
4. **Monitor bot activity** secara rutin
5. **Keep small amounts** di wallet yang digunakan bot
6. **Use hardware wallets** untuk menyimpan dana besar

## �️ MEV Protection dengan Flashbots

### Overview
Bot ini dilengkapi dengan **Flashbots integration** untuk melindungi dari MEV (Maximal Extractable Value) attacks seperti front-running dan sandwich attacks.

### Cara Kerja
1. **Smart Routing**: Bot otomatis memilih antara Flashbots atau public mempool
2. **Profit Threshold**: Flashbots hanya digunakan untuk transactions dengan profit > $10
3. **Protection**: Private mempool melindungi dari MEV bots
4. **Fallback**: Otomatis fallback ke public mempool jika Flashbots gagal

### Configuration
Di `.env.mainnet` atau `.env.sepolia`:

```bash
# Enable/disable Flashbots
FLASHBOTS_ENABLED=true

# Flashbots relay URL (default: https://relay.flashbots.net)
FLASHBOTS_RELAY_URL=https://relay.flashbots.net

# Minimum profit USD untuk menggunakan Flashbots
FLASHBOTS_MIN_PROFIT_USD=10.0

# Maximum retries untuk Flashbots
FLASHBOTS_MAX_RETRIES=3

# Fallback ke public mempool jika Flashbots gagal
FLASHBOTS_FALLBACK_TO_PUBLIC=true
```

### Keuntungan Flashbots
- ✅ **Free to use** - Hanya optional tips
- ✅ **High protection** - 80-90% protection dari MEV attacks
- ✅ **Low complexity** - Mudah diimplementasikan
- ✅ **Widely adopted** - Battle-tested di production

### Upgrade Path
Setelah profit stabil, bisa upgrade ke:
- **Private mempool** (Alchemy, Infura Pro) - $50-200/month
- **Custom MEV protection** - Advanced strategies
- **Hybrid approach** - Kombinasi berbagai methods

## �🛠️ Troubleshooting

### Bot tidak start
- Cek configuration validation: `ConfigValidator.validateOrThrow()`
- Pastikan semua environment variables terisi
- Verifikasi RPC URL connectivity

### Transaksi gagal terus
- Cek circuit breaker status
- Verifikasi wallet balance
- Pastikan gas price reasonable
- Cek jika kontrak masih paused

### Opportunity tidak ditemukan
- Verifikasi factory addresses
- Cek pool liquidity
- Adjust filter parameters
- Pastikan price oracle berfungsi
