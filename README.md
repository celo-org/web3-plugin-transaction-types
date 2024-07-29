### @celo web3 plugins

### How to use

```ts
import { Web3 } from "web3";
import { CeloTransactionTypesPlugin } from "@celo/web3-plugin-transaction-types";

const web3 = new Web3("http://127.0.0.1:8545");
web3.registerPlugin(new CeloTransactionTypesPlugin());
```
