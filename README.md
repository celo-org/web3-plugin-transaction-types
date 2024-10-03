# @celo/web3-plugin-transaction-types

## Installation

```bash
npm install --save @celo/web3-plugin-transaction-types web3@4.13.1
```

> [!IMPORTANT]
>
> `web3` is a peer dependency and MUST be installed alongside this library.

## Usage

### Setup

```ts
import { Web3 } from "web3";
import { CeloTransactionTypesPlugin } from "@celo/web3-plugin-transaction-types";

const web3 = new Web3("http://127.0.0.1:8545");
web3.registerPlugin(new CeloTransactionTypesPlugin());

// Now `web3.celo` is available and `celo.eth` is celo-aware

const cEUR = await web3.celo.getCoreContractAddress("StableTokenEUR");
const txData = {
  from: "0x123...",
  to: "0x456...",
  value: 123n,
  feeCurrency: cEUR, // optional
};
await web3.celo.populateTransaction(txData);
const tx = await web3.eth.sendTransaction(txData);
```

### Utilities

```ts
// `isValidFeeCurrency`
// Check if an address is a whitelisted feeCurrency
const valid: boolean = await web3.celo.isValidFeeCurrency("0x1234...");

// `getCoreContractAddress`
// Fetch from the celo Registry contract the address of a given human readable name
const cEUR: Address = await web3.celo.getCoreContractAddress("StableTokenEUR");
const governance: Address = await web3.celo.getCoreContractAddress(
  "Governance"
);
```

### Celo Contract interaction

```bash
npm install --save @celo/abis
```

```ts
import { stableTokenEurABI } from "@celo/abis";
import { CeloContract } from "@celo/web3-plugin-transaction-types";

const cEUR = await web3.celo.getCoreContractAddress("StableTokenEUR");
const cEURContract = new CeloContract(stableTokenEurABI, cEUR, web3);

const to = "0x123...";
const amount = 123n;

const tx = await cEURContract.methods.transfer(to, amount).send({
  from: web3.eth.defaultAccount,
  feeCurrency: stableAddress, // optional
});

const balance = BigInt(
  await cEURContract.methods.balanceOf(account2.address).call()
);
```
