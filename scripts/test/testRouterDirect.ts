import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { fundWETH } from "../utils/fundFork.js";

const ERC20_ABI = [
    "function approve(address,uint256) returns(bool)",
    "function balanceOf(address) view returns(uint256)"
];

const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)"
];

async function main() {

    const connection: any = await hre.network.connect();
    const { ethers } = connection;

    loadEnvForNetwork(hre);

    const signer = await ethers.provider.getSigner();
    const signerAddress = await signer.getAddress();

    const WETH = process.env.WETH_ADDRESS!;
    const USDC = process.env.USDC_ADDRESS!;
    const ROUTER = process.env.UNISWAP_ROUTER_ADDRESS!;

    const weth = new ethers.Contract(
        WETH,
        ERC20_ABI,
        signer
    );

    const router = new ethers.Contract(
        ROUTER,
        ROUTER_ABI,
        signer
    );

    const amountIn = ethers.parseEther("0.01");

    console.log("Funding signer...");

    await fundWETH(
        hre,
        signerAddress,
        amountIn
    );

    console.log(
        "Signer WETH:",
        (
            await weth.balanceOf(signerAddress)
        ).toString()
    );

    console.log("Approve router...");

    await (
        await weth.approve(
            ROUTER,
            amountIn
        )
    ).wait();

    console.log("Approved.");

    console.log("Swap...");

    const txPreview = await router.exactInputSingle.populateTransaction({
        tokenIn: WETH,
        tokenOut: USDC,
        fee: 3000,
        recipient: signerAddress,
        amountIn,
        amountOutMinimum: 1,
        sqrtPriceLimitX96: 0
    });

    console.log(txPreview);

    const tx =
        await router.exactInputSingle(
            {
                tokenIn: WETH,
                tokenOut: USDC,
                fee: 3000,
                recipient: signerAddress,
                amountIn,
                amountOutMinimum: 1,
                sqrtPriceLimitX96: 0
            },
            {
                gasLimit: 2_000_000
            }
        );

    console.log("tx =", tx.hash);

    await tx.wait();

    console.log("DONE");

    console.log(
        "Signer WETH:",
        (
            await weth.balanceOf(
                signerAddress
            )
        ).toString()
    );
}

main().catch(console.error);