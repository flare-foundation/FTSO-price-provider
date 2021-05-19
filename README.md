Flare price provider
====================

In this repository one can find an example of flare price provider implementation. Before running the provider one must implement their own price provider. That is a class that implements `IPriceProvider` interface. Class must provide `getPrice()` that is called when submitting the price to Flare network. Also, it must be put in `PriceProviderImpl.ts` file (see example `RandomPriceProvider`).

In order to run the flare provider with the wanted price provider one must prepare the configuration json file. See the example with the `RandomPriceProvider` saved to `example.json`:

```
{
    "accountPrivateKey": <PRIVATE KEY OF YOUR ACCOUNTY>,
    "rpcUrl": <RPC URL OF THE NODE CONNTECTED TO FLARE NETWORK>,
    "ftsoManagerContractAddress": <ADDRESS OF THE FtsoManager SMART CONTRACT>,
    "submitOffset": 80000,
    "revealOffset": 2000,
    "priceProviderList": [
        {
            "symbol": "FXRP",
            "decimals": 5,
            "priceProviderClass": "RandomPriceProvider",
            "priceProviderParams": ["XRP/USD"]
        },
        {
            "symbol": "FXDG",
            "decimals": 5,
            "priceProviderClass": "RandomPriceProvider",
            "priceProviderParams": ["XDG/USD"]
        }
    ]
}
```

Then flare provider may be run from the root folder with the: `./scripts/run-provider.sh ./example.json`. The first (and only) parameter is the path to configuration file. If ommited script looks for file named config.json in the root folder.

Explanation of params in configuration file
-------------------------------------------

```
accountPrivateKey: Private key of your account
rpcUrl: RPC url of the node connected to flare network
ftsoManagerContractAddress: Address of the FtsoManager contract on the Flare network
submitOffset: Tells us how much after start of submit period, we submit the prices (in milliseconds)
revealOffset: Tells us how much after start of reveal period, we reveal the prices (in milliseconds)
priceProviderList: List of price provider data
    symbol: FAsset which price will be submitted/revealed (eg. FXRP, FLTC, etc.)
    decimals: Number of decimals (default: 5)
    priceProviderClass: Name of the class as defined in PriceProviderImpl.ts (must implement IPriceProvider interface)
    priceProviderParams: Array of parameters that are passed to constructor of 'priceProviderClass'
```