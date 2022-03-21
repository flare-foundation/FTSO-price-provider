
import * as ccxt from 'ccxt';
import { logger } from 'ethers';
import * as fs from 'fs';
import { IPriceProvider } from "./IPriceProvider";
var randomNumber = require("random-number-csprng");
var ccxws = require('ccxws');


//////////////////////////////////////////////////////////////////////////////////////////
// Random price provider
//////////////////////////////////////////////////////////////////////////////////////////

export class RandomPriceProvider implements IPriceProvider {

    private _pair: string;

    constructor(pair: string) {
        this._pair = pair;
    }

    getPair(): string {
        return this._pair;
    }

    getPrice(): Promise<number> {
        return randomNumber(1, 5);
    }
}

//////////////////////////////////////////////////////////////////////////////////////////
// Configurable exchange price provider
//////////////////////////////////////////////////////////////////////////////////////////

export class WsLimitedPriceProvider implements IPriceProvider {

    private _logger!: any;
    private _factor!: any;
    private _type!: any;
    private _pair!: string;
    private _exchanges!: any;
    private _name2client!: any;
    private _ex2priceInfo!: any;

    // exchanges = [ ["bitstamp", "xrp/usd"], ["...", "..."], ... ]
    // type is either 'first' or 'avg'
    constructor(pair: string, factor: number, exchanges: any, type: string, logger: any = null) {
        this._logger = logger;
        this._factor = factor;
        this._type = type
        this._pair = pair;
        this._exchanges = exchanges;
        this._name2client = {};
        this._ex2priceInfo = {};

        for (let p of exchanges) {
            let ex = p[0];
            let market = p[1];
            this._name2client[ex] = new (ccxws as any)[ex]();
            this.loadMarketsAndSubscribe(ex, market);
        }
    }

    isFirst(): boolean {
        return this._type == 'first';
    }

    isAverage(): boolean {
        return this._type == 'avg';
    }

    getPair(): string {
        return this._pair;
    }

    getExchange(): string {
        return this._exchanges[0][0];
    }

    async subscribeTo(ex: string, pair: string, marketObj: any) {
        let self = this;
        let client = this._name2client[ex];

        client.on("error", (err: any) => self._logger.error(`Error for pair ${pair} on exchange ${ex}: ${err}`));
        client.on("ticker", (a: any, b: any) => {
            self._ex2priceInfo[ex] = {
                price: a.last,
                priceTime: new Date().getTime()
            }
            // self._logger.info(`Exchange: ${ ex }, pair: ${ pair }, price: ${ a.last }`);
        });

        try {
            client.unsubscribeTicker(marketObj);
        } catch (e) {
            this._logger.info(`Unsubscribe error: ${e}`);
        }
        client.subscribeTicker(marketObj);
    }

    loadMarketsAndSubscribe(ex: string, pair: string): void {
        let self = this;
        const ccxtex = new (ccxt as any)[ex]({ timeout: 20 * 1000 });

        ccxtex.loadMarkets().then((data: any) => {
            let market = data[pair];


            if (market) {
                let marketObj = { id: market.id, base: market.base, quote: market.quote, type: 'spot' };
                self.subscribeTo(ex, pair, marketObj);
            } else {
                self._logger.error(`Bad market: ${pair}. Not supported by ${ex}.`)
                throw Error(`Bad market: ${pair}. Not supported by ${ex}.`);
            }
        });
    }

    async getRestPrice(): Promise<number> {
        let prices = [];
        for (let p of this._exchanges) {
            let ccxtex = new (ccxt as any)[p[0]]({ timeout: 20 * 1000 });
            let ticker = await ccxtex.fetchTicker(p[1]);
            if (ticker) {
                prices.push(Number(ticker.last));
                if (this.isFirst()) {
                    break;
                }
            }
        }
        return this.getAveragePrice(prices);
    }


    async getPrice(): Promise<number> {
        let prices = [];
        for (let ex of this._exchanges.map((x: any) => x[0])) {
            let priceInfo = this._ex2priceInfo[ex];
            // price should not be older than 10s!!! TODO: parameter maybe!
            if (priceInfo && priceInfo.price && priceInfo.priceTime + 10 * 1000 >= new Date().getTime()) {
                prices.push(Number(priceInfo.price));
                if (this.isFirst()) {
                    break;
                }
            }
        }

        if (prices.length > 0) {
            let price = this.getAveragePrice(prices);
            return Promise.resolve(price);
        } else {
            return this.getRestPrice();
        }
    }

    getAveragePrice(prices: any): number {
        if (prices.length == 0) {
            throw Error(`No price was retrieved for ${this._pair}!`);
        } else {
            return (prices.reduce((a: any, b: any) => a + b, 0.0) / prices.length) * this._factor;
        }
    }
}
