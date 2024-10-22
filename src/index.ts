// create new TransactionType class which extends BaseTransaction class
import {
  Address,
  Contract,
  ContractAbi,
  HexString,
  Numbers,
  Transaction,
  Web3Context,
  Web3PluginBase,
} from "web3";
import { TransactionFactory } from "web3-eth-accounts";
import { CIP64Transaction } from "./cip64";
import {
  getContractAddressFromRegistry,
  isCel2,
  isWhitelisted,
  safeTxForRpc,
  TxTypeToPrefix,
} from "./utils";
import {
  type TransactionMiddlewareData,
  type TransactionMiddleware,
} from "web3/src/eth.exports";
import { type TransactionBuilder } from "web3-core";
import { transactionBuilder, transactionSchema } from "web3-eth";

export class CeloTransactionTypesPlugin extends Web3PluginBase {
  public static TX_TYPE = BigInt(parseInt(TxTypeToPrefix.cip64));
  public pluginNamespace = "celo" as const;
  public constructor() {
    super();

    TransactionFactory.registerTransactionType(
      `0x${CeloTransactionTypesPlugin.TX_TYPE.toString(16)}`,
      CIP64Transaction
    );
  }

  /**
   *
   * @param feeCurrency the address to verify
   * @returns if the passed `feeCurrency` is a whitelisted address
   *          that can be used as a feeCurrency
   */
  public async isValidFeeCurrency(feeCurrency: Address) {
    return isWhitelisted(this, feeCurrency);
  }

  /**
   *
   * @returns if the network is a L2 or not
   */
  public async isCel2() {
    return isCel2(this);
  }

  /**
   *
   * @param contractName See https://docs.celo.org/contract-addresses
   * @returns the correct address for a given core contract name
   *          depending on the network (mainnet, alfajores, baklava, etc.)
   */
  public async getCoreContractAddress(contractName: string) {
    return getContractAddressFromRegistry(this, contractName);
  }

  /**
   *
   * @param tx a standard web3 transaction
   * @returns the same tx with the `nonce`, `chainId`, `maxPriorityFeePerGas`, `maxFeePerGas`, and `gas`
   *          filled, taking in account if `feeCurrency` is present or not.
   */
  public async populateTransaction(tx: Transaction) {
    const { feeCurrency } = tx;

    const promises: Promise<[string, Numbers]>[] = [];
    if (!tx.nonce) {
      promises.push(
        this.requestManager
          .send({
            method: "eth_getTransactionCount",
            params: [tx.from, "latest"],
          })
          .then((x) => ["nonce", x])
      );
    }
    if (!tx.chainId) {
      promises.push(
        this.requestManager
          .send({
            method: "eth_chainId",
            params: [],
          })
          .then((x) => ["chainId", x])
      );
    }
    if (!tx.maxPriorityFeePerGas) {
      promises.push(
        this.requestManager
          .send({
            method: "eth_maxPriorityFeePerGas",
            params: feeCurrency ? [feeCurrency] : [],
          })
          .then((x: HexString) => ["maxPriorityFeePerGas", BigInt(x)])
      );
    }
    if (!tx.maxFeePerGas) {
      promises.push(
        this.requestManager
          .send({
            method: "eth_gasPrice",
            params: feeCurrency ? [feeCurrency] : [],
          })
          .then((x: HexString) => ["maxFeePerGas", BigInt(x)])
      );
    }

    (await Promise.all(promises)).forEach(([key, value]) => {
      // @ts-expect-error
      tx[key] = value;
    });

    const gas = await this.requestManager.send({
      method: "eth_estimateGas",
      params: [
        {
          ...safeTxForRpc(tx),
          gas: undefined,
        },
        "latest",
      ],
    });
    // TODO: add note for inflation factor
    tx.gas = (BigInt(gas) * BigInt(130)) / BigInt(100);

    return safeTxForRpc(tx);
  }

  /**
   *
   * DO NOT USE
   *
   * This function isn't meant to be used manually, it's automatically called by
   * web3.registerPlugin.
   */
  public link(parentContext: Web3Context): void {
    const middleware = new CeloTxMiddleware(parentContext);
    (parentContext as any).Web3Eth.setTransactionMiddleware(middleware);

    super.link(parentContext);
    (parentContext as any).eth.config.customTransactionSchema =
      middleware.ctx.config.customTransactionSchema;
  }
}

export class CeloContract<Abi extends ContractAbi> extends Contract<Abi> {
  constructor(...args: ConstructorParameters<typeof Contract>) {
    let [
      jsonInterface,
      addressOrOptionsOrContext,
      optionsOrContextOrReturnFormat,
      contextOrReturnFormat,
      returnFormat,
    ] = args;

    super(
      // @ts-expect-error
      jsonInterface,
      addressOrOptionsOrContext,
      optionsOrContextOrReturnFormat,
      contextOrReturnFormat,
      returnFormat
    );

    let contractContext;
    if ((addressOrOptionsOrContext as unknown) instanceof Web3Context) {
      contractContext = addressOrOptionsOrContext;
    } else if (optionsOrContextOrReturnFormat instanceof Web3Context) {
      contractContext = optionsOrContextOrReturnFormat;
    } else {
      contractContext = contextOrReturnFormat;
    }

    if (contractContext instanceof Web3Context) {
      this.setTransactionMiddleware(new CeloTxMiddleware(contractContext));
    }
  }
}

type CeloTransaction = Transaction & {
  feeCurrency?: HexString;
};

class CeloTxMiddleware implements TransactionMiddleware {
  constructor(public ctx: Web3Context) {
    this.ctx.config.customTransactionSchema = {
      ...transactionSchema,
      properties: {
        ...transactionSchema.properties,
        feeCurrency: { format: "address" },
      },
    };
    this.ctx.transactionBuilder = this.transactionBuilder as TransactionBuilder;
  }

  public async processTransaction(
    transaction: TransactionMiddlewareData
  ): Promise<TransactionMiddlewareData> {
    const { feeCurrency, gasPrice } =
      transaction as TransactionMiddlewareData & { feeCurrency?: HexString };

    if (!feeCurrency) {
      return transaction;
    }
    if (gasPrice) {
      throw new Error(`gasPrice shouldn't be used with feeCurrency`);
    }

    const tx = { ...transaction };
    tx.type = CeloTransactionTypesPlugin.TX_TYPE;

    return tx;
  }

  private transactionBuilder = async (
    options: Parameters<TransactionBuilder>[0]
  ) => {
    const { transaction } = options;

    // NOTE: small hack:
    // `transactionBuilder` calls this.ctx.transactionBuilder if defined
    this.ctx.transactionBuilder = undefined;
    const tx: CeloTransaction = await transactionBuilder({
      ...options,
      transaction: transaction,
    });
    tx.feeCurrency = transaction.feeCurrency;

    this.ctx.transactionBuilder = this.transactionBuilder as TransactionBuilder;
    // NOTE: end hack

    const { feeCurrency } = tx;
    if (!feeCurrency || feeCurrency === "0x") {
      return transaction;
    }

    if (!(await this.ctx.celo.isValidFeeCurrency(feeCurrency!))) {
      throw new Error(`${feeCurrency} is not a whitelisted feeCurrency`);
    }

    await this.ctx.celo.populateTransaction(tx);

    return tx;
  };
}

declare module "web3" {
  interface Web3Context {
    celo: CeloTransactionTypesPlugin;
  }
  interface NonPayableCallOptions {
    feeCurrency?: Address;
  }
  interface Transaction {
    feeCurrency?: Address;
  }
}
