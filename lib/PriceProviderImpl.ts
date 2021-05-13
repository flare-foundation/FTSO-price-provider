import { IPriceProvider } from "./IPriceProvider";
var randomNumber = require("random-number-csprng");

export class RandomPriceProvider implements IPriceProvider {

    private _pair:string;

    constructor(pair:string) {
        this._pair = pair;
    }

    getPair(): string {
        return this._pair;
    }

    getPrice(): Promise<number> {
        return randomNumber(1, 5);
    }
}