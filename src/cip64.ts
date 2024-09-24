import { keccak256 } from "ethereum-cryptography/keccak";
import { validateNoLeadingZeroes } from "web3-validator";
// eslint-disable-next-line import/no-extraneous-dependencies
import { RLP } from "@ethereumjs/rlp";
import {
  AccessList,
  AccessListUint8Array,
  BaseTransaction,
  Common,
  FeeMarketEIP1559TxData,
  JsonTx,
  TxOptions,
  TxValuesArray,
  bigIntToHex,
  bigIntToUnpaddedUint8Array,
  ecrecover,
  toUint8Array,
  txUtils,
  uint8ArrayToBigInt,
  unpadUint8Array,
} from "web3-eth-accounts";
import {
  bytesToHex,
  hexToBytes,
  uint8ArrayConcat,
  uint8ArrayEquals,
} from "web3-utils";
import { Address } from "web3";
import { TxTypeToPrefix } from "./utils";

const {
  getAccessListData,
  getAccessListJSON,
  getDataFeeEIP2930,
  verifyAccessList,
} = txUtils;

const MAX_INTEGER = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

const TRANSACTION_TYPE_UINT8ARRAY = hexToBytes(
  TxTypeToPrefix.cip64.padStart(2, "0")
);

type CIP64Data = FeeMarketEIP1559TxData & {
  feeCurrency: Address;
};
type CIP64ValuesArray = [
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  AccessListUint8Array,
  Uint8Array,
  Uint8Array?,
  Uint8Array?,
  Uint8Array?
];
type CIP64JsonTx = JsonTx & {
  feeCurrency: string;
};

/**
 * Create a new EIP-2718 Transaction Type that will act as eip1559 transaction but including the feeCurrency field for paying in a different currency.
 *
 * - TransactionType: 0x7b
 * - CIP: [CIP64](https://github.com/celo-org/celo-proposals/blob/master/CIPs/cip-0064.md)
 */
export class CIP64Transaction extends BaseTransaction<CIP64Transaction> {
  public readonly chainId: bigint;
  public readonly accessList: AccessListUint8Array;
  public readonly AccessListJSON: AccessList;
  public readonly maxPriorityFeePerGas: bigint;
  public readonly maxFeePerGas: bigint;
  public readonly feeCurrency: Address;

  public readonly common: Common;

  public static fromTxData(txData: CIP64Data, opts: TxOptions = {}) {
    return new CIP64Transaction(txData, opts);
  }

  public static fromSerializedTx(serialized: Uint8Array, opts: TxOptions = {}) {
    if (
      !uint8ArrayEquals(serialized.subarray(0, 1), TRANSACTION_TYPE_UINT8ARRAY)
    ) {
      throw new Error(
        `Invalid serialized tx input: not an CIP64 transaction (wrong tx type, expected: ${
          TxTypeToPrefix.cip64
        }, received: ${bytesToHex(serialized.subarray(0, 1))}`
      );
    }
    const values = RLP.decode(serialized.subarray(1));

    if (!Array.isArray(values)) {
      throw new Error("Invalid serialized tx input: must be array");
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return CIP64Transaction.fromValuesArray(values as any, opts);
  }

  public static fromValuesArray(
    values: CIP64ValuesArray,
    opts: TxOptions = {}
  ) {
    if (values.length !== 10 && values.length !== 13) {
      throw new Error(
        "Invalid CIP64 transaction. Only expecting 10 values (for unsigned tx) or 13 values (for signed tx)."
      );
    }

    const [
      chainId,
      nonce,
      maxPriorityFeePerGas,
      maxFeePerGas,
      gasLimit,
      to,
      value,
      data,
      accessList,
      feeCurrency,
      v,
      r,
      s,
    ] = values;

    this._validateNotArray({ chainId, v });
    validateNoLeadingZeroes({
      nonce,
      maxPriorityFeePerGas,
      maxFeePerGas,
      gasLimit,
      value,
      v,
      r,
      s,
    });

    return new CIP64Transaction(
      {
        chainId: uint8ArrayToBigInt(chainId),
        nonce,
        maxPriorityFeePerGas,
        maxFeePerGas,
        gasLimit,
        to,
        value,
        data,
        accessList: accessList ?? [],
        feeCurrency: Buffer.from(feeCurrency).toString("hex"),
        v: v !== undefined ? uint8ArrayToBigInt(v) : undefined,
        r,
        s,
      },
      opts
    );
  }
  public constructor(txData: CIP64Data, opts: TxOptions = {}) {
    const {
      chainId,
      accessList,
      maxFeePerGas,
      maxPriorityFeePerGas,
      feeCurrency,
    } = txData;

    super({ ...txData, type: TxTypeToPrefix.cip64 }, opts);

    this.common = this._getCommon(opts.common, chainId);
    this.chainId = this.common.chainId();

    this.feeCurrency = feeCurrency;

    // Populate the access list fields
    const accessListData = getAccessListData(accessList ?? []);
    this.accessList = accessListData.accessList;
    this.AccessListJSON = accessListData.AccessListJSON;
    // Verify the access list format.
    verifyAccessList(this.accessList);

    this.maxFeePerGas = uint8ArrayToBigInt(
      toUint8Array(maxFeePerGas === "" ? "0x" : maxFeePerGas)
    );
    this.maxPriorityFeePerGas = uint8ArrayToBigInt(
      toUint8Array(maxPriorityFeePerGas === "" ? "0x" : maxPriorityFeePerGas)
    );

    this._validateCannotExceedMaxInteger({
      maxFeePerGas: this.maxFeePerGas,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas,
    });

    BaseTransaction._validateNotArray(txData);

    if (this.gasLimit * this.maxFeePerGas > MAX_INTEGER) {
      const msg = this._errorMsg(
        "gasLimit * maxFeePerGas cannot exceed MAX_INTEGER (2^256-1)"
      );
      throw new Error(msg);
    }

    if (this.maxFeePerGas < this.maxPriorityFeePerGas) {
      const msg = this._errorMsg(
        "maxFeePerGas cannot be less than maxPriorityFeePerGas (The total must be the larger of the two)"
      );
      throw new Error(msg);
    }

    this._validateYParity();
    this._validateHighS();

    const freeze = opts?.freeze ?? true;
    if (freeze) {
      Object.freeze(this);
    }
  }

  public getDataFee(): bigint {
    if (
      this.cache.dataFee &&
      this.cache.dataFee.hardfork === this.common.hardfork()
    ) {
      return this.cache.dataFee.value;
    }

    let cost = super.getDataFee();
    cost += BigInt(getDataFeeEIP2930(this.accessList, this.common));

    if (Object.isFrozen(this)) {
      this.cache.dataFee = {
        value: cost,
        hardfork: this.common.hardfork(),
      };
    }

    return cost;
  }

  public getUpfrontCost(baseFee = BigInt(0)): bigint {
    const prio = this.maxPriorityFeePerGas;
    const maxBase = this.maxFeePerGas - baseFee;
    const inclusionFeePerGas = prio < maxBase ? prio : maxBase;
    const gasPrice = inclusionFeePerGas + baseFee;
    return this.gasLimit * gasPrice + this.value;
  }

  public raw(): TxValuesArray {
    return [
      bigIntToUnpaddedUint8Array(this.chainId),
      bigIntToUnpaddedUint8Array(this.nonce),
      bigIntToUnpaddedUint8Array(this.maxPriorityFeePerGas),
      bigIntToUnpaddedUint8Array(this.maxFeePerGas),
      bigIntToUnpaddedUint8Array(this.gasLimit),
      this.to !== undefined ? this.to.buf : Uint8Array.from([]),
      bigIntToUnpaddedUint8Array(this.value),
      this.data,
      this.accessList,
      hexToBytes(this.feeCurrency),
      this.v !== undefined
        ? bigIntToUnpaddedUint8Array(this.v)
        : Uint8Array.from([]),
      this.r !== undefined
        ? bigIntToUnpaddedUint8Array(this.r)
        : Uint8Array.from([]),
      this.s !== undefined
        ? bigIntToUnpaddedUint8Array(this.s)
        : Uint8Array.from([]),
    ] as TxValuesArray;
  }

  public serialize(): Uint8Array {
    const base = this.raw();
    return uint8ArrayConcat(TRANSACTION_TYPE_UINT8ARRAY, RLP.encode(base));
  }

  public getMessageToSign(hashMessage = true): Uint8Array {
    const base = this.raw().slice(0, 10);
    const message = uint8ArrayConcat(
      TRANSACTION_TYPE_UINT8ARRAY,
      RLP.encode(base)
    );
    if (hashMessage) {
      return keccak256(message);
    }
    return message;
  }

  public hash(): Uint8Array {
    if (!this.isSigned()) {
      const msg = this._errorMsg(
        "Cannot call hash method if transaction is not signed"
      );
      throw new Error(msg);
    }

    if (Object.isFrozen(this)) {
      if (!this.cache.hash) {
        this.cache.hash = keccak256(this.serialize());
      }
      return this.cache.hash;
    }
    return keccak256(this.serialize());
  }

  public getMessageToVerifySignature(): Uint8Array {
    return this.getMessageToSign();
  }

  public getSenderPublicKey(): Uint8Array {
    if (!this.isSigned()) {
      const msg = this._errorMsg(
        "Cannot call this method if transaction is not signed"
      );
      throw new Error(msg);
    }

    const msgHash = this.getMessageToVerifySignature();
    const { v, r, s } = this;

    this._validateHighS();

    try {
      return ecrecover(
        msgHash,
        v! + BigInt(27), // Recover the 27 which was stripped from ecsign
        bigIntToUnpaddedUint8Array(r!),
        bigIntToUnpaddedUint8Array(s!)
      );
    } catch (e: any) {
      const msg = this._errorMsg("Invalid Signature");
      throw new Error(msg);
    }
  }

  public _processSignature(v: bigint, r: Uint8Array, s: Uint8Array) {
    const opts = { ...this.txOptions, common: this.common };

    return CIP64Transaction.fromTxData(
      {
        chainId: this.chainId,
        nonce: this.nonce,
        maxPriorityFeePerGas: this.maxPriorityFeePerGas,
        maxFeePerGas: this.maxFeePerGas,
        gasLimit: this.gasLimit,
        to: this.to,
        value: this.value,
        data: this.data,
        accessList: this.accessList,
        feeCurrency: this.feeCurrency,
        v: v - BigInt(27), // This looks extremely hacky: /util actually adds 27 to the value, the recovery bit is either 0 or 1.
        r: uint8ArrayToBigInt(r),
        s: uint8ArrayToBigInt(s),
      },
      opts
    );
  }

  public toJSON(): CIP64JsonTx {
    const accessListJSON = getAccessListJSON(this.accessList);

    return {
      chainId: bigIntToHex(this.chainId),
      nonce: bigIntToHex(this.nonce),
      maxPriorityFeePerGas: bigIntToHex(this.maxPriorityFeePerGas),
      maxFeePerGas: bigIntToHex(this.maxFeePerGas),
      gasLimit: bigIntToHex(this.gasLimit),
      to: this.to !== undefined ? this.to.toString() : undefined,
      value: bigIntToHex(this.value),
      data: bytesToHex(this.data),
      accessList: accessListJSON,
      feeCurrency: this.feeCurrency,
      v: this.v !== undefined ? bigIntToHex(this.v) : undefined,
      r: this.r !== undefined ? bigIntToHex(this.r) : undefined,
      s: this.s !== undefined ? bigIntToHex(this.s) : undefined,
    };
  }

  public errorStr() {
    let errorStr = this._getSharedErrorPostfix();
    errorStr += ` maxFeePerGas=${this.maxFeePerGas} maxPriorityFeePerGas=${this.maxPriorityFeePerGas}`;
    return errorStr;
  }

  protected _errorMsg(msg: string) {
    return `${msg} (${this.errorStr()})`;
  }
}
