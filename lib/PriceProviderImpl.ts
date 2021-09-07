
import * as ccxt from 'ccxt';
import { logger } from 'ethers';
import * as fs from 'fs';
import { IPriceProvider } from "./IPriceProvider";
var randomNumber = require("random-number-csprng");
var ccxws = require('ccxws');



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


export class WsExchangPriceProvider implements IPriceProvider {

    private _exchange!:string;
    private _ex:any;
    private _price!: number;
    private _priceTime!: number;
    private _pair!: string;
    private _logger!: any;
    private _market!: any;

    constructor(pair:string, logger:any=null) {
        this._logger = logger;
        this.randomlySelectExchange(pair);
        this._ex = new (ccxws as any)[this.getExchange()]();
        this.subscribe();
    }

    randomlySelectExchange(pair:string): void {
        let symbol = pair.split('/')[0].toUpperCase();
        if(symbol == 'FXDG' || symbol == 'XDG') {
            symbol = 'DOGE';
        } else if(symbol == 'FLR') {
            symbol = "XRP";  // Use XRP for FLR price
        } else if(symbol.charAt(0) == 'F') {
            symbol = symbol.substring(1);
        }

        let data = JSON.parse( fs.readFileSync('./data/exchanges/'+symbol).toString() );
        let exchanges = Object.keys(data.supportedBy).filter( (ex) => data.ws.indexOf(ex) >= 0 );   // let's use only those who support websockets, so we don't have to many api calls
        this._exchange = exchanges[ Math.floor(Math.random() * (exchanges.length-1)) ];
        this._pair = data.supportedBy[this._exchange];
        if(this._logger) {
            this._logger.info(`SELECTED EXCHANGE: ${ this._exchange }, SELECTED MARKET: ${ this._pair }`)
        }
    }
    
    getPair(): string {
        return this._pair;
    }
    
    getExchange(): string {
        return this._exchange;
    }

    subscribeTicker(): void {
        logger.info(JSON.stringify( this._market ));
        try {
            this._ex.unsubscribeTicker(this._market);
        } catch(e) {
            this._logger.info(`Unsubscribe error: ${ e }`);
        }
        this._ex.subscribeTicker(this._market);
    }
    
    subscribe(): void {
        const ccxtex = new (ccxt as any)[this.getExchange()]();
        let self = this;
        
        ccxtex.loadMarkets().then( (data: any) => {
            let market = data[self.getPair()];
            if(market) {
                self._ex.on("error", (err: any) => self._logger.error(err));
                self._ex.on("ticker", (a: any, b: any) => {
                    self._price = a.last;
                    self._priceTime = new Date().getTime();
                });
                self._market = { id: market.id, base: market.base, quote: market.quote, type: 'spot' };
                self.subscribeTicker();
            } else {
                self._logger.error(`Bad market: ${ self.getPair() }. Not supported by ${ self.getExchange() }.`)
                throw Error(`Bad market: ${ self.getPair() }. Not supported by ${ self.getExchange() }.`);
            }
        });
    }
    
    async getPrice(): Promise<number> {
        if(this._price && this._priceTime + 30*1000 >= new Date().getTime()) {  // price should not be older than 30s!
            let self = this;
            return Promise.resolve(self._price);
        } else {
            let ccxtex = new (ccxt as any)[this.getExchange()]( { timeout: 20*1000 } );
            let ticker = await ccxtex.fetchTicker(this.getPair());
            this._logger.error(`NO WS PRICE, EXCHANGE ${ this._exchange } DOES NOT SUPPORT MARKET: ${ this._pair }, PRICE FROM REST CALL: ${ ticker.last }`);
            // this.subscribeTicker(); // try to resubscribe
            return ticker.last;
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------


export class WsLimitedPriceProvider implements IPriceProvider {

    private _logger!: any;
    private _type!: any;
    private _pair!: string;
    private _exchanges!: any;
    private _name2client!: any;
    private _ex2priceInfo!: any;

    // exchanges = [ ["bitstamp", "xrp/usd"], ["...", "..."], ... ]
    // type is either 'first' or 'avg'
    constructor(pair:string, exchanges:any, type:string, logger:any=null) {
        this._logger = logger;
        this._type = type
        this._pair = pair;
        this._exchanges = exchanges;
        this._name2client = {};
        this._ex2priceInfo = {};

        for(let p of exchanges) {
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

    async subscribeTo(ex:string, pair:string, marketObj:any) {
        let self = this;
        let client = this._name2client[ex];

        client.on("error", (err: any) => self._logger.error(`Error for pair ${ pair } on exchange ${ ex }: ${ err }`));
        client.on("ticker", (a: any, b: any) => {
            self._ex2priceInfo[ex] = {
                price: a.last,
                priceTime: new Date().getTime()
            }
            // self._logger.info(`Exchange: ${ ex }, pair: ${ pair }, price: ${ a.last }`);
        });

        try {
            client.unsubscribeTicker(marketObj);
        } catch(e) {
            this._logger.info(`Unsubscribe error: ${ e }`);
        }
        client.subscribeTicker(marketObj);
    }

    loadMarketsAndSubscribe(ex:string, pair:string): void {
        let self = this;
        const ccxtex = new (ccxt as any)[ex]( { timeout: 20*1000 } );
        
        ccxtex.loadMarkets().then( (data: any) => {
            let market = data[pair];


            if(market) {
                let marketObj = { id: market.id, base: market.base, quote: market.quote, type: 'spot' };
                self.subscribeTo(ex, pair, marketObj);
            } else {
                self._logger.error(`Bad market: ${ pair }. Not supported by ${ ex }.`)
                throw Error(`Bad market: ${ pair }. Not supported by ${ ex }.`);
            }
        });
    }

    async getRestPrice(): Promise<number> {
        let prices = [];
        for(let p of this._exchanges) {
            let ccxtex = new (ccxt as any)[ p[0] ]( { timeout: 20*1000 } );
            let ticker = await ccxtex.fetchTicker( p[1] );
            if(ticker) {
                prices.push( ticker.last );
                if(this.isFirst()) {
                    break;
                }
            }
        }
        return this.getAveragePrice(prices);
    }

    
    async getPrice(): Promise<number> {
        let prices = [];
        for(let ex of this._exchanges.map( (x:any) => x[0])) {
            let priceInfo = this._ex2priceInfo[ex];
            // price should not be older than 10s!!! TODO: parameter maybe!
            if(priceInfo && priceInfo.price && priceInfo.priceTime + 10*1000 >= new Date().getTime()) {
                prices.push( Number(priceInfo.price) );
                if(this.isFirst()) {
                    break;
                }
            }
        }

        if(prices.length > 0) {
            let price = this.getAveragePrice(prices);
            return Promise.resolve(price);
        } else {
            return this.getRestPrice();
        }
    }

    getAveragePrice(prices:any): number {
        if(prices.length == 0) {
            throw Error(`No price was retrieved for ${ this._pair }!`);
        } else {
            return prices.reduce((a:any,b:any) => a + b, 0.0) / prices.length;
        }
    }
}