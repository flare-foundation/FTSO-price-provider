
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

    setLogger(logger:any): void {

    }

    setUsdtUsdProvider(provider:IPriceProvider): void {

    }

    init(): void {

    }
}

//////////////////////////////////////////////////////////////////////////////////////////
// Configurable exchange price provider
//////////////////////////////////////////////////////////////////////////////////////////

export class WsLimitedPriceProvider implements IPriceProvider {

    private _logger!: any;
    private _usdtUsdProvider!: IPriceProvider;
    private _factor!: any;
    private _type!: any;
    private _pair!: string;
    private _exchanges!: any;
    private _name2client!: any;
    private _ex2priceInfo!: any;
    private _forceUsdtUsdConversion!: boolean;

    // exchanges = [ ["bitstamp", "xrp/usd"], ["...", "..."], ... ]
    // type is either 'first' or 'avg'
    constructor(pair: string, factor: number, exchanges: any, type: string, forceUsdtUsdConversion: boolean = true) {
        this._forceUsdtUsdConversion = forceUsdtUsdConversion;
        this._factor = factor;
        this._type = type
        this._pair = pair;
        this._exchanges = exchanges;
        this._name2client = {};
        this._ex2priceInfo = {};
    }
    
    init(): void {
        for (let { ex, market, client } of this._exchanges) {
            this._name2client[ex] = client;
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

    setLogger(logger:any): void {
        this._logger = logger;
    }

    setUsdtUsdProvider(provider:IPriceProvider): void {
        this._usdtUsdProvider = provider;
    }

    async getUsdtConversionRate(market:string): Promise<number> {
        if(market.endsWith('USDT') && !!this._usdtUsdProvider) {
            let rate:number = (await this._usdtUsdProvider.getPrice()) || 1.0;
            if(this._forceUsdtUsdConversion || Math.abs(rate - 1.0) > 0.01) {
                return rate;
            }
        }
        return 1.0;
    }

    async subscribeTo(ex: string, pair: string, marketObj: any) {
        let self = this;
        let client = this._name2client[ex];

        client.on("trade", (trade: any, mObj: any) => {
            if(mObj.base == marketObj.base && mObj.quote == marketObj.quote) {            
                self._ex2priceInfo[ex] = {
                    price: trade.price,
                    priceTime: trade.unix
                }
                // self._logger.info(`Exchange: ${ ex }, pair: ${ pair }, price: ${ trade.price }`);
            }
        });

        client.subscribeTrades(marketObj);
        if(['bitfinex'].indexOf(ex) < 0) {
            client.subscribeTicker(marketObj);  // we need it for watcher!
        }
    }

    marketId(clientStr:string, base:string, quote:string):string {
        if(clientStr == 'kucoin' || clientStr == 'bittrex' || clientStr == 'okex' || clientStr == 'coinbasepro' || clientStr == 'coinflex' || clientStr == 'cex') {
            return `${base.toUpperCase()}-${quote.toUpperCase()}`;
        } else if(clientStr == 'bitstamp' || clientStr == 'liquid' || clientStr == 'huobi' || clientStr == 'bitrue' || clientStr == 'zb') {
            return (base + quote).toLowerCase();
        } else if(clientStr == 'gateio' || clientStr == 'bitflyer' || clientStr == 'zt' || clientStr == 'digifinex' || clientStr == 'crypto' || clientStr == 'bibox' || clientStr == 'mexc' || clientStr == 'bitmart') {
            return `${base.toUpperCase()}_${quote.toUpperCase()}`;
        } else if(clientStr == 'lbank') {
            return `${base.toLowerCase()}_${quote.toLowerCase()}`;
        } else if(clientStr == 'ftx' || clientStr == 'ftxus' || clientStr == 'ascendex') {
            return `${base.toUpperCase()}/${quote.toUpperCase()}`;
        } else if(clientStr == 'poloniex') {
            return `${quote.toUpperCase()}_${base.toUpperCase()}`;
        } else if(clientStr == 'upbit') {
            return `${quote.toUpperCase()}-${base.toUpperCase()}`;
        } else if( (clientStr == 'kraken' || clientStr == 'bitmex') && base == 'BTC') {
            return `XBT${quote.toUpperCase()}`;
        } else if(clientStr == 'kraken' && base == 'DOGE') {
            return `XDG${quote.toUpperCase()}`;
        } else if(clientStr == 'bitfinex') {
            if(['ADA', 'XRP', 'XLM', 'BTC', 'ETH', 'FIL', 'LTC', 'SGB'].indexOf(base) >= 0 && quote == 'USDT') {
                return `t${base}UST`;
            } else if(base == 'DOGE') {
                if(quote == 'USDT') {
                    return `tDOGE:UST`;
                } else {
                    return `tDOGE:${quote}`;
                }
            } else if(base == 'ALGO') {
                if(quote == 'USDT') {
                    return `tALGUST`;
                } else {
                    return `tALG${quote}`;
                }
            } else if(base == 'BCH') {
                return `tBCHN:${quote}`;
            } else {
                return `t${base}${quote}`;
            }
        } else if(clientStr == 'fmfw' && base == 'ALGO' && quote == 'USDT') {
            return "ALGOUSD";
        } else if(clientStr == 'bitforex') {
            return `coin-${quote.toLowerCase()}-${base.toLowerCase()}`;
        } else {
            return (base + quote).toUpperCase();
        }
    }

    subscribe(ex: string, pair: string): void {
        let tmp:any = pair.split("/");
        let base:string = tmp[0];
        let quote:string = tmp[1];
        let marketObj = { id: this.marketId(ex, base, quote), base, quote, type: 'spot' };
        this.subscribeTo(ex, pair, marketObj);
    }


    async getRestPrice(): Promise<number> {
        let prices = [];
        for (let { ex, market } of this._exchanges) {
            try {
                let ccxtex = new (ccxt as any)[ex]({ timeout: 2 * 1000 });
                let ticker = await ccxtex.fetchTicker(market);
                if (ticker) {
                    prices.push(Number(ticker.last));
                    break;
                }
            } catch(e:any) {

            }
        }
        return this.getAveragePrice(prices);
    }


    async getPrice(): Promise<number> {
        let prices = [];
        if(this._exchanges.length > 0) {
            let conversionRate:number = await this.getUsdtConversionRate( this._exchanges[0].market );
            for (let { ex } of this._exchanges) {
                let priceInfo = this._ex2priceInfo[ex];
                // price shall not be older than 3min
                if (priceInfo && priceInfo.price && priceInfo.priceTime > Date.now() - 1000*60*3) {
                    prices.push(Number(priceInfo.price) * conversionRate);
                    if (this.isFirst()) {
                        break;
                    }
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
