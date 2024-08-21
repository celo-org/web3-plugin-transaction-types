// create new TransactionType class which extends BaseTransaction class
import { Address, Web3Context, Web3PluginBase } from "web3";
import { TransactionFactory } from "web3-eth-accounts";
import { CIP64Transaction } from "./cip64";
import { isWhitelisted, TxTypeToPrefix } from "./utils";
import {
  type TransactionMiddlewareData,
  type TransactionMiddleware,
} from "web3/src/eth.exports";

// create new plugin and add `SomeNewTxTypeTransaction` to the library

export class CeloTransactionTypesPlugin extends Web3PluginBase {
  public pluginNamespace = "celo" as const;
  public constructor() {
    super();

    TransactionFactory.registerTransactionType(
      TxTypeToPrefix.cip64,
      CIP64Transaction
    );
    this.defaultTransactionType = TxTypeToPrefix.cip64;

    // TransactionFactory.registerTransactionType(
    //   TxTypeToPrefix.cip66,
    //   CIP66Transaction
    // );
  }

  public async isValidFeeCurrency(feeCurrency: Address) {
    return isWhitelisted(this, feeCurrency);
  }

  public link(parentContext: Web3Context): void {
    (parentContext as any).Web3Eth.setTransactionMiddleware(
      new CeloTxMiddleware()
    );
    super.link(parentContext);
  }
}

export class CeloTxMiddleware implements TransactionMiddleware {
  public async processTransaction(
    transaction: TransactionMiddlewareData
  ): Promise<TransactionMiddlewareData> {
    const txObj = { ...transaction };
    console.log("Transaction data:", txObj);
    return Promise.resolve(txObj);
  }
}

declare module "web3" {
  interface Web3Context {
    celo: CeloTransactionTypesPlugin;
  }
}
