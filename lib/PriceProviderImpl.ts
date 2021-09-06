
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