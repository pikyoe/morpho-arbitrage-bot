import dotenv from "dotenv";
const envFile = process.env.ENV_FILE || ".env.mainnet";
dotenv.config({
    path: envFile
});
console.log("ENV FILE:", envFile);
console.log("BASE_RPC_URL:", process.env.BASE_RPC_URL);
console.log("UNISWAP_QUOTER_ADDRESS:", process.env.UNISWAP_QUOTER_ADDRESS);
console.log("AERODROME_ROUTER:", process.env.AERODROME_ROUTER);
