import { BigNumber } from 'ethers';

export class EpochSettings {
    private _firstEpochStartTime: BigNumber;     // in milliseconds
    private _submitPeriod: BigNumber;            // in milliseconds
    private _revealPeriod: BigNumber;            // in milliseconds
    private _firstEpochId: BigNumber = BigNumber.from(0);

    // all values are in milliseconds
    constructor(_firstEpochStartTime: BigNumber, _submitPeriod: BigNumber, _revealPeriod: BigNumber) {
        this._firstEpochStartTime = _firstEpochStartTime;
        this._submitPeriod = _submitPeriod;
        this._revealPeriod = _revealPeriod;
    }

    private getEpochIdForTime(timeInMillis: number): BigNumber {
        let diff: BigNumber = BigNumber.from(timeInMillis).sub(this._firstEpochStartTime);
        return this._firstEpochId.add(diff.div(this._submitPeriod));
    }

    getCurrentEpochId(): BigNumber {
        return this.getEpochIdForTime(new Date().getTime());
    }

    // in milliseconds
    getEpochSubmitTimeEnd(): BigNumber {
        let id: BigNumber = this.getCurrentEpochId().add(BigNumber.from(1)).add(this._firstEpochId);
        return this._firstEpochStartTime.add(id.mul(this._submitPeriod));
    }

    // in milliseconds
    getEpochReveaTimeEnd(): BigNumber {
        return this.getEpochSubmitTimeEnd().add(this._revealPeriod);
    }

    // in milliseconds
    getRevealPeriod(): BigNumber {
        return this._revealPeriod;
    }

    // in milliseconds
    getSubmitPeriod(): BigNumber {
        return this._submitPeriod;
    }
}