// create new TransactionType class which extends BaseTransaction class
import {
  Address,
  Contract,
  ContractAbi,
  HexString,
  Web3Context,
  Web3PluginBase,
} from "web3";
import { TransactionFactory } from "web3-eth-accounts";
import { CIP64Transaction } from "./cip64";
import {
  getContractAddressFromRegistry,
  isCel2,
  isWhitelisted,
  TxTypeToPrefix,
} from "./utils";
import {
  type TransactionMiddlewareData,
  type TransactionMiddleware,
} from "web3/src/eth.exports";
import { type TransactionBuilder } from "web3-core";
import { transactionBuilder } from "web3-eth";
import { bytesToHex, hexToBytes, uint8ArrayConcat } from "web3-utils";

export class CeloTransactionTypesPlugin extends Web3PluginBase {
  public static TX_TYPE = BigInt(parseInt(TxTypeToPrefix.cip64));
  public pluginNamespace = "celo" as const;
  public constructor() {
    super();

    TransactionFactory.registerTransactionType(
      CeloTransactionTypesPlugin.TX_TYPE,
      CIP64Transaction
    );
  }

  public async isValidFeeCurrency(feeCurrency: Address) {
    return isWhitelisted(this, feeCurrency);
  }

  public async isCel2() {
    return isCel2(this);
  }

  public async getCoreContractAddress(contractName: string) {
    return getContractAddressFromRegistry(this, contractName);
  }

  public link(parentContext: Web3Context): void {
    (parentContext as any).Web3Eth.setTransactionMiddleware(
      new CeloTxMiddleware(parentContext)
    );
    super.link(parentContext);
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

class CeloTxMiddleware implements TransactionMiddleware {
  constructor(private ctx: Web3Context) {
    const celoTransactionBuilder = (async (options) => {
      const {
        transaction: { value, type, data, ...transaction },
      } = options;

      // NOTE: hack, we're storing the feeCurrency in value
      // for contract calls
      const valueAsFeeCurrencyForContractCalls =
        typeof value === "string" && value.match(/^0x[0-9a-f]{40}$/i);
      const isCip64 =
        valueAsFeeCurrencyForContractCalls ||
        (type && BigInt(type as string) === CeloTransactionTypesPlugin.TX_TYPE);

      // NOTE: hack, we're storing the feeCurrency in data
      // 42 = 0x + 40 (feeCurrency address)
      const feeCurrency = isCip64
        ? valueAsFeeCurrencyForContractCalls
          ? (value as string)
          : (data as string).slice(0, 42)
        : undefined;
      const _data =
        isCip64 && !valueAsFeeCurrencyForContractCalls
          ? (data as string).slice(42)
          : data;

      console.log("here!", {
        value,
        data,
        valueAsFeeCurrencyForContractCalls,
        isCip64,
        feeCurrency,
        _data,
      });
      // NOTE: small hack
      this.ctx.transactionBuilder = undefined;

      const tx = await transactionBuilder({
        ...options,
        transaction: {
          ...transaction,
          value: valueAsFeeCurrencyForContractCalls ? undefined : value,
          type,
          data: _data,
        },
      });
      this.ctx.transactionBuilder = celoTransactionBuilder;
      // NOTE: end hack

      if (!isCip64) {
        return tx;
      }

      if (!(await this.ctx.celo.isValidFeeCurrency(feeCurrency!))) {
        throw new Error(`${feeCurrency} is not a whitelisted feeCurrency`);
      }
      tx.type = CeloTransactionTypesPlugin.TX_TYPE;
      tx.feeCurrency = feeCurrency;

      if (!tx.maxPriorityFeePerGas) {
        const rpcResult = (await options.web3Context.requestManager.send({
          method: "eth_maxPriorityFeePerGas",
          params: [feeCurrency],
        })) as HexString;
        tx.maxPriorityFeePerGas = rpcResult;
      }
      if (!tx.maxFeePerGas) {
        const rpcResult = (await options.web3Context.requestManager.send({
          method: "eth_gasPrice",
          params: [feeCurrency],
        })) as HexString;
        tx.maxFeePerGas = rpcResult;
      }
      tx.data = data;

      const gas = await options.web3Context.requestManager.send({
        method: "eth_estimateGas",
        params: [
          {
            ...transaction,
            value: valueAsFeeCurrencyForContractCalls ? undefined : value,
            type,
            data: _data,
            nonce: tx.nonce,
            chainId: tx.chainId,
            networkId: tx.networkId,
            feeCurrency,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
            maxFeePerGas: tx.maxFeePerGas,
          },
          "latest",
        ],
      });
      tx.gas = (BigInt(gas) * BigInt(130)) / BigInt(100);

      if (valueAsFeeCurrencyForContractCalls) {
        tx.value = feeCurrency;
      }

      return tx;
    }) as TransactionBuilder;

    this.ctx.transactionBuilder = celoTransactionBuilder;
  }
  public async processTransaction(
    transaction: TransactionMiddlewareData
  ): Promise<TransactionMiddlewareData> {
    console.log("HELLO!", transaction);
    const { feeCurrency, gasPrice } = transaction;
    // Not CELO specific
    if (!feeCurrency) {
      return transaction;
    }
    if (gasPrice) {
      throw new Error(`gasPrice shouldn't be used with feeCurrency`);
    }

    const tx = { ...transaction };
    tx.type = CeloTransactionTypesPlugin.TX_TYPE;

    if (tx.data) {
      // NOTE: hack, we're storing the feeCurrency in value
      // for contract calls
      if (!tx.value) {
        tx.value = feeCurrency;
      } else {
        // NOTE: hack, we're storing the feeCurrency in data
        tx.data = uint8ArrayConcat(
          hexToBytes(feeCurrency),
          typeof tx.data === "string" ? hexToBytes(tx.data) : tx.data
        );
      }
    } else {
      // NOTE: hack, we're storing the feeCurrency in data
      tx.data = hexToBytes(feeCurrency);
    }

    return tx;
  }
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
