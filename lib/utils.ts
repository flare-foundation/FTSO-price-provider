import BN from 'bn.js';
import { BigNumber, ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
var Web3 = require('web3');

export const DECIMALS = 5;

//const root = path.dirname(require.main!.filename);
//const DEFAULT_ABI_PATH = path.join(root, "..", 'contracts', 'dummyabi.json');

export function getProvider(rpcLink: string): ethers.providers.Provider {
    return new ethers.providers.JsonRpcProvider(rpcLink);
}

export function getWeb3(rpcLink: string) {
    let web3 = new Web3();
    web3.setProvider(new Web3.providers.HttpProvider(rpcLink));
    web3.eth.handleRevert = true;
    return web3;
};

export function getAbi(abiPath: string) {
    let abi = JSON.parse(fs.readFileSync(abiPath).toString());
    if (abi.abi) {
        abi = abi.abi;
    }
    return abi;
}

export function getWeb3Contract(web3: any, address: string, abi: any) {
    return new web3.eth.Contract(abi, address);
};

export function getContract(provider: any, address: string, abi: any): ethers.Contract {
    return new ethers.Contract(address, abi, provider);
};

export function getWeb3Wallet(web3:any, privateKey: string) {
    if(privateKey.indexOf('0x') != 0) {
        privateKey = '0x' + privateKey;
    }
    return web3.eth.accounts.privateKeyToAccount(privateKey);
}

export function getWallet(privateKey: string, provider:any): ethers.Wallet {
    return new ethers.Wallet(privateKey, provider);
}

export function waitFinalize3Factory(web3: any) {
    return async function (address: string, func: () => any, delay:number=1000) {
        let nonce = await web3.eth.getTransactionCount(address)
        // console.log("Nonce 1:", nonce);
        let res = await func();
        let backoff = 1.5;
        let cnt = 0;
        while ((await web3.eth.getTransactionCount(address)) == nonce) {
            await new Promise((resolve: any) => { setTimeout(() => { resolve() }, delay) })
            if(cnt < 8) {
                delay = Math.floor(delay * backoff); 
                cnt++;
            } else {
                throw new Error("Response timeout");
            }
            console.log(`Delay backoff ${delay} (${cnt})`);                
        }
        // console.log("Nonce 2:", await web3.eth.getTransactionCount(address));
        return res;
    }
}

export function getLogger(label:string|undefined=undefined) {
    return winston.createLogger({
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format.label({
                label: label
            }),
            winston.format.printf((json: any) => {
                if(json.label) {
                    return `${json.timestamp} - ${json.label}:[${json.level}]: ${json.message}`;
                } else {
                    return `${json.timestamp} - [${json.level}]: ${json.message}`;
                }
            })
                
        ),
        transports: [
            new winston.transports.Console(),
            new winston.transports.File({
                level: 'info',
                filename: './dataprovider.log'
            })
        ]
    });
}

export function bigNumberToMillis(num:any) {
    return (num as BigNumber).mul(BigNumber.from(1000));
}

export function submitPriceHash(price: number | BN | BigNumber, random: number | BN | BigNumber): string {
    return ethers.utils.solidityKeccak256([ "uint256", "uint256" ], [ price.toString(), random.toString() ]);
}