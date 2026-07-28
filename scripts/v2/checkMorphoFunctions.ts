import { network } from "hardhat";


async function main(){

 const connection =
    await network.create("baseSepolia");

 const { ethers } =
    connection;


 const code =
    await ethers.provider.getCode(
        "0x5e5b326938F0FE2f349Be2802d873204b767262C"
    );


 console.log(code.slice(0,100));

}


main();