Flare price provider
====================

In this repository one can find an example of flare price provider implementation. Before running the provider one must implement their own price provider. That is a class that implements `IPriceProvider` interface. Class must provide `getPrice()` that is called when submitting the price to Flare network. Also, it must be put in `PriceProviderImpl.ts` file (see example `RandomPriceProvider`).

In order to run the flare provider with the wanted price provider one must prepare the configuration json file. See the example with the `RandomPriceProvider` saved to `example.json`:

```
{
    "accountPrivateKey": <PRIVATE KEY OF YOUR ACCOUNTY>,
    "rpcUrl": <RPC URL OF THE NODE CONNTECTED TO FLARE NETWORK>,
    "priceProviderList": [
        {
            "pair": "XRP/USD",
            "decimals": 5,
            "contractAddress": <ADDRESS OF THE FtsoFxrp SMART CONTRACT>,
            "submitOffset": 80000,
            "revealOffset": 2000,
            "priceProviderClass": "RandomPriceProvider",
            "priceProviderParams": ["XRP/USD"]
        },
        {
            "pair": "XDG/USD",
            "decimals": 5,
            "contractAddress": <ADDRESS OF THE FtsoFxdg SMART CONTRACT>,
            "submitOffset": 100000,
            "revealOffset": 4000,
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
priceProviderList: List of price provider data
    pair: Crypto currency pair for which price will be submitted
    decimals: Number of decimals (default: 5)
    contractAddress: Address of the contract on Flare network (e.g. for XPR/USD, we need addres of FtsoFxrp smart contract)
    submitOffset: Tells us how much after start of submit period, we submit the price (in milliseconds)
    revealOffset: Tells us how much after start of reveal period, we reveal the price (in milliseconds)
    priceProviderClass: Name of the class as defined in PriceProviderImpl.ts (must implement IPriceProvider interface)
    priceProviderParams: Array of parameters that are passed to constructor of 'priceProviderClass'
```