
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
            this.subscribe(ex, market);
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

    marketId(clientStr:string, base:string, quote:string):string {
        if(clientStr == 'kucoin' || clientStr == 'okex' || clientStr == 'coinbasepro') {
            return `${base.toUpperCase()}-${quote.toUpperCase()}`;
        } else if(clientStr == 'bitstamp' || clientStr == 'huobipro') {
            return (base + quote).toLowerCase();
        } else if(clientStr == 'gateio') {
            return `${base.toUpperCase()}_${quote.toUpperCase()}`;
        } else if(clientStr == 'ftx') {
            return `${base.toUpperCase()}/${quote.toUpperCase()}`;
        } else if( clientStr == 'kraken' && base == 'BTC') {
            return `XBT${quote.toUpperCase()}`;
        } else if(clientStr == 'kraken' && base == 'DOGE') {
            return `XDG${quote.toUpperCase()}`;
        } else {
            return (base + quote).toUpperCase();
        }
    }

    subscribe(ex: string, pair: string): void {
        let tmp:any = pair.split("/")
        let base:string = tmp[0];
        let quote:string = tmp[1];

        let marketObj = { id: this.marketId(ex, base, quote), base, quote, type: 'spot' };
        this.subscribeTo(ex, pair, marketObj);
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
            // price should not be older than 30s!!! TODO: parameter maybe!
            if (priceInfo && priceInfo.price && priceInfo.priceTime + 30 * 1000 >= new Date().getTime()) {
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