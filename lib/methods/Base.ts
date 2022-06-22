import Web3 from 'web3';
import { FtsoManager } from '../../typechain-web3-v1/FtsoManager';
import { PriceSubmitter } from '../../typechain-web3-v1/PriceSubmitter';
import { WNat } from '../../typechain-web3-v1/WNat';
import { FtsoRewardManager } from '../../typechain-web3-v1/FtsoRewardManager';
import { DotEnvExt } from '../DotEnvExt';
import { fetchSecret } from '../GoogleSecret';
import { getLogger, getWeb3, getWeb3Contract, getWeb3Wallet, waitFinalize3Factory } from '../utils';
import Decimal from 'decimal.js';

export class Base {

    protected logger!: any;

    protected web3!: Web3;
    protected account: any;

    // Contracts
    protected priceSubmitterContract!: PriceSubmitter;
    protected ftsoManagerContract!: FtsoManager;
    protected wnatContract!: WNat;
    protected ftsoRewardManagerContract!: FtsoRewardManager;

    protected waitFinalize3: any

    // Price submitter contract is fixed, since it's deployed in genesis
    protected PRICE_SUBMITTER_CONTRACT_ADDRESS:string = "0x1000000000000000000000000000000000000003";
    protected WEI:Decimal = new Decimal(10**18);

    protected async init(label:string): Promise<void> {
        this.logger = getLogger(label);
        DotEnvExt();
        
        this.logger.info(`Starting ${label} script`);
        
        // 1. get account private key
        let accountPrivateKey: string = ""
        if (process.env.PROJECT_SECRET !== undefined) {
            this.logger.info(`   * account read from secret '${process.env.PROJECT_SECRET}'`);
            accountPrivateKey = (await fetchSecret(process.env.PROJECT_SECRET as string) as string);
        } else if(process.env.PRIVATE_KEY !== undefined) {
            this.logger.info(`   * account read from .env (PRIVATE_KEY)`)
            accountPrivateKey = (process.env.PRIVATE_KEY as string)
        }
        
        // 2. get RPC url
        let rpcUrl:string = process.env.RPC_URL as string;
        this.logger.info(`   * rpcUrl from .env '${rpcUrl}'`);

        // 3. init web3, account & cotnracts
        this.web3 = getWeb3(rpcUrl);
        this.waitFinalize3 = waitFinalize3Factory(this.web3);
        this.account = getWeb3Wallet(this.web3, accountPrivateKey);

        this.priceSubmitterContract = await getWeb3Contract(this.web3, this.PRICE_SUBMITTER_CONTRACT_ADDRESS, "PriceSubmitter");
        this.logger.info(`   * PriceSubmitter address: ${this.PRICE_SUBMITTER_CONTRACT_ADDRESS}`);

        let ftsoManagerAddress = await this.priceSubmitterContract.methods.getFtsoManager().call();
        this.logger.info(`   * FtsoManager address obtained: ${ftsoManagerAddress}`);
        this.ftsoManagerContract = await getWeb3Contract(this.web3, ftsoManagerAddress, "FtsoManager");
        
        let ftsoRewardManagerAddress = await this.ftsoManagerContract.methods.getFtsoRewardManager().call();
        this.ftsoRewardManagerContract = await getWeb3Contract(this.web3, ftsoRewardManagerAddress, "FtsoRewardManager");
        this.logger.info(`   * FtsoRewardManager address obtained: ${ftsoRewardManagerAddress}`);

        let wnatAddress = await this.ftsoRewardManagerContract.methods.wNat().call();
        this.wnatContract = await getWeb3Contract(this.web3, wnatAddress, "WNat");
        this.logger.info(`   * WNat address obtained: ${wnatAddress}`);
    }

    protected async getNonce():Promise<string> {
        return (await this.web3.eth.getTransactionCount(this.account.address)) + "";
    }

    protected async signAndFinalize3(label: string, toAddress: string, fnToEncode: any, value: string | undefined = undefined, gas: string = "2500000", gasPrice: string = "225000000000"): Promise<any> {
        let nonce = await this.getNonce();
        var tx = {
            from: this.account.address,
            to: toAddress,
            gas,
            gasPrice,
            data: fnToEncode.encodeABI(),
            value,
            nonce: nonce
        };
        var signedTx = await this.account.signTransaction(tx);

        try {
            return await this.waitFinalize3(this.account.address, () => this.web3.eth.sendSignedTransaction(signedTx.rawTransaction!));
        } catch (e: any) {
            if (e.message.indexOf("Transaction has been reverted by the EVM") < 0) {
                this.logger.error(`${label} | Nonce sent: ${nonce} | signAndFinalize3 error: ${e.message}`);
            } else {
                fnToEncode.call({ from: this.account.address })
                    .then((result: any) => { throw Error('unlikely to happen: ' + JSON.stringify(result)) })
                    .catch((revertReason: any) => {
                        this.logger.error(`${label} | Nonce sent: ${nonce} | signAndFinalize3 error: ${revertReason}`);
                    });
            }
            return undefined;
        }
    }
}