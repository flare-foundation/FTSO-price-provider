export class DataProviderConfiguration {

    public accountPrivateKey!: string;
    public rpcUrl!: string;
    public priceProviderList:PriceProviderConfiguration[] = [];
    public priceSubmitterContractAddress!: string;
    public submitOffset:number=60000;   // in millis - tells us how much after start of submit period, we submit the price (e.g. if submitOffset = 30000, then price will be submitted 30s after epoch submit period starts) 
    public revealOffset:number=1000;    // in millis - tells us how much after start of reveal period, we reveal the price (e.g. if revealOffset = 10000, then price will be revealed 10s after epoch reveal period starts)

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
        } else if(!this.priceSubmitterContractAddress) {
            throw Error("Parameter 'priceSubmitterContractAddress' is missing, but is required");
        }
    }
}

export class PriceProviderConfiguration {

    public pair!: string; // format: <base>/<quote> (e.g. XRP/USD)
                     // format: <base>/<quote> (e.g. XRP/USD)
    public decimals:number = 5;
    public contractAddress!: string;    
    public priceProviderClass!: string; // must implement IPriceProvider (e.g. RandomPriceProvider)
    public priceProviderParams!: any[]; // parameters to send to constructor of price provider class (e.g. ["XRP/USD"])

    validate(index:number) {
        if(!this.pair) {
            throw Error("Parameter 'pair' in priceProviderList["+index+"] is missing, but is required");
        } else if(!this.contractAddress) {
            throw Error("Parameter 'contractAddress' in priceProviderList["+index+"] is missing, but is required");
        } else if(!this.contractAddress) {
            throw Error("Parameter 'contractAddress' in priceProviderList["+index+"] is missing, but is required");
        } else if(!this.priceProviderClass) {
            throw Error("Parameter 'priceProviderClass' in priceProviderList["+index+"] is missing, but is required");
        }
    }
}
