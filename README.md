# *Flare Network* price provider

The repository contains an example of *Flare Network* price provider implementation. 

*Flare Networks* encourages data providers to develop their own custom data provider code, mainly due to competitive nature of price provision in pursuit of Flare Time Series Oracle rewards.  

## How it works?

Data provider is a process that on one hand collects prices of selected currencies from selected exchanges, and on the other hand sends those prices to a special contract (`PriceSubmitter`) as a data feed for *Flare Time Series Oracle* (FTSO). Several data providers send their price feeds to FTSO system, one price per a 3 minute interval, that is called *price epoch*, in essence voting for prices in that epoch. For each price epoch and each currency votes from all data providers are collected and the "consensus" price is calculated by using weighted median algorithm. Namely, each data provider can have different vote power (weight), which corresponds to sum of holdings and delegations for WSGB token. In each price epoch only one (randomly chosen) currency is rewarded. Voters that are close to median price get rewards in form of SGB tokens.

Voting (=sending a price in price epoch) is done in two steps. First step is called *submitting* price and this one should be done within the timeframe of price epoch. Immediately after price epoch ends, a new price epoch starts. At the same the time window for the second step, *revealing* opens. While price epoch (=time to submit) lasts 3 minutes, *reveal epoch* (= window timeframe for revealing) lasts 1.5 minutes and corresponds to the first half of the next price epoch. Each price epoch has its own `epochId`.

Prices are always submitted in USD. Submitting (or sometimes called *commiting*) the price requires defining the following values:
- price (an integer where certain number of least significant digits are considered as decimals)
- randomly generated large number (in range of `uint256`)

The hash of price, the random number and sender's address is calculated. This is can be done for all currencies. Then the contract function `PriceSubmitter.submitPriceHashes(epochId, ftosIndices, hashes)` is called with the list of currency indices `ftsoIndices` and corresponding list of `hashes`. If other than current `epochId` is used, the call gets reverted.

When price epoch ends, reveal epoch starts and if a voter subitted the price for the just expired price epoch, the voter can reveal price by calling 
`PriceSubmitter.revealPrices(epochId, ftsoIndices, prices, randoms)` and thus disclose and provide actual prices.
When reveal epoch ends, all revealed prices are collected and used for calculation of the weighted median price.
 
### Whitelisting

Prices can be provided to FTSO system only by trusted providers and whitelisted ones. Trusted providers are providers that are selected by governance. All other providers can try to get whitelisted. Whitelisting is completely decentralized procedure and it is purely based on vote power. It is managed by `VoterWhitelister` contract. Any data provider with `address` can try to whitelist itself for a currency with `index` by calling `VoterWhitelister.requestWhitelistingVoter(address, index)`. If data provider's vote power (= WSGB balance + WSGB delegations) is high enough, it gets whitelisted. For each currency at most 100 whitelisted data providers can exist. A new data provider can get whitelisted only if there are still free empty slots or its vote power is greater than vote power of some already whitelisted data provider. In this case the whitelisted data provider with minimal vote power gets removed from the whitelist. This is fully managed by `VoterWhitelister.requestWhitelistingVoter(...)`. At any time, a data provider can try to obtain its whitelisting mask, but calling `PriceSubmitter.voterWhitelistBitmap(address)`. This is a bit mask, where positions of bits correspond to indices of currencies. An index for a supported currency can be obtained on `FtsoRegistry` contract, by calling `FtsoRegistry.getFtsoIndex(symbol)`. Supported symbols list can be obtained by calling `FtsoRegistry.getSupportedSymbols()`.

### Pricing transactions and priority

If trusted or whitelisted providers are sending correctly formated submit and/or reveal transactions, they do not get reverted. Furthermore, `PriceSubmitter` is a contract with a special treatment withing the network, hence providers pay only 21k gas x 225 Gwei, thus minimal transaction cost for either submit or reveal transaction. The `gasPrice` of a transaction is used for prioritizing transaction in transaction pool, but not for charging. Since data providing is a time critical operation, trusted and whitelisted providers are allowed to provide comparatively high gas prices to raise the priority of their transactions, but are not charged for that. Reveal transactions for more than 10 currencies can burn more than 1M gas in block, but a valid data provider will not be charged for that. 
On the other hand, if a transaction to any call of `PriceSubmitter` contract is reverted, the transaction is charged as usual (burned gas x gasPrice). Note that sending any submit or reveal transaction from data provider that is neither trusted nor whitelisted for a specific currency will revert. Also note, that whitelisting is done per currency. Data provider can submit and reveal prices only for currencies for which it is whitelisted - otherwise calls get reverted. 

## Getting started

- Clone this repository.
- Call `yarn` to install node packages.
- Set up the correct configuration in `configs/config.json` (See *Configuration* below).
- Provide or obtain some vote power to the account from which data provider will be sending prices. For that SGB coins need to be wrapped to WSGB tokens and either put on the balance of the account or some other account(s) should delegate vote power to that account.
- Run the data provider by calling `./scripts/run-provider.sh ./configs/config.json`

## Configuration

Data provider is configured by a JSON configuration file. In addition certain parameters can be overriden through environment variable definition in .env file and the private key can be obtained through Google Cloud Secret Manager. Typical configuration looks like this:

```
{
    "accountPrivateKey": <PRIVATE KEY OF YOUR ACCOUNT in 0x... form>,
    "rpcUrl": <RPC URL OF A NETWORK NODE>,
    "priceSubmitterContractAddress": "0x1000000000000000000000000000000000000003",
    "submitOffset": 80000,
    "revealOffset": 2000,
    "whitelist": false,
    "trusted": true,
    "gasPrice": "225000000000",
    "priceProviderList": [
        {
            "symbol": "XRP",
            "decimals": 5,
            "priceProviderClass": "WsLimitedPriceProvider",
            "priceProviderParams": ["XRP/USD", 1.0, [["binanceus","XRP/USD"],["bittrex","XRP/USD"],["kraken","XRP/USD"],["bitstamp","XRP/USD"],["gateio","XRP/USD"]], "first"]
        },
        {
            "symbol": "LTC",
            "decimals": 5,
            "priceProviderClass": "WsLimitedPriceProvider",
            "priceProviderParams": ["LTC/USD", 1.0, [["binanceus","LTC/USD"],["coinbasepro","LTC/USD"],["bitstamp","LTC/USD"],["kraken","LTC/USD"],["bittrex","LTC/USD"]], "first"]
        },
        ...
    ]
}
```

### Explanation of parameters in a configuration file

- `accountPrivateKey` - Private key of your account from which prices will be sent. If you use this the private key will be stored on the file system. Make sure to properly secure the server and in case a cloud based virtual machine is used, that the discs are encrypted.
- `rpcUrl` - RPC url of the API node connected to *Songbird Network*.
- `ftsoManagerContractAddress` - Address of the `FtsoManager` contract on the *Flare Network*.
- `submitOffset` - Defines the delay in ms of sending submit calls relative to the start of a price epoch. 
- `revealOffset` - Defines the delay in ms of sending reveal calls relative to the start of reveal period.
- `whitelist` - Defines whether whitelist procedure should be executed at the beginning of the run. Usually should be set to true at least for the first run.
- `trusted` - Defines whether the address of the data provider is trusted. Trusted providers are 
- `gasPrice` - Gas price for transactions sent (submits and reveals). 

- `priceProviderList` - A list of price provider data. Each object has the following parameters:
  - `symbol` - FAsset which price will be submitted/revealed (eg. FXRP, FLTC, etc.)
  - `decimals` - Number of decimals (default: 5).
  - `priceProviderClass` - Name of the class as defined in `PriceProviderImpl.ts` (must implement `IPriceProvider` interface).
  - `priceProviderParams` - Array of parameters that are passed to constructor of `priceProviderClass`.

**NOTE:** while prices can be submitted to smart contract, the voting power of the account is initially 0, even if the account has large FLR balance. Voting power is obtained by holding wrapped FLRs (Wflr) and/or relevant Fasset tokens. Those can be obtained through `Wflr` contract and relevant Fasset token contracts. See [flare-smart-contracts repo](https://gitlab.com/flarenetwork/flare-smart-contracts) for details.

## IPriceProvider interface and implementations

For custom price collection on can implement its own class obeying `IPriceProvider` interface. This example provides one such implementation 

### `WsLimitedPriceProvider``

We currently use `WsLimitedPriceProvider` class that implements `IPriceProvider` and serves as a provider for prices on *Songbird Network*. Structure of configuration file is the same as described above, so one must set `priceProviderClass` variable to `"WsLimitedPriceProvider"` and `priceProviderParams` to the following list: `[pairName, factor, list of tuples[exchange,pair on that exchange], mode]`.

- `pairName`: just the name of the pair for which we are submitting the price
- `factor`: a number with which we multiply the retrieved price from external exchanges to be then send to *Flare Networks* (usually is 1.0)
- `list of tuples`: each tuple consists of two values. First is external exchange name (eg. `bitstamp`, `kraken`, `binanceus`), while the second is the pair name on that exchange (eg. `XRPUSD`, `xrpusd`, `XRP-USD`). List may be arbitrary long and serves as list of priorities, that is first we try to retrieve the price from the first tuple in the list, then from the second, etc. Then depending on the last parameter - `mode` - we calculate the price and feed it to *Songbird Network*.
- `mode`: it can either be `first` or `avg`. In the first case it means it returns the price from the first tuple in the list that is possible (if first fails, tries with the second, etc.); in the second case - `avg` - it retrieves prices from all tuples in the list (some may fail and are thus skipped) and then calculates the average of their prices to be fed to *Songbird Network*

Note that this provider is retrieving prices by subscribing to websockets of the exchanges passed in the list of tuples. If no price can be retrieved from websockets, then it fallbacks to retrieving prices via REST API calls - again prioritized by list of tuples.

## Dockerization
-------------

Docker build is started by command: 
```
yarn docker-build
```
which runs script `scripts/docker-build.sh`

In case an error of the following form occurs during the build start:
`Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?`
docker daemon service should be restarted by
`sudo service docker start`

Docker deploy is issued with command:
`yarn docker-deploy`
which runs the script `scripts/docker-build.sh`

Deployment address is defined by setting SERVER variable in the script.
