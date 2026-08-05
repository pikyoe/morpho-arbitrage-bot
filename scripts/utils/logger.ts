import { TransactionReceipt, TransactionResponse } from "ethers";

const LINE =
    "============================================================";

const SUBLINE =
    "------------------------------------------------------------";

export function section(title: string): void {
    console.log("");
    console.log(LINE);
    console.log(title.toUpperCase());
    console.log(LINE);
}

export function subSection(title: string): void {
    console.log("");
    console.log(SUBLINE);
    console.log(title);
    console.log(SUBLINE);
}

export function info(label: string, value: unknown): void {
    console.log(`${label.padEnd(24)} :`, value);
}

export function success(message: string): void {
    console.log(`✓ ${message}`);
}

export function warning(message: string): void {
    console.log(`⚠ ${message}`);
}

export function error(message: string): void {
    console.log(`✗ ${message}`);
}

export function address(label: string, value: string): void {
    console.log(`${label.padEnd(24)} : ${value}`);
}

export function hash(label: string, value: string): void {
    console.log(`${label.padEnd(24)} : ${value}`);
}

export function amount(
    label: string,
    value: bigint | number | string
): void {
    console.log(`${label.padEnd(24)} : ${value.toString()}`);
}

export function divider(): void {
    console.log(SUBLINE);
}

export async function tx(
    title: string,
    transaction: TransactionResponse
): Promise<TransactionReceipt> {

    section(title);

    hash("Transaction", transaction.hash);

    console.log("Waiting for confirmation...");

    const receipt = await transaction.wait();

    if (!receipt) {
        throw new Error("Transaction receipt is null");
    }

    success("Transaction Confirmed");

    info("Block", receipt.blockNumber);

    info("Gas Used", receipt.gasUsed.toString());

    if (receipt.gasPrice) {
        info(
            "Gas Price",
            receipt.gasPrice.toString()
        );
    }

    divider();

    return receipt;
}

export function deployment(
    contractName: string,
    addressValue: string
): void {

    section(`DEPLOY ${contractName}`);

    address("Contract", addressValue);

    success(`${contractName} deployed`);
}

export function finished(): void {

    console.log("");
    console.log(LINE);
    success("DONE");
    console.log(LINE);
    console.log("");
}