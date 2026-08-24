# Morpho Arbitrage Bot

Bot arbitrage berbasis Morpho flash loans dengan adapter DEX V2 untuk Base mainnet.
Bot utama: `scripts/mainnet/watchAndExecute.ts`.

## Struktur

- `contracts/v2/` — kontrak aktif:
  - `core/ArbitrageEngineV2.sol` — engine eksekusi route (flash-loan receiver)
  - `core/MorphoFlashLoanV2.sol` — wrapper flash loan Morpho
  - `adapters/` — UniswapV3, Aerodrome, PancakeSwapV3, 1inch
- `bot/` — modul TypeScript yang dipakai watcher (scanner, quote providers, executor)
- `bot/mcp/server.ts` — MCP server read-only (antarmuka AI agent)
- `bot/scanner/DexScreenerClient.ts` — discovery token trending via DexScreener
- `scripts/mainnet/` — deploy, wiring, diagnostik, dan bot utama
- `scripts/v2/` — deploy & uji di Base Sepolia
- `scripts/utils/` — util deploy/monitoring/config

## Fitur keamanan & risk management

### On-chain (kontrak)
- Access control: `onlyOwner` / `onlyEngine` / `onlyMorpho` / `onlyFlashLoan`
- Pausable di engine dan wrapper
- Validasi route: closed cycle, hanya adapter yang di-approve, `minAmountOut` per leg
- Floor `minProfit` on-chain; revert `InsufficientProfit` jika tidak tercapai
- Guard `InProgress` mencegah flash loan tumpang tindih
- Fungsi `rescueToken`/`rescueETH` terbatas owner

### Off-chain (watcher)
- **Fail-closed execution**: transaksi hanya jika `WATCH_ENABLE_EXECUTION=true`
- **Preflight simulation**: `eth_call` penuh sebelum kirim transaksi
- **Fresh-quote gate**: re-quote tepat sebelum eksekusi untuk memastikan spread masih hidup
- **Execution cooldown**: route yang gagal diblokir sementara agar tidak membakar gas berulang
- **Gas pricing**: estimasi L2 + L1 data fee via OP GasPriceOracle; skip jika gas tidak bisa dihargai
- **Quote outlier filter**: membuang quote stale/dust
- Validasi chain ID 8453 saat startup

## Environment

Gunakan file `.env.mainnet` untuk mainnet (lihat `.env.example`).

Variabel penting:

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

## Compile dan test

```bash
npm run compile
npm test
```

## Deploy & wiring mainnet

1. Deploy `MorphoFlashLoanV2`

```bash
npx hardhat run scripts/mainnet/deployMorphoFlashLoanV2.ts --network base
```

2. Deploy adapter V2

```bash
npx hardhat run scripts/mainnet/deployUniswapAdapterV2.ts --network base
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

Gunakan skrip di `scripts/v2/` untuk deploy dan uji di Base Sepolia:

```bash
npx hardhat run scripts/v2/deployMorphoFlashLoanV2.ts --network baseSepolia
npx hardhat run scripts/v2/deployUniswapV3AdapterV2.ts --network baseSepolia
npx hardhat run scripts/v2/deployArbitrageEngineV2.ts --network baseSepolia
npx hardhat run scripts/v2/checkWiringV2.ts --network baseSepolia
```

## Menjalankan bot

### Prerequisites
1. Semua kontrak sudah di-deploy dan wired dengan benar
2. Environment variables terkonfigurasi di `.env.mainnet`
3. Wallet memiliki cukup ETH untuk gas (minimal 0.1 ETH disarankan)

### Start

```bash
npm run bot
# atau langsung:
ENV_FILE=.env.mainnet npx tsx scripts/mainnet/watchAndExecute.ts
```

Bot berjalan dalam mode watch-only secara default. Set `WATCH_ENABLE_EXECUTION=true`
di `.env.mainnet` untuk mengaktifkan eksekusi transaksi.

## MCP server (antarmuka AI agent)

`bot/mcp/server.ts` mengekspos kemampuan **read-only** scanner lewat Model Context
Protocol (MCP) sehingga AI agent (Claude Desktop, dsb.) bisa menemukan dan menilai
arbitrase cross-DEX memakai quote provider yang sama dengan watcher — decimals yang
benar, harga USD live (median token→USDC lintas DEX), dan gas L1+L2 via OP
GasPriceOracle. Fee flash loan Morpho = 0%, jadi net = gross − gas.

Server **tidak memakai private key** dan **tidak pernah mengirim transaksi**.

### Menjalankan

```bash
npm run mcp
# atau: ENV_FILE=.env.mainnet npx tsx bot/mcp/server.ts
```

Butuh env RPC dan alamat DEX yang sama dengan watcher (`BASE_RPC_URL`,
`UNISWAP_QUOTER_ADDRESS`, `UNISWAP_FACTORY_ADDRESS`, `SUSHISWAP_*`,
`PANCAKESWAP_*`, `AERODROME_ROUTER_ADDRESS`, `AERODROME_FACTORY_ADDRESS`).
Untuk RPC produksi yang stabil, sediakan `BASE_RPC_URL_1` dan `BASE_RPC_URL_2`
(server memakai `FallbackProvider`). RPC publik gratis sering me-rate-limit
panggilan quoter konkuren dan bisa membuat satu DEX sesaat mengembalikan null.

### Contoh konfigurasi Claude Desktop

```json
{
  "mcpServers": {
    "morpho-arb": {
      "command": "npx",
      "args": ["tsx", "bot/mcp/server.ts"],
      "env": {
        "ENV_FILE": ".env.mainnet",
        "BASE_RPC_URL": "https://mainnet.base.org"
      }
    }
  }
}
```

### Tools

| Tool | Deskripsi |
|------|-----------|
| `detect_arb_opportunity` | Round-trip cross-DEX untuk 1 token (WETH/USDC), net profit setelah gas L1+L2 |
| `get_price_across_dexes` | Harga 1 token di semua DEX aktif + spread bps + harga USD live |
| `get_pool_reserves` | Reserve/liquidity pool token (Aerodrome volatile/stable + tier Uniswap V3) |
| `estimate_flash_profit` | Estimasi net profit flash loan Morpho (fee 0%) untuk 1 token |
| `scan_top_tokens` | Discovery token trending (DexScreener) + scan arb per token |
| `get_token_discovery` | Feed mentah token trending/baru di Base dari DexScreener |

`get_price_across_dexes` dan `estimate_flash_profit` memakai provider yang sama
dengan bot, sehingga hasilnya konsisten dengan keputusan eksekusi watcher.

### Parameter konfigurasi utama (env)

- `WATCH_MODE`: `single` | `all` | `list`
- `WATCH_PAIRS`: daftar pair untuk mode `list` (`"0xAAA,0xBBB;0xCCC,0xDDD"`)
- `SPREAD_THRESHOLD_PCT`: spread minimum (default 0.2%)
- `MIN_NET_PROFIT_USD`: profit bersih minimum setelah gas (default $1)
- `SLIPPAGE_PCT`: toleransi slippage per leg (default 0.5%, clamp 0.05–3%)
- `MIN_PROFIT_BUFFER_PCT`: persen profit kuotasi yang dijadikan floor on-chain (default 50)
- `WATCH_MAX_LOAN_USD`: batas ukuran loan per trade (default $10.000)
- `EXECUTION_COOLDOWN_MS`: cooldown route setelah gagal (default 60.000)

## Monitoring

Bot mencetak:
- Scan results dan spread yang terdeteksi
- Latency per tahap (quote, build route, preflight, eksekusi)
- Status eksekusi dan profit terverifikasi on-chain (event `ArbitrageFinished`)
- Ringkasan statistik saat shutdown (SIGINT/SIGTERM)

## Security reminders

1. **NEVER commit `.env` files** ke git
2. **Use separate wallets** untuk testing dan mainnet
3. **Rotate private keys** secara berkala
4. **Monitor bot activity** secara rutin
5. **Keep small amounts** di wallet yang digunakan bot
6. **Use hardware wallets** untuk menyimpan dana besar

## Troubleshooting

### Bot tidak start
- Pastikan semua environment variables terisi (lihat `.env.example`)
- Verifikasi RPC URL connectivity

### Transaksi gagal terus
- Cek log preflight simulation (revert reason di-decode dari custom errors engine)
- Verifikasi wallet balance
- Route yang gagal otomatis masuk cooldown; cek `EXECUTION_COOLDOWN_MS`

### Opportunity tidak ditemukan
- Verifikasi factory/quoter addresses
- Cek pool liquidity (`MIN_LIQUIDITY_USD`)
- Adjust `SPREAD_THRESHOLD_PCT` / `MIN_NET_PROFIT_USD`
