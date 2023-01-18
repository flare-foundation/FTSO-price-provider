import { BigNumber, Contract } from 'ethers';
import * as fs from 'fs';
import Web3 from 'web3';
import { FtsoManager } from '../typechain-web3-v1/FtsoManager';
import { FtsoRegistry } from '../typechain-web3-v1/FtsoRegistry';
import { PriceSubmitter } from '../typechain-web3-v1/PriceSubmitter';
import { VoterWhitelister } from '../typechain-web3-v1/VoterWhitelister';
import { DataProviderConfiguration } from './Configuration';
import { DataProviderData } from './DataProviderData';
import { DotEnvExt } from './DotEnvExt';
import { EpochSettings } from './EpochSettings';
import { fetchSecret } from './GoogleSecret';
import { IPriceProvider } from './IPriceProvider';
import { PriceInfo } from './PriceInfo';
import * as impl from './PriceProviderImpl';
import { bigNumberToMillis, getContract, getLogger, getProvider, getWeb3, getWeb3Contract, getWeb3Wallet, priceHash, waitFinalize3Factory } from './utils';

let ccxws:any = require('ccxws');
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

// Reading configuration
let conf: DataProviderConfiguration = JSON.parse(fs.readFileSync(args['config']).toString()) as DataProviderConfiguration;

class DataProvider {

    logger = getLogger();

    web3!: Web3;
    account: any;
    provider: any

    // Contracts
    priceSubmitterWeb3Contract!: PriceSubmitter;
    priceSubmitterContract: any;
    ftsoManagerWeb3Contract!: FtsoManager;
    ftsoManagerContract!: Contract;
    voterWhitelisterContract!: VoterWhitelister;
    ftsoRegistryContract!: FtsoRegistry;

    ftsosCount!: number;
    ftso2symbol: Map<string, string> = new Map();
    symbol2Index: Map<string, any> = new Map();
    symbol2dpd: Map<string, DataProviderData> = new Map();
    ftsoContracts: ContractWithSymbol[] = []

    waitFinalize3: any

    epochSettings!: EpochSettings;
    nonce: number | undefined;     // if undefined, we retrieve it from blockchain, otherwise we use it
    nonceResetCount!: number
    forcedNonceResetOn = 1;
    symbol2epochId2priceInfo: Map<string, Map<string, PriceInfo>> = new Map();

    epochId2endRevealTime: Map<string, number> = new Map();
    functionsToExecute: any[] = [];

    currentBitmask = 0;
    ex2client: any = {};

    data!: DataProviderData[]

    constructor(conf: any) {
        // we need this provider for usdt/usd pair
        let n:number = conf.priceProviderList.length;
        let exchanges:any[] = [];
        for(let ex of ['coinbasepro', 'ftx', 'kraken']) {
            exchanges.push( { ex, market: 'USDT/USD', client: this.getWsClient(ex, 3*n) } );
        }
        let usdtUsdProvider:IPriceProvider = new impl.WsLimitedPriceProvider('USDT/USD', 1.0, exchanges, 'avg');
        usdtUsdProvider.setLogger(this.logger);
        usdtUsdProvider.init();

        // providers from config
        this.data = conf.priceProviderList.map((ppc: any, index: number) => {
            ppc.priceProviderParams[2] = ppc.priceProviderParams[2].map( (arr:any) => {
                let ex:string = arr[0];
                return {
                    ex,
                    market: arr[1],
                    client: this.getWsClient(ex, 2*n)
                };
            });
            let priceProvider:IPriceProvider = new (impl as any)[ppc.priceProviderClass](...ppc.priceProviderParams);
            priceProvider.setLogger(this.logger);
            priceProvider.setUsdtUsdProvider(usdtUsdProvider);
            priceProvider.init();
            let dpd = {
                index: index,
                symbol: ppc.symbol,
                decimals: ppc.decimals,
                priceProvider,
                label: ppc.priceProviderClass + "(" + ppc.symbol + "/USD)"
            } as DataProviderData;
            this.symbol2dpd.set(ppc.symbol, dpd);
            return dpd;
        })

        if (this.data.length == 0) {
            throw Error("No price providers in configuration!");
        }

        this.nonceResetCount = this.forcedNonceResetOn;

        this.data.forEach((d) => {
            this.symbol2epochId2priceInfo.set(d.symbol, new Map());
        });

    }

    getWsClient(ex:string, n:number): void {
        if(!this.ex2client[ex]) {
            let self:any = this;
            let client:any = new (ccxws as any)[ex]();
            client.setMaxListeners(n);
            client.on("error", (err: any) => self.logger.error(`Error on exchange ${ex}: ${err}`));
            client.on("reconnecting", () => self.logger.info(`Reconnecting to ${ex}...`));
            client.on("connecting", () => self.logger.info(`Connecting to ${ex}...`));
            client.on("connected", () => self.logger.info(`Connected to ${ex}...`));
            client.on("disconnected", () => self.logger.info(`Disconnected from ${ex}...`));
            client.on("closing", () => self.logger.info(`Closing on ${ex}...`));
            client.on("closed", () => self.logger.info(`Closed on ${ex}...`));
            this.ex2client[ex] = client;
        }
        return this.ex2client[ex];
    }

    async getNonce(): Promise<string> {
        this.nonceResetCount--;
        if (this.nonce && this.nonceResetCount > 0) {
            this.nonce++;
        } else {
            this.nonce = (await this.web3.eth.getTransactionCount(this.account.address));
            this.nonceResetCount = this.forcedNonceResetOn;
        }
        return this.nonce + "";   // string returned
    }

    resetNonce() {
        this.nonce = undefined;
    }

    getRandom(minnum: number = 0, maxnum: number = 10 ** 5) {
        return Web3.utils.toBN(Web3.utils.randomHex(32));
    };

    preparePrice(price: number, decimals: number) {
        return Math.floor(price * 10 ** decimals);
    };

    async signAndFinalize3(label: string, toAddress: string, fnToEncode: any, gas: string = "2500000"): Promise<boolean> {
        let nonce = await this.getNonce();
        var tx = {
            from: this.account.address,
            to: toAddress,
            gas: gas,
            gasPrice: conf.gasPrice,
            data: fnToEncode.encodeABI(),
            nonce: nonce
        };
        var signedTx = await this.account.signTransaction(tx);

        try {
            let receipt = await this.waitFinalize3(this.account.address, () => this.web3.eth.sendSignedTransaction(signedTx.rawTransaction!));
            return true;
        } catch (e: any) {
            if (e.message.indexOf("Transaction has been reverted by the EVM") < 0) {
                this.logger.error(`${label} | Nonce sent: ${nonce} | signAndFinalize3 error: ${e.message}`);
                this.resetNonce();
            } else {
                fnToEncode.call({ from: this.account.address })
                    .then((result: any) => { throw Error('unlikely to happen: ' + JSON.stringify(result)) })
                    .catch((revertReason: any) => {
                        this.logger.error(`${label} | Nonce sent: ${nonce} | signAndFinalize3 error: ${revertReason}`);
                        this.resetNonce();
                    });
            }
            return false;
        }
    }

    supportedSymbols() {
        return Array.from(this.symbol2Index.keys()).join(", ");
    }

    isSymbolActive(bitmask: number, symbol: string) {
        let index = this.symbol2Index.get(symbol);
        return index >= 0 && ((bitmask >> index) % 2) == 1;
    }

    async submitPriceHash(lst: DataProviderData[]) {
        this.logger.info("SUBMITTING")
        let epochId = this.epochSettings.getCurrentEpochId().toString();
        let realEpochData = await this.ftsoManagerWeb3Contract.methods.getCurrentPriceEpochData().call()
        this.logger.info(`Internal epoch id: ${epochId}, real ${realEpochData._priceEpochId}`)

        let index2price:Map<number,Number> = new Map();
        let random = this.getRandom();
        this.currentBitmask = await this.priceSubmitterWeb3Contract.methods.voterWhitelistBitmap(this.account.address).call() as any;
        this.logger.info(`Current bitmask: ${this.currentBitmask.toString(2)}`);
        
        for (let p of lst) {
            p = p as DataProviderData;
            if (!this.symbol2Index.has(p.symbol)) {
                this.logger.info(`Skipping submit of ${p.symbol} since it is not supported (no FTSO found). Supported symbols are: ${this.supportedSymbols()}.`);
                continue;
            }
            if (!this.isSymbolActive(this.currentBitmask, p.symbol) && !conf.trusted) {
                this.logger.info(`Skipping submit of ${p.symbol} since it is not whitelisted`);
                continue;
            }

            let price = await p.priceProvider.getPrice();
            if (price) {
                let preparedPrice = this.preparePrice(price, p.decimals);
                index2price.set( Number(this.symbol2Index.get(p.symbol)), preparedPrice);
                this.logger.info(`${p.label} | Submitting price: ${(preparedPrice / 10 ** p.decimals).toFixed(p.decimals)} $ for ${epochId}`);
                this.symbol2epochId2priceInfo.get(p.symbol)!.set(epochId, new PriceInfo(epochId, preparedPrice, random));
            } else {
                this.logger.error(`No price for ${p.symbol}`);
            }
        }
        
        let ftsoIndices:number[] = [ ...index2price.keys() ].sort( (a:number, b:number) => a-b );
        let prices:string[] = ftsoIndices.map( (index:number) => index2price.get(index)!.toString() );

        if (prices.length > 0) {
            this.logger.info(`Ftso indices: ${ftsoIndices.map(x => x.toString()).toString()}`)
            let hash = priceHash(this.web3, ftsoIndices, prices, random, this.account.address);
            var fnToEncode = this.priceSubmitterWeb3Contract.methods.submitHash(epochId, hash);
            await this.signAndFinalize3("Submit prices", this.priceSubmitterWeb3Contract.options.address, fnToEncode, "2500000");
        }
    }

    async revealPrices(lst: DataProviderData[], epochId: BigNumber): Promise<void> {
        this.logger.info("REVEALING")
        const epochIdStr: string = epochId.toString();
        while (this.epochId2endRevealTime.get(epochIdStr) && new Date().getTime() < this.epochId2endRevealTime.get(epochIdStr)!) {

            // let addresses = [];
            let random = Web3.utils.toBN('0');
            let index2price:Map<number,Number> = new Map();
            
            for (let p of lst) {
                p = p as DataProviderData;
                if (!this.symbol2Index.get(p.symbol)) {
                    this.logger.info(`Skipping reveal of ${p.symbol} since it is not supported (no FTSO found). Supported symbols are: ${this.supportedSymbols()}.`);
                    continue;
                }
                
                let priceInfo = this.symbol2epochId2priceInfo.get(p.symbol)!.get(epochIdStr);
                
                if (priceInfo) {
                    this.logger.info(`${p.label} | Revealing price for ${epochIdStr}`);
                    priceInfo.moveToNextStatus();
                    index2price.set( Number(this.symbol2Index.get(p.symbol)), priceInfo.priceSubmitted);
                    random = priceInfo.random;
                }
            }
            
            let ftsoIndices:number[] = [ ...index2price.keys() ].sort( (a:number, b:number) => a-b );
            let prices:string[] = ftsoIndices.map( (index:number) => index2price.get(index)!.toString() );

            if (prices.length > 0) {
                var fnToEncode = this.priceSubmitterWeb3Contract.methods.revealPrices(epochIdStr, ftsoIndices, prices, random);
                await this.signAndFinalize3("Reveal prices", this.priceSubmitterWeb3Contract.options.address, fnToEncode, "2500000");
                break;
            }

            await new Promise((resolve: any) => { setTimeout(() => { resolve() }, 1000) });
        }
    }

    execute(func: () => any) {
        this.functionsToExecute.push(func);
    }

    async runExecution() {
        this.logger.info(`RPC: ${conf.rpcUrl}`)
        while (true) {
            if (this.functionsToExecute.length > 0) {
                let func: any = this.functionsToExecute.shift();
                try {
                    await func();
                } catch (e: any) {
                    this.logger.error("TX fail: " + e.message + " | Stack: " + e.stack);
                }
            } else {
                await new Promise((resolve: any) => { setTimeout(() => { resolve() }, 500) })
            }
        }
    }

    async setupSubmissionAndReveal() {
        let epochId: BigNumber = this.epochSettings.getCurrentEpochId();
        let epochSubmitTimeEnd: number = this.epochSettings.getEpochSubmitTimeEnd().toNumber();
        let epochRevealTimeEnd: number = this.epochSettings.getEpochReveaTimeEnd().toNumber();
        let now = new Date().getTime();
        let diffSubmit = epochSubmitTimeEnd - now;
        let revealPeriod = this.epochSettings.getRevealPeriod().toNumber();
        let submitPeriod = this.epochSettings.getSubmitPeriod().toNumber();
        this.epochId2endRevealTime.set(epochId.toString(), epochRevealTimeEnd);

        this.logger.info("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
        this.logger.info(`EPOCH DATA: epoch ${epochId} submit will end in: ${diffSubmit}ms, reveal in: ${diffSubmit + revealPeriod}ms, submitPeriod: ${submitPeriod}ms, revealPeriod: ${revealPeriod}ms`);
        setTimeout(() => {
            this.logger.info(`SUBMIT ENDED FOR: ${epochId}`);
        }, epochSubmitTimeEnd - new Date().getTime());

        setTimeout(() => {
            this.logger.info(`REVEAL ENDED FOR: ${epochId}`);
        }, epochRevealTimeEnd - new Date().getTime());

        if (diffSubmit > submitPeriod - conf.submitOffset && this.ftso2symbol.size >= this.ftsosCount) {
            setTimeout(() => {
                this.logger.info(`Submit in ${diffSubmit - submitPeriod + conf.submitOffset}ms`)
                this.execute(async () => { await this.submitPriceHash(this.data); });
            }, diffSubmit - submitPeriod + conf.submitOffset);

            setTimeout(() => {
                this.logger.info(`Reveal in ${diffSubmit + conf.revealOffset}ms`)
                this.execute(async () => { await this.revealPrices(this.data, epochId); });
            }, diffSubmit + conf.revealOffset);
        }

        setTimeout(() => this.setupSubmissionAndReveal(), diffSubmit);
    }

    setupEvents() {
        this.priceSubmitterContract.on("HashSubmitted", async (submitter: string, epochId: any, hash: string, timestamp: any) => {
            if (submitter != this.account.address) return;

            this.logger.info(`Prices submitted in epoch ${epochId.toString()}`);
        });

        this.priceSubmitterContract.on("PricesRevealed", async (voter: string, epochId: any, ftsos: string[], prices: any[], random: string, timestamp: any) => {
            if (voter != this.account.address) return;

            let epochIdStr = epochId.toString();
            let i = 0;
            for (let ftso of ftsos) {
                let symbol = this.ftso2symbol.get(ftso)!;
                let p: DataProviderData = this.symbol2dpd.get(symbol)!;
                let price = prices[i];

                this.logger.info(`${p.label} | Price revealed in epoch ${epochIdStr}: ${(price / 10 ** p.decimals).toFixed(p.decimals)}$.`);

                let priceInfo = this.symbol2epochId2priceInfo.get(symbol)?.get(epochIdStr);
                if (priceInfo) {
                    priceInfo.moveToNextStatus();
                    if (p) {
                        this.logger.info(`${p.label} | Price that was submitted: ${(priceInfo.priceSubmitted / 10 ** 5).toFixed(5)}$`);
                        if (priceInfo.priceSubmitted != (price as number)) {
                            this.logger.error(`${p.label} | Price submitted and price revealed are diffent!`);
                        }
                    }
                }
                i++;
            }
        });

        this.ftsoContracts.forEach(contractWithSymbol => {
            contractWithSymbol.contract.on("PriceFinalized", async (
                epochId: any, price: any, rewardedFtso: boolean,
                lowRewardPrice: any, highRewardPrice: any, finalizationType: any,
                timestamp: any) => {
                this.logger.info(`Price finalized for ${contractWithSymbol.symbol} in epochId ${epochId}: price: ${(price / 10 ** 5).toFixed(5)}$,  finalization type: ${finalizationType}, rewarded: ${rewardedFtso}, low price: ${(lowRewardPrice / 10 ** 5).toFixed(5)}$, high price: ${(highRewardPrice / 10 ** 5).toFixed(5)}$, timestamp: ${timestamp.toString()}`)
            })
        })

        this.ftsoManagerContract.on("RewardEpochFinalized", async (votepowerBlock: any, startBlock: any) => {
            this.logger.info(`Reward epoch finalized. New reward epoch starts with block ${startBlock}, uses vote power block ${votepowerBlock}`);
        })
    }

    async runDataProvider() {
        let version = 1005

        DotEnvExt()

        const configData: string = ""
        let accountPrivateKey: string = ""

        this.logger.info(`Starting Flare Price Provider v${version}`)

        if (process.env.PROJECT_SECRET === undefined) {
            this.logger.info(`   * account read from .env`)
            accountPrivateKey = (conf.accountPrivateKey as string)
        } else if (process.env.PROJECT_SECRET !== undefined) {
            this.logger.info(`   * account read from secret '${process.env.PROJECT_SECRET}'`)
            accountPrivateKey = (await fetchSecret(process.env.PROJECT_SECRET as string) as string)
        } else {
            this.logger.info(`Starting Flare Price Provider  v${version} [developer mode]`)
            this.logger.info(`   * account read from config`)

            accountPrivateKey = (conf.accountPrivateKey as string)
        }

        // rpcUrl from conf
        if (process.env.RPC_URL !== undefined) {
            conf.rpcUrl = process.env.RPC_URL

            // rpcUrl from .env if it exsists
            this.logger.info(`   * rpcUrl from .env '${conf.rpcUrl}'`)
        }
        else {
            this.logger.info(`   * rpcUrl from conf '${conf.rpcUrl}'`)
        }

        this.provider = getProvider(conf.rpcUrl);
        this.web3 = getWeb3(conf.rpcUrl);
        this.waitFinalize3 = waitFinalize3Factory(this.web3);
        this.account = getWeb3Wallet(this.web3, accountPrivateKey);

        this.priceSubmitterWeb3Contract = await getWeb3Contract(this.web3, conf.priceSubmitterContractAddress, "PriceSubmitter");
        this.priceSubmitterContract = await getContract(this.provider, conf.priceSubmitterContractAddress, "PriceSubmitter");
        this.runExecution();

        try {
            let ftsoManagerAddress = await this.priceSubmitterWeb3Contract.methods.getFtsoManager().call();
            this.logger.info(`FtsoManager address obtained ${ftsoManagerAddress}`)
            this.ftsoManagerWeb3Contract = await getWeb3Contract(this.web3, ftsoManagerAddress, "FtsoManager");
            this.ftsoManagerContract = await getContract(this.provider, ftsoManagerAddress, "FtsoManager");
        } catch (err: any) {
            this.logger.error(`getFtsoManager() | ${err}`)
            return; // No point in continuing without ftso manager
        }

        try {
            let ftsoRegistryAddress = await this.priceSubmitterWeb3Contract.methods.getFtsoRegistry().call();
            this.logger.info(`FtsoRegistry address obtained ${ftsoRegistryAddress}`)
            this.ftsoRegistryContract = await getWeb3Contract(this.web3, ftsoRegistryAddress, "FtsoRegistry");
        } catch (err: any) {
            this.logger.error(`ftsoRegistry() | ${err}`)
            return; // No point in continuing without ftso registry
        }

        // 2. get ftsos
        try {
            let voterWhitelisterAddress = await this.priceSubmitterWeb3Contract.methods.getVoterWhitelister().call();
            this.logger.info(`VoterWhitelisterAddress: ${voterWhitelisterAddress}`);
            this.voterWhitelisterContract = await getWeb3Contract(this.web3, voterWhitelisterAddress, "VoterWhitelister");

            // if file .whitelisted does not exists then enable whitelisting
            if( !fs.existsSync(".whitelisted") )
            {
                conf.whitelist = true;                
                this.logger.info(`whitelisting enabled`);
            }

            try {
                let lst = await this.ftsoManagerWeb3Contract.methods.getFtsos().call();
                this.ftsosCount = lst.length;
                for (let ftso of lst) {
                    let contract = await getWeb3Contract(this.web3, ftso, "Ftso");
                    try {
                        let symbol = await contract.methods.symbol().call();
                        this.ftsoContracts.push({
                            symbol,
                            contract: await getContract(this.provider, ftso, "Ftso")
                        });
                        this.logger.info(`Symbol: ${symbol}`);
                        this.ftso2symbol.set(ftso, symbol);
                        let index = await this.ftsoRegistryContract.methods.getFtsoIndex(symbol).call();
                        this.logger.info(`INDEX: ${index.toString()}`)
                        this.symbol2Index.set(symbol, index);
                        if (conf.whitelist) {
                            try {
                                var fnToEncode = this.voterWhitelisterContract.methods.requestWhitelistingVoter(this.account.address, index);
                                await this.signAndFinalize3("Whitelist", this.voterWhitelisterContract.options.address, fnToEncode, "2500000");
                                this.logger.info(`${symbol} whitelisted.`)
                            } catch (err: any) {
                                this.logger.error(`symbol() | requestWhitelistingVoter() | ${err}`)
                            }
                        }
                    } catch (err: any) {
                        this.logger.error(`symbol() | ${err}`)
                    }
                }

                if (conf.whitelist) {
                    // if whitelisting was done then create .whitelisted file
                    fs.writeFileSync(".whitelisted", "done");
                    this.logger.info(`whitelisting completed`);
                }
            } catch (err: any) {
                this.logger.error(`getFtsos() | ${err}`)
            }
        } catch (err: any) {
            this.logger.error(`priceSubmitter() | ${err}`)
        }

        // 3. get epochinfo from ftsomanager
        try {
            let data = await this.ftsoManagerWeb3Contract.methods.getPriceEpochConfiguration().call() as any;
            this.epochSettings = new EpochSettings(bigNumberToMillis(data[0]), bigNumberToMillis(data[1]), bigNumberToMillis(data[2]));
            // console.log("this.epochSettings=", this.epochSettings)
            this.setupSubmissionAndReveal();
        } catch (err: any) {
            this.logger.error(`getPriceEpochConfiguration() | ${err}`);
        }

        this.setupEvents();
    }
}


const dataProvider = new DataProvider(conf);

dataProvider.runDataProvider();
