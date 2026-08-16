<<<<<<< HEAD
import * as dotenv from "dotenv";
import * as path from "path";

export function loadEnvForNetwork(hre: any) {
  const name = (hre as any).network?.name ?? "";
  const root = process.cwd();

  let envFile = ".env.mainnet";

  if (/sepolia/i.test(name)) {
    envFile = ".env.sepolia";
  }
  else if (/fork|hardhat|localhost/i.test(name)) {
    envFile = ".env.mainnet";
  }
  else if (/base|mainnet/i.test(name)) {
    envFile = ".env.mainnet";
  }

  const full = path.join(root, envFile);
  const result = dotenv.config({ path: full });

  if (result.error) {
    console.warn(`No env file loaded at ${full} (proceeding with existing environment)`);
  } else {
    console.log(`Loaded env file: ${envFile}`);
  }
}

export default loadEnvForNetwork;
=======
import * as dotenv from "dotenv";
import * as path from "path";

export function loadEnvForNetwork(hre: any) {
  const name = (hre as any).network?.name ?? "";
  const root = process.cwd();

  let envFile = ".env";

  if (/sepolia/i.test(name)) {
    envFile = ".env.sepolia";
  } else if (/base/i.test(name) || /mainnet/i.test(name)) {
    envFile = ".env.mainnet";
  }

  const full = path.join(root, envFile);
  const result = dotenv.config({ path: full });

  if (result.error) {
    console.warn(`No env file loaded at ${full} (proceeding with existing environment)`);
  } else {
    console.log(`Loaded env file: ${envFile}`);
  }
}

export default loadEnvForNetwork;
>>>>>>> 12717916c10abdf9ee40368b4eb46062d6add995
