import { Base } from './Base';
import Decimal from 'decimal.js';

let yargs = require("yargs");

// Args parsing
let args = yargs
    .option('amount', {
        alias: 'a',
        type: 'string',
        description: 'Amount in NAT. If empty, full amount is unwrapped.',
        demand: false
    }).argv;


class Unwrap extends Base {

    public async run():Promise<void> {
        await this.init('Unwrap');

        Decimal.set({ toExpPos: 100 });

        let unwrapAmount:Decimal;
        
        // balance (in WEI)
        const balance:Decimal = new Decimal(await this.wnatContract.methods.balanceOf(this.account.address).call());
        const maxUnwrapAmount = balance;
        
        if(args.amount) {
            unwrapAmount = Decimal.min( maxUnwrapAmount, new Decimal(args.amount).mul(this.WEI) );
        } else {
            unwrapAmount = maxUnwrapAmount;
        }

        // call deposit on WNat contract
        this.logger.info(`Unwrapping amount: ${unwrapAmount.div(this.WEI)}`);
        let receipt: any = await this.signAndFinalize3("Unwrap", this.wnatContract.options.address, this.wnatContract.methods.withdraw(unwrapAmount.toString()));
        if(receipt) {
            this.logger.info(`Succesfully unwrapped! Transaction hash: ${receipt.transactionHash}`);
        }
    }
}

new Unwrap().run().then(() => process.exit(0));