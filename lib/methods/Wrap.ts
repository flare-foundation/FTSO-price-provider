import { Base } from './Base';
import Decimal from 'decimal.js';

let yargs = require("yargs");

// Args parsing
let args = yargs
    .option('amount', {
        alias: 'a',
        type: 'string',
        description: 'Amount in NAT. If empty, <balance> - 100 is wrapped.',
        demand: false
    }).argv;


class Wrap extends Base {

    private FEE_LEFTOVER:number = 100;         // in NAT

    public async run():Promise<void> {
        await this.init('Wrap');

        Decimal.set({ toExpPos: 100 });

        let wrapAmount:Decimal;
        
        // balance (in WEI)
        const balance:Decimal = new Decimal(await this.web3.eth.getBalance(this.account.address));
        const maxWrapAmount = balance.div(this.WEI).minus(this.FEE_LEFTOVER);
        
        if(args.amount) {
            wrapAmount = Decimal.min( maxWrapAmount, new Decimal(args.amount) );
        } else {
            wrapAmount = maxWrapAmount;
        }

        if(wrapAmount.lessThanOrEqualTo(0)) {
            throw new Error(`There are not enough funds to wrap. Must leave at least ${this.FEE_LEFTOVER} for fees!`);
        }
        
        // call deposit on WNat contract
        this.logger.info(`Wrapping amount: ${wrapAmount}`);
        let receipt: any = await this.signAndFinalize3("Wrap", this.wnatContract.options.address, this.wnatContract.methods.deposit(), wrapAmount.mul(this.WEI).toString());
        if(receipt) {
            this.logger.info(`Succesfully wrapped! Transaction hash: ${receipt.transactionHash}`);
        }
    }
}

new Wrap().run().then(() => process.exit(0));