import BN from 'bn.js';
import { BigNumber, ethers } from 'ethers';
import * as fs from 'fs';
import glob from 'glob';
import * as winston from 'winston';
var Web3 = require('web3');

export const DECIMALS = 5;

export function getProvider(rpcLink: string): ethers.providers.Provider {
    return new ethers.providers.JsonRpcProvider(rpcLink);
}

export function getWeb3(rpcLink: string, logger?: any) {
    let web3 = new Web3();
    if (rpcLink.startsWith("http")) {
        web3.setProvider(new Web3.providers.HttpProvider(rpcLink));
    } else if (rpcLink.startsWith("ws")) {
        let provider = new Web3.providers.WebsocketProvider(
            rpcLink,
            {
                // @ts-ignore
                clientConfig: {
                    keepalive: true,
                    keepaliveInterval: 60000	// milliseconds
                },
                reconnect: {
                    auto: true,
                    delay: 2500,
                    onTimeout: true,
                }
            }
        );
        provider.on("close", (err: any) => {
            if (logger) {
                logger.error(`WebSocket connection closed. Error code ${err.code}, reason "${err.reason}"`);
            }
        });
        web3.setProvider(provider);
    }
    web3.eth.handleRevert = true;
    // web3.eth.defaultCommon = { customChain: { name: 'coston', chainId: 20210413, networkId: 20210413 }, baseChain: 'ropsten', hardfork: 'petersburg' };
    //    }
    return web3;
};


export function getAbi(abiPath: string) {
    let abi = JSON.parse(fs.readFileSync(abiPath).toString());
    if (abi.abi) {
        abi = abi.abi;
    }
    return abi;
}

export async function getWeb3Contract(web3: any, address: string, name: string) {
    let abiPath = await relativeContractABIPathForContractName(name);
    return new web3.eth.Contract(getAbi(`artifacts/${abiPath}`), address);
};

export async function getContract(provider: any, address: string, name: string) {
    let abiPath = await relativeContractABIPathForContractName(name);
    return new ethers.Contract(address, getAbi(`artifacts/${abiPath}`), provider);
};

export function getWeb3Wallet(web3: any, privateKey: string) {
    if (privateKey.indexOf('0x') != 0) {
        privateKey = '0x' + privateKey;
    }
    return web3.eth.accounts.privateKeyToAccount(privateKey);
}

export function getWallet(privateKey: string, provider: any): ethers.Wallet {
    return new ethers.Wallet(privateKey, provider);
}

export function waitFinalize3Factory(web3: any) {
    return async function (address: string, func: () => any, delay: number = 1000) {
        let nonce = await web3.eth.getTransactionCount(address)
        let res = await func();
        let backoff = 1.5;
        let cnt = 0;
        while ((await web3.eth.getTransactionCount(address)) == nonce) {
            await new Promise((resolve: any) => { setTimeout(() => { resolve() }, delay) })
            if (cnt < 8) {
                delay = Math.floor(delay * backoff);
                cnt++;
            } else {
                throw new Error("Response timeout");
            }
            console.log(`Delay backoff ${delay} (${cnt})`);
        }
        return res;
    }
}

export function getLogger(label: string | undefined = undefined) {
    return winston.createLogger({
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format.label({
                label: label
            }),
            winston.format.printf((json: any) => {
                if (json.label) {
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
                filename: './logs/flare-price-provider.log'
            })
        ]
    });
}

export function bigNumberToMillis(num: number) {
    return BigNumber.from(num * 1000);
}

export function priceHash(price: number | BN | BigNumber, random: number | BN | BigNumber, address: string): string {
    return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "address"], [price.toString(), random.toString(), address]))
}

export async function relativeContractABIPathForContractName(name: string, artifactsRoot = "artifacts"): Promise<string> {
    return new Promise((resolve, reject) => {
        glob(`contracts/**/${name}.sol/${name}.json`, {cwd: artifactsRoot}, (er: any, files: string[] | null) => {
            if (er) {
                reject(er)
            } else {
                if (files && files.length === 1) {
                    resolve(files[0])
                } else {
                    reject(files)
                }
            }
        })
    })
}
