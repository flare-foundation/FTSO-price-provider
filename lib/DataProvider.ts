import { BigNumber, Contract } from 'ethers';
import * as fs from 'fs';
import Web3 from 'web3';
import { FtsoManager } from '../typechain-web3-v1/FtsoManager';
import { FtsoRegistry } from '../typechain-web3-v1/FtsoRegistry';
import { PriceSubmitter } from '../typechain-web3-v1/PriceSubmitter';
import { VoterWhitelister } from '../typechain-web3-v1/VoterWhitelister';
import { DataProviderConfiguration } from './Configuration';
import { DataProviderData } from './DataProviderData';
import { EpochSettings } from './EpochSettings';
import { PriceInfo } from './PriceInfo';
import * as impl from './PriceProviderImpl';
import { bigNumberToMillis, getContract, getLogger, getProvider, getWeb3, getWeb3Contract, getWeb3Wallet, priceHash, waitFinalize3Factory } from './utils';

let randomNumber = require("random-number-csprng");
let yargs = require("yargs");

interface ContractWithSymbol {
    symbol: string;
    contract: Contract;
}

// Args parsing
let args = yargs
    .option('config', {
        alias: 'c',
        type: 'string',
        description: 'Path to config json file',
        default: './config.json',
        demand: true
    }).argv;

let conf: DataProviderConfiguration = JSON.parse(fs.readFileSync(args['config']).toString()) as DataProviderConfiguration;

const logger = getLogger();

const provider = getProvider(conf.rpcUrl);
const web3 = getWeb3(conf.rpcUrl) as Web3;
const account = getWeb3Wallet(web3, conf.accountPrivateKey);

let priceSubmitterWeb3Contract: PriceSubmitter;
let priceSubmitterContract: any;
let ftsoManagerWeb3Contract: FtsoManager;
let ftsoManagerContract: Contract;
let voterWhitelisterContract: VoterWhitelister;
let ftsoRegistryContract: FtsoRegistry;

let ftsosCount: number;
let ftso2symbol: Map<string, string> = new Map();
let symbol2Index: Map<string, any> = new Map();
let symbol2dpd: Map<string, DataProviderData> = new Map();
let ftsoContracts: ContractWithSymbol[] = []

const data: DataProviderData[] = conf.priceProviderList.map((ppc, index) => {
    ppc.priceProviderParams.push(logger);
    let dpd = {
        index: index,
        symbol: ppc.symbol,
        decimals: ppc.decimals,
        priceProvider: new (impl as any)[ppc.priceProviderClass](...ppc.priceProviderParams),
        label: ppc.priceProviderClass + "(" + ppc.symbol + "/USD)"
    } as DataProviderData;
    symbol2dpd.set(ppc.symbol, dpd);
    return dpd;
});

if (data.length == 0) {
    throw Error("No price providers in configuration!");
}


const waitFinalize3 = waitFinalize3Factory(web3);

let epochSettings: EpochSettings;
let nonce: number | undefined;     // if undefined, we retrieve it from blockchain, otherwise we use it
let forcedNonceResetOn = 10;
let nonceResetCount = forcedNonceResetOn;
let symbol2epochId2priceInfo: Map<string, Map<string, PriceInfo>> = new Map();
data.forEach((d) => {
    symbol2epochId2priceInfo.set(d.symbol, new Map());
});
let epochId2endRevealTime: Map<string, number> = new Map();
let functionsToExecute: any[] = [];

let currentBalance = 0;

async function recordBalance(tx: any, receipt: any) {
    let newBalance = parseFloat(await web3.eth.getBalance(account.address));

    let fee = null;

    if (tx && receipt) {
        fee = parseFloat(tx.gasPrice) * parseFloat(receipt.gasUsed);
        logger.info(`Fee: ${fee}`);
    }
    if (currentBalance != 0) {
        let balanceReduction = currentBalance - newBalance
        logger.info(`Balance reduction: ${balanceReduction}`)
        if (fee) {
            let discountedPriceSharePct = Math.round(balanceReduction / fee * 10000) / 100;
            logger.info(`Discounted price share: ${discountedPriceSharePct}%`);
        }
    } else {
        logger.info(`Initial balance: ${newBalance}`)
    }
    currentBalance = newBalance;
}

async function getNonce(): Promise<string> {
    nonceResetCount--;
    if (nonce && nonceResetCount > 0) {
        nonce++;
    } else {
        nonce = (await web3.eth.getTransactionCount(account.address));
        nonceResetCount = forcedNonceResetOn;
    }
    return nonce + "";   // string returned
}

function resetNonce() {
    nonce = undefined;
}

async function getRandom(minnum: number = 0, maxnum: number = 10 ** 5) {
    return await randomNumber(minnum, maxnum);
};

function preparePrice(price: number, decimals: number) {
    return Math.floor(price * 10 ** decimals);
};

async function signAndFinalize3(label: string, toAddress: string, fnToEncode: any, gas: string = "2500000"): Promise<boolean> {
    // tle posilja transakcijo
    let nonce = await getNonce();
    var tx = {
        from: account.address,
        to: toAddress,
        gas: gas,                       // koliko dovolis 21000 Gas
        gasPrice: conf.gasPrice,        // koliko stane gas  225G vai
        data: fnToEncode.encodeABI(),   // posljes kr neki 0x0
        nonce: nonce
    };
    var signedTx = await account.signTransaction(tx);

    // samo 
        web3.eth.sendSignedTransaction(signedTx.rawTransaction!);


    try {
        await recordBalance(tx, null);
        let receipt = await waitFinalize3(account.address, () => web3.eth.sendSignedTransaction(signedTx.rawTransaction!));
        await recordBalance(tx, receipt);
        return true;
    } catch (e: any) {
        if (e.message.indexOf("Transaction has been reverted by the EVM") < 0) {
            logger.error(`${label} | Nonce sent: ${nonce} | signAndFinalize3 error: ${e.message}`);
            resetNonce();
        } else {
            fnToEncode.call({ from: account.address })
                .then((result: any) => { throw Error('unlikely to happen: ' + JSON.stringify(result)) })
                .catch((revertReason: any) => {
                    logger.error(`${label} | Nonce sent: ${nonce} | signAndFinalize3 error: ${revertReason}`);
                    resetNonce();
                });
        }
        return false;
    }
}

function supportedSymbols() {
    return Array.from(symbol2Index.keys()).join(", ");
}

function isSymbolActive(bitmask: number, symbol: string) {
    let index = symbol2Index.get(symbol);
    return index >= 0 && ((bitmask >> index) % 2) == 1;
}

let currentBitmask = 0;

async function submitPriceHashes(lst: DataProviderData[]) {
    logger.info("SUBMITTING")
    let epochId = epochSettings.getCurrentEpochId().toString();
    let realEpochData = await ftsoManagerWeb3Contract.methods.getCurrentPriceEpochData().call()
    logger.info(`Internal epoch id: ${epochId}, real ${realEpochData.priceEpochId}`)

    let hashes = [];
    let ftsoIndices = []
    currentBitmask = await priceSubmitterWeb3Contract.methods.voterWhitelistBitmap(account.address).call() as any;
    logger.info(`Current bitmask: ${currentBitmask.toString(2)}`);

    for (let p of lst) {
        p = p as DataProviderData;
        if (!symbol2Index.has(p.symbol)) {
            logger.info(`Skipping submit of ${p.symbol} since it is not supported (no FTSO found). Supported symbols are: ${supportedSymbols()}.`);
            continue;
        }
        if (!isSymbolActive(currentBitmask, p.symbol) && !conf.trusted) {
            logger.info(`Skipping submit of ${p.symbol} since it is not whitelisted`);
            continue;
        }

        let price = await p.priceProvider.getPrice();
        if (price) {
            let preparedPrice = preparePrice(price, p.decimals);
            let random = await getRandom();
            let hash = priceHash(preparedPrice, random, account.address);
            hashes.push(hash);
            ftsoIndices.push(symbol2Index.get(p.symbol));
            logger.info(`${p.label} | Submitting price: ${(preparedPrice / 10 ** p.decimals).toFixed(p.decimals)} $ for ${epochId}`);
            symbol2epochId2priceInfo.get(p.symbol)!.set(epochId, new PriceInfo(epochId, preparedPrice, random));
        } else {
            logger.info(`No price for ${p.symbol}`);
        }
    }

    if (hashes.length > 0) {
        logger.info(`Ftso indices: ${ftsoIndices.map(x => x.toString()).toString()}`)
        var fnToEncode = priceSubmitterWeb3Contract.methods.submitPriceHashes(epochId, ftsoIndices, hashes);
        await signAndFinalize3("Submit prices", priceSubmitterWeb3Contract.options.address, fnToEncode, "2500000");
    }
}

async function revealPrices(lst: DataProviderData[], epochId: BigNumber): Promise<void> {
    logger.info("REVEALING")
    const epochIdStr: string = epochId.toString();
    while (epochId2endRevealTime.get(epochIdStr) && new Date().getTime() < epochId2endRevealTime.get(epochIdStr)!) {

        // let addresses = [];
        let ftsoIndices = [];
        let prices = [];
        let randoms = [];

        for (let p of lst) {
            p = p as DataProviderData;
            if (!symbol2Index.get(p.symbol)) {
                logger.info(`Skipping reveal of ${p.symbol} since it is not supported (no FTSO found). Supported symbols are: ${supportedSymbols()}.`);
                continue;
            }

            let priceInfo = symbol2epochId2priceInfo.get(p.symbol)!.get(epochIdStr);

            if (priceInfo) {
                logger.info(`${p.label} | Revealing price for ${epochIdStr}`);
                priceInfo.moveToNextStatus();
                ftsoIndices.push(symbol2Index.get(p.symbol));
                prices.push(priceInfo.priceSubmitted);
                randoms.push(priceInfo.random);
            }
        }

        if (prices.length > 0) {
            var fnToEncode = priceSubmitterWeb3Contract.methods.revealPrices(epochIdStr, ftsoIndices, prices, randoms);
            await signAndFinalize3("Reveal prices", priceSubmitterWeb3Contract.options.address, fnToEncode, "2500000");
            break;
        }

        await new Promise((resolve: any) => { setTimeout(() => { resolve() }, 1000) });
    }
}

function execute(func: () => any) {
    functionsToExecute.push(func);
}

async function runExecution() {
    logger.info(`RPC: ${conf.rpcUrl}`)
    while (true) {
        if (functionsToExecute.length > 0) {
            let func: any = functionsToExecute.shift();
            try {
                await func();
            } catch (e: any) {
                logger.error("TX fail: " + e.message + " | Stack: " + e.stack);
            }
        } else {
            await new Promise((resolve: any) => { setTimeout(() => { resolve() }, 500) })
        }
    }
}

async function setupSubmissionAndReveal() {
    let epochId: BigNumber = epochSettings.getCurrentEpochId();
    let epochSubmitTimeEnd: number = epochSettings.getEpochSubmitTimeEnd().toNumber();
    let epochRevealTimeEnd: number = epochSettings.getEpochReveaTimeEnd().toNumber();
    let now = new Date().getTime();
    let diffSubmit = epochSubmitTimeEnd - now;
    let revealPeriod = epochSettings.getRevealPeriod().toNumber();
    let submitPeriod = epochSettings.getSubmitPeriod().toNumber();
    epochId2endRevealTime.set(epochId.toString(), epochRevealTimeEnd);

    logger.info("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
    logger.info(`EPOCH DATA: epoch ${epochId} submit will end in: ${diffSubmit}ms, reveal in: ${diffSubmit + revealPeriod}ms, submitPeriod: ${submitPeriod}ms, revealPeriod: ${revealPeriod}ms`);
    setTimeout(function () {
        logger.info(`SUBMIT ENDED FOR: ${epochId}`);
        logger.info("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
    }, epochSubmitTimeEnd - new Date().getTime());

    setTimeout(function () {
        logger.info(`REVEAL ENDED FOR: ${epochId}`);
    }, epochRevealTimeEnd - new Date().getTime());

    if (diffSubmit > submitPeriod - conf.submitOffset && ftso2symbol.size >= ftsosCount) {
        setTimeout(function () {
            logger.info(`Submit in ${diffSubmit - submitPeriod + conf.submitOffset}ms`)
            execute(async function () { await submitPriceHashes(data); });
        }, diffSubmit - submitPeriod + conf.submitOffset);

        setTimeout(function () {
            logger.info(`Reveal in ${diffSubmit + conf.revealOffset}ms`)
            execute(async function () { await revealPrices(data, epochId); });
        }, diffSubmit + conf.revealOffset);
    }

    setTimeout(setupSubmissionAndReveal, diffSubmit);
}

function setupEvents() {
    priceSubmitterContract.on("PriceHashesSubmitted", async (submitter: string, epochId: any, ftsos: string[], hashes: string[], timestamp: any) => {
        if (submitter != account.address) return;

        let epochIdStr = epochId.toString();
        for (let ftso of ftsos) {
            let symbol = ftso2symbol.get(ftso)!;
            let p: DataProviderData = symbol2dpd.get(symbol)!;
            let priceInfo = symbol2epochId2priceInfo.get(symbol)?.get(epochIdStr);
            priceInfo?.moveToNextStatus();
            if (p) {
                logger.info(`${p.label} | Price submitted in epoch ${epochIdStr}`);
            }
        }
    });

    priceSubmitterContract.on("PricesRevealed", async (voter: string, epochId: any, ftsos: string[], prices: any[], randoms: string[], timestamp: any) => {
        if (voter != account.address) return;

        let epochIdStr = epochId.toString();
        let i = 0;
        for (let ftso of ftsos) {
            let symbol = ftso2symbol.get(ftso)!;
            let p: DataProviderData = symbol2dpd.get(symbol)!;
            let price = prices[i];

            logger.info(`${p.label} | Price revealed in epoch ${epochIdStr}: ${(price / 10 ** p.decimals).toFixed(p.decimals)}$.`);

            let priceInfo = symbol2epochId2priceInfo.get(symbol)?.get(epochIdStr);
            if (priceInfo) {
                priceInfo.moveToNextStatus();
                if (p) {
                    logger.info(`${p.label} | Price that was submitted: ${(priceInfo.priceSubmitted / 10 ** 5).toFixed(5)}$`);
                    if (priceInfo.priceSubmitted != (price as number)) {
                        logger.error(`${p.label} | Price submitted and price revealed are diffent!`);
                    }
                }
            }
            i++;
        }
    });

    ftsoContracts.forEach(contractWithSymbol => {
        contractWithSymbol.contract.on("PriceFinalized", async (
            epochId: any, price: any, rewardedFtso: boolean,
            lowRewardPrice: any, highRewardPrice: any, finalizationType: any,
            timestamp: any) => {
            logger.info(`Price finalized for ${contractWithSymbol.symbol} in epochId ${epochId}: price: ${(price / 10 ** 5).toFixed(5)}$,  finalization type: ${finalizationType}, rewarded: ${rewardedFtso}, low price: ${(lowRewardPrice / 10 ** 5).toFixed(5)}$, high price: ${(highRewardPrice / 10 ** 5).toFixed(5)}$, timestamp: ${timestamp.toString()}`)
        })
    })

    ftsoManagerContract.on("RewardEpochFinalized", async (votepowerBlock: any, startBlock: any) => {
        logger.info(`Reward epoch finalized. New reward epoch starts with block ${startBlock}, uses vote power block ${votepowerBlock}`);
    })
}

async function runDataProvider() {

    priceSubmitterWeb3Contract = await getWeb3Contract(web3, conf.priceSubmitterContractAddress, "PriceSubmitter");
    priceSubmitterContract = await getContract(provider, conf.priceSubmitterContractAddress, "PriceSubmitter");
    runExecution();

    try {
        let ftsoManagerAddress = await priceSubmitterWeb3Contract.methods.getFtsoManager().call();
        logger.info(`FtsoManager address obtained ${ftsoManagerAddress}`)
        ftsoManagerWeb3Contract = await getWeb3Contract(web3, ftsoManagerAddress, "FtsoManager");
        ftsoManagerContract = await getContract(provider, ftsoManagerAddress, "FtsoManager");
    } catch (err: any) {
        logger.error(`getFtsoManager() | ${err}`)
        return; // No point in continuing without ftso manager
    }

    try {
        let ftsoRegistryAddress = await priceSubmitterWeb3Contract.methods.getFtsoRegistry().call();
        logger.info(`FtsoRegistry address obtained ${ftsoRegistryAddress}`)
        ftsoRegistryContract = await getWeb3Contract(web3, ftsoRegistryAddress, "FtsoRegistry");
    } catch (err: any) {
        logger.error(`ftsoRegistry() | ${err}`)
        return; // No point in continuing without ftso registry
    }

    // 2. get ftsos
    try {
        let voterWhitelisterAddress = await priceSubmitterWeb3Contract.methods.getVoterWhitelister().call();
        logger.info(`VoterWhitelisterAddress: ${voterWhitelisterAddress}`);
        voterWhitelisterContract = await getWeb3Contract(web3, voterWhitelisterAddress, "VoterWhitelister");
        try {
            let lst = await ftsoManagerWeb3Contract.methods.getFtsos().call();
            ftsosCount = lst.length;
            for (let ftso of lst) {
                let contract = await getWeb3Contract(web3, ftso, "Ftso");
                try {
                    let symbol = await contract.methods.symbol().call();
                    ftsoContracts.push({
                        symbol,
                        contract: await getContract(provider, ftso, "Ftso")
                    });
                    logger.info(`Symbol: ${symbol}`);
                    ftso2symbol.set(ftso, symbol);
                    let index = await ftsoRegistryContract.methods.getFtsoIndex(symbol).call();
                    logger.info(`INDEX: ${index.toString()}`)
                    symbol2Index.set(symbol, index);
                    if (conf.whitelist) {
                        try {
                            var fnToEncode = voterWhitelisterContract.methods.requestWhitelistingVoter(account.address, index);
                            await signAndFinalize3("Whitelist", voterWhitelisterContract.options.address, fnToEncode, "2500000");
                            logger.info(`${symbol} whitelisted.`)
                        } catch (err: any) {
                            logger.error(`symbol() | requestWhitelistingVoter() | ${err}`)
                        }
                    }
                } catch (err: any) {
                    logger.error(`symbol() | ${err}`)
                }
            }
        } catch (err: any) {
            logger.error(`getFtsos() | ${err}`)
        }
    } catch (err: any) {
        logger.error(`priceSubmitter() | ${err}`)
    }

    // 3. get epochinfo from ftsomanager
    try {
        let data = await ftsoManagerWeb3Contract.methods.getPriceEpochConfiguration().call() as any;
        epochSettings = new EpochSettings(bigNumberToMillis(data[0]), bigNumberToMillis(data[1]), bigNumberToMillis(data[2]));
        setupSubmissionAndReveal();
    } catch (err: any) {
        logger.error(`getPriceEpochConfiguration() | ${err}`)
    }

    setupEvents();
}

runDataProvider()