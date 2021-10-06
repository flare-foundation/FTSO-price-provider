import BN from 'bn.js';
export class PriceInfo {
    private SUBMITTING_STATUS = "SUBMITTING";
    private SUBMITTED_STATUS = "SUBMITTED";
    private REVEALING_STATUS = "REVEALING";
    private REVEALED_STATUS = "REVEALED";
    private STATUSES = [this.SUBMITTING_STATUS, this.SUBMITTED_STATUS, this.REVEALING_STATUS, this.REVEALED_STATUS];

    private _epochId!: string;
    private _priceRevealed!: number;
    private _priceSubmitted!: number;
    private _random!: BN;
    private _status: string = this.SUBMITTING_STATUS;

    constructor(epochId: string, priceSubmitted: number, random: BN) {
        this._epochId = epochId;
        this._priceSubmitted = priceSubmitted;
        this._random = random;
    }

    public get status(): string {
        return this._status;
    }

    public get epochId(): string {
        return this._epochId;
    }

    public get priceSubmitted(): number {
        return this._priceSubmitted;
    }

    public get priceRevealed(): number {
        return this._priceRevealed;
    }

    public set priceRevealed(value: number) {
        this._priceRevealed = value;
    }

    public get random(): BN {
        return this._random;
    }

    public moveToNextStatus(): void {
        let i = this.STATUSES.indexOf(this.status);
        this._status = this.STATUSES[i + 1];
    }

    private isStatus(status: string): boolean {
        return status == this.status;
    }

    public isSubmitting(): boolean {
        return this.isStatus(this.SUBMITTING_STATUS);
    }

    public isSubmitted(): boolean {
        return this.isStatus(this.SUBMITTED_STATUS);
    }

    public isRevealing(): boolean {
        return this.isStatus(this.REVEALING_STATUS);
    }

    public isRevealed(): boolean {
        return this.isStatus(this.REVEALED_STATUS);
    }
}
