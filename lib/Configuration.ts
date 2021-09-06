export class DataProviderConfiguration {

    public accountPrivateKey!: string;
    public rpcUrl!: string;
    public priceProviderList:PriceProviderConfiguration[] = [];
    public ftsoManagerContractAddress!: string;
    public submitOffset:number=60000;   // in millis - tells us how much after start of submit period, we submit the price (e.g. if submitOffset = 30000, then price will be submitted 30s after epoch submit period starts) 
    public revealOffset:number=1000;    // in millis - tells us how much after start of reveal period, we reveal the price (e.g. if revealOffset = 10000, then price will be revealed 10s after epoch reveal period starts)
    public gasPrice!: string;
    public whitelist!: boolean;
    public trusted!: boolean;
    public priceSubmitterContractAddress!: string;

    validate() {
        if(!this.accountPrivateKey) {
            throw Error("Parameter 'accountPrivateKey' is missing, but is required");
        } else if(!this.rpcUrl) {
            throw Error("Parameter 'rpcUrl' is missing, but is required");
        } else if(this.priceProviderList) {
            for(let i = 0; i < this.priceProviderList.length; i++) {
                var item:PriceProviderConfiguration = this.priceProviderList[i];
                item.validate(i);
            }
        } else if(!this.ftsoManagerContractAddress) {
            throw Error("Parameter 'ftsoManagerContractAddress' is missing, but is required");
        }
    }
}

export class PriceProviderConfiguration {

    public symbol!: string; // fAsset name, eg. FXRP, FXDG, FLTC, etc.
    public decimals:number = 5; 
    public priceProviderClass!: string; // must implement IPriceProvider (e.g. RandomPriceProvider)
    public priceProviderParams!: any[]; // parameters to send to constructor of price provider class (e.g. ["XRP/USD"])

    validate(index:number) {
        if(!this.symbol) {
            throw Error("Parameter 'pair' in priceProviderList["+index+"] is missing, but is required");
        } else if(!this.priceProviderClass) {
            throw Error("Parameter 'priceProviderClass' in priceProviderList["+index+"] is missing, but is required");
        }
    }
}
