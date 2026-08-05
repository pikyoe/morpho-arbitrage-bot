import { HardhatRuntimeEnvironment } from "hardhat/types";

const ERC20_ABI = [
    "function balanceOf(address) view returns(uint256)",
    "function transfer(address,uint256) returns(bool)"
];

// WETH treasury / whale
const WETH_WHALE =
    "0x498581fF718922c3f8e6A244956aF099B2652b2b";

export async function impersonateAccount(
    hre: HardhatRuntimeEnvironment,
    account: string
) {
    const { ethers } =
        await hre.network.connect();

    await ethers.provider.send(
        "hardhat_impersonateAccount",
        [account]
    );

    await ethers.provider.send(
        "hardhat_setBalance",
        [
            account,
            "0x3635C9ADC5DEA00000"
        ]
    );

    return await ethers.getSigner(account);

}

export async function stopImpersonate(
    hre: HardhatRuntimeEnvironment,
    account: string
) {
    const { ethers } =
        await hre.network.connect();

    await ethers.provider.send(
        "hardhat_stopImpersonatingAccount",
        [account]
    );

}

export async function fundWETH(
    hre: HardhatRuntimeEnvironment,
    recipient: string,
    amount: bigint
) {
    const { ethers } = await hre.network.connect();

    const signer =
        await impersonateAccount(
            hre,
            WETH_WHALE
        );

    const weth =
        new ethers.Contract(
            process.env.WETH_ADDRESS!,
            ERC20_ABI,
            signer
        );

    const before =
        await weth.balanceOf(
            recipient
        );

    console.log("--------------------------------");
    console.log("Funding WETH");
    console.log("--------------------------------");
    console.log("Recipient :", recipient);
    console.log(
        "Before    :",
        ethers.formatEther(before)
    );

    const tx =
        await weth.transfer(
            recipient,
            amount
        );

    await tx.wait();

    const afterBalance =
        await weth.balanceOf(
            recipient
        );

    console.log(
        "After     :",
        ethers.formatEther(afterBalance)
    );

    await stopImpersonate(
        hre,
        WETH_WHALE
    );
}

export async function printTokenBalance(
    hre: HardhatRuntimeEnvironment,
    token: string,
    account: string,
    symbol: string
) {
    const { ethers } =
        await hre.network.connect();

    const erc20 =
        new ethers.Contract(
            token,
            ERC20_ABI,
            ethers.provider
        );

    const balance =
        await erc20.balanceOf(
            account
        );

    console.log(
        symbol,
        ":",
        ethers.formatEther(balance)
    );
}