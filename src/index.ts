// create new TransactionType class which extends BaseTransaction class
import { Web3PluginBase } from "web3";
import { TransactionFactory } from "web3-eth-accounts";
import { CIP64Transaction } from "./cip64";
import { TxTypeToPrefix } from "./utils";

// create new plugin and add `SomeNewTxTypeTransaction` to the library

class CeloTransactionTypesPlugin extends Web3PluginBase {
  public pluginNamespace = "celo" as const;
  public constructor() {
    super();
    TransactionFactory.registerTransactionType(
      TxTypeToPrefix.cip64,
      CIP64Transaction
    );
    // TransactionFactory.registerTransactionType(TxTypeToPrefix.cip66, CIP66Transaction)
  }
}

declare module "web3" {
  interface Web3Context {
    celo: CeloTransactionTypesPlugin;
  }
}
