# Morpho Arbitrage Bot

## Ringkasan

Proyek ini adalah bot arbitrage berbasis Morpho flash loans dengan adapter DEX V2.

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
