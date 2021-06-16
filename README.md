*Flare Network* price provider
====================

The repository contains an example of *Flare Network* price provider implementation. 

## Getting started (test environment)

- Clone this repository.
- Call `yarn` to install node packages.
- Make sure the development version of *Flare Network* (`scdev`) nodes runs localy and the relevant contracts are deployed ([instructions](https://gitlab.com/flarenetwork/flare-smart-contracts)).

While a test run can be carried out with test random provider, before running the provider with real prices, one should implement their own price feed class. That is a class that implements `IPriceProvider` interface. Class must provide `getPrice()` that is called when submitting the price to *Flare Network*. Also, it must be put in `PriceProviderImpl.ts` file (see example `RandomPriceProvider`).

In order to run the *Flare Network* price provider with the desired price provider one must prepare the JSON configuration file. See the example for `RandomPriceProvider` in file `example.json`, which is of the form:

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

With JSON configuration set, the price provider may be run from the root folder of the repo by calling

```
./scripts/run-provider.sh ./example.json
```

The first (and only) parameter is the path to configuration file. If omitted script looks for a file named `config.json` in the root folder.

The file `example.json` provided in the repo is pre-configured with one of the built-in private keys in the test *Flare Network* (`scdev`) with large available balance in FLR (for installation and deployment see [instructions](https://gitlab.com/flarenetwork/flare-smart-contracts)). Before running, please verify the address of `FTSO Manager` contract is correct (parameter `ftsoManagerContractAddress`). It can be obtained after the deployment of smart contracts on `scdev` network, from the generated file `deployment/deploys/scdev.json` (under the contract name `FtsoManager`) in [`flare-smart-contracts` repository](https://gitlab.com/flarenetwork/flare-smart-contracts).

Explanation of parameters in a configuration file
-------------------------------------------


- `accountPrivateKey` - Private key of your account from which prices will be sent.
- `rpcUrl` - RPC url of the API node connected to *Flare Network*.
- `ftsoManagerContractAddress` - Address of the `FtsoManager` contract on the *Flare Network*.
- `submitOffset` - Defines the delay in ms of sending submit calls relative to the start of a price epoch. 
- `revealOffset` - Defines the delay in ms of sending reveal calls relative to the start of reveal period.
- `priceProviderList` - A list of price provider data. Each object has the following parameters:
  - `symbol` - FAsset which price will be submitted/revealed (eg. FXRP, FLTC, etc.)
  - `decimals` - Number of decimals (default: 5).
  - `priceProviderClass` - Name of the class as defined in `PriceProviderImpl.ts` (must implement `IPriceProvider` interface).
  - `priceProviderParams` - Array of parameters that are passed to constructor of `priceProviderClass`.

**NOTE:** while prices can be submitted to smart contract, the voting power of the account is initially 0, even if the account has large FLR balance. Voting power is obtained by holding wrapped FLRs (Wflr) and/or relevant Fasset tokens. Those can be obtained through `Wflr` contract and relevant Fasset token contracts. See [flare-smart-contracts repo](https://gitlab.com/flarenetwork/flare-smart-contracts) for details.
