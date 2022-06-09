import { Base } from './Base';
import Decimal from 'decimal.js';

let yargs = require("yargs");

// Args parsing
let args = yargs
    .option('fee', {
        alias: 'f',
        type: 'string',
        description: 'Fee in percents',
        demand: true
    }).argv;


class SetFee extends Base {

    public async run():Promise<void> {
        await this.init('SetFee');

        let fee:Decimal = new Decimal(args.fee);
        if(fee.lessThan(0) || fee.greaterThan(100.0)) {
            throw new Error(`Argument fee (${args.fee}) must be between 0 and 100`);
        }

        let receipt: any = await this.signAndFinalize3("SetFee", this.ftsoRewardManagerContract.options.address, this.ftsoRewardManagerContract.methods.setDataProviderFeePercentage(fee.mul(100).toString()));
        if(receipt) {
            this.logger.info(`Succesfully set fee percentage! Transaction hash: ${receipt.transactionHash}`);
        }
    }
}

new SetFee().run().then(() => process.exit(0));