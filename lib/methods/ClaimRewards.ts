import { Base } from './Base';
import Decimal from 'decimal.js';

let yargs = require("yargs");

// Args parsing
let args = yargs
    .option('rewardEpochs', {
        alias: 'r',
        type: 'string',
        description: 'Reward epochs separated witch comma (e.g. 34,35,36)',
        demand: true
    }).argv;


class ClaimRewards extends Base {

    public async run():Promise<void> {
        await this.init('ClaimRewards');

        if(!/^[0-9]+(,[0-9]+)*$/.test(args.rewardEpochs)) {
            throw new Error(`Argument rewardEpochs (${args.rewardEpochs}) is in wrong format. May only include numbers separated with comma.`);
        }

        let rewardEpochs:string[] = args.rewardEpochs.split(",");
        let receipt: any = await this.signAndFinalize3("ClaimRewards", this.ftsoRewardManagerContract.options.address, this.ftsoRewardManagerContract.methods.claimReward(this.account.address, rewardEpochs));
        if(receipt) {
            this.logger.info(`Succesfully claimed rewards! Transaction hash: ${receipt.transactionHash}`);
        }
    }
}

new ClaimRewards().run().then(() => process.exit(0));