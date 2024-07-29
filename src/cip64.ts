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
} from "web3-eth-accounts";
import { Address } from "web3-eth-accounts/lib/commonjs/tx/address";
import {
  bytesToHex,
  hexToBytes,
  uint8ArrayConcat,
  uint8ArrayEquals,
} from "web3-utils";

const {
  getAccessListData,
  getAccessListJSON,
  getDataFeeEIP2930,
  verifyAccessList,
} = txUtils;

const MAX_INTEGER = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);
export const TRANSACTION_TYPE = 0x7b;
const TRANSACTION_TYPE_UINT8ARRAY = hexToBytes(
  TRANSACTION_TYPE.toString(16).padStart(2, "0")
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

  /**
   * Instantiate a transaction from a data dictionary.
   *
   * Format: { chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data,
   * accessList, v, r, s }
   *
   * Notes:
   * - `chainId` will be set automatically if not provided
   * - All parameters are optional and have some basic default values
   */
  public static fromTxData(txData: CIP64Data, opts: TxOptions = {}) {
    return new CIP64Transaction(txData, opts);
  }

  /**
   * Instantiate a transaction from the serialized tx.
   *
   * Format: `0x02 || rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data,
   * accessList, signatureYParity, signatureR, signatureS])`
   */
  public static fromSerializedTx(serialized: Uint8Array, opts: TxOptions = {}) {
    if (
      !uint8ArrayEquals(serialized.subarray(0, 1), TRANSACTION_TYPE_UINT8ARRAY)
    ) {
      throw new Error(
        `Invalid serialized tx input: not an CIP64 transaction (wrong tx type, expected: ${TRANSACTION_TYPE}, received: ${bytesToHex(
          serialized.subarray(0, 1)
        )}`
      );
    }
    const values = RLP.decode(serialized.subarray(1));

    if (!Array.isArray(values)) {
      throw new Error("Invalid serialized tx input: must be array");
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return CIP64Transaction.fromValuesArray(values as any, opts);
  }

  /**
   * Create a transaction from a values array.
   *
   * Format: `[chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data,
   * accessList, signatureYParity, signatureR, signatureS]`
   */
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
        feeCurrency: new Address(feeCurrency),
        v: v !== undefined ? uint8ArrayToBigInt(v) : undefined,
        r,
        s,
      },
      opts
    );
  }

  /**
   * This constructor takes the values, validates them, assigns them and freezes the object.
   *
   * It is not recommended to use this constructor directly. Instead use
   * the static factory methods to assist in creating a Transaction object from
   * varying data types.
   */
  public constructor(txData: CIP64Data, opts: TxOptions = {}) {
    super({ ...txData, type: TRANSACTION_TYPE }, opts);
    const { chainId, accessList, maxFeePerGas, maxPriorityFeePerGas } = txData;

    this.common = this._getCommon(opts.common, chainId);
    this.chainId = this.common.chainId();
    this.feeCurrency = txData.feeCurrency;

    // Populate the access list fields
    const accessListData = getAccessListData(accessList ?? []);
    this.accessList = accessListData.accessList;
    this.AccessListJSON = accessListData.AccessListJSON;
    // Verify the access list format.
    verifyAccessList(this.accessList);

    // TODO: whitelist
    // verifyFeeCurrency(this.feeCurrency);

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

  /**
   * The amount of gas paid for the data in this tx
   */
  public getDataFee(): bigint {
    // TODO adjust for feeCurrency
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

  /**
   * The up front amount that an account must have for this transaction to be valid
   * @param baseFee The base fee of the block (will be set to 0 if not provided)
   */
  public getUpfrontCost(baseFee = BigInt(0)): bigint {
    // TODO adjust for feeCurrency
    const prio = this.maxPriorityFeePerGas;
    const maxBase = this.maxFeePerGas - baseFee;
    const inclusionFeePerGas = prio < maxBase ? prio : maxBase;
    const gasPrice = inclusionFeePerGas + baseFee;
    return this.gasLimit * gasPrice + this.value;
  }

  /**
   * Returns a Uint8Array Array of the raw Uint8Arrays of the CIP64 transaction, in order.
   *
   * Format: `[chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data,
   * accessList, feeCurrency, signatureYParity, signatureR, signatureS]`
   *
   * Use {@link CIP64Transaction.serialize} to add a transaction to a block
   * with {@link Block.fromValuesArray}.
   *
   * For an unsigned tx this method uses the empty Uint8Array values for the
   * signature parameters `v`, `r` and `s` for encoding. For an EIP-155 compliant
   * representation for external signing use {@link CIP64Transaction.getMessageToSign}.
   */
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
      this.feeCurrency.buf,
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

  /**
   * Returns the serialized encoding of the CIP64 transaction.
   *
   * Format: `0x02 || rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data,
   * accessList, signatureYParity, signatureR, signatureS])`
   *
   * Note that in contrast to the legacy tx serialization format this is not
   * valid RLP any more due to the raw tx type preceding and concatenated to
   * the RLP encoding of the values.
   */
  public serialize(): Uint8Array {
    const base = this.raw();
    return uint8ArrayConcat(TRANSACTION_TYPE_UINT8ARRAY, RLP.encode(base));
  }

  /**
   * Returns the serialized unsigned tx (hashed or raw), which can be used
   * to sign the transaction (e.g. for sending to a hardware wallet).
   *
   * Note: in contrast to the legacy tx the raw message format is already
   * serialized and doesn't need to be RLP encoded any more.
   *
   * ```javascript
   * const serializedMessage = tx.getMessageToSign(false) // use this for the HW wallet input
   * ```
   *
   * @param hashMessage - Return hashed message if set to true (default: true)
   */
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

  /**
   * Computes a sha3-256 hash of the serialized tx.
   *
   * This method can only be used for signed txs (it throws otherwise).
   * Use {@link CIP64Transaction.getMessageToSign} to get a tx hash for the purpose of signing.
   */
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

  /**
   * Computes a sha3-256 hash which can be used to verify the signature
   */
  public getMessageToVerifySignature(): Uint8Array {
    return this.getMessageToSign();
  }

  /**
   * Returns the public key of the sender
   */
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

  /**
   * Returns an object with the JSON representation of the transaction
   */
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
      feeCurrency: this.feeCurrency.toString(),
      v: this.v !== undefined ? bigIntToHex(this.v) : undefined,
      r: this.r !== undefined ? bigIntToHex(this.r) : undefined,
      s: this.s !== undefined ? bigIntToHex(this.s) : undefined,
    };
  }

  /**
   * Return a compact error string representation of the object
   */
  public errorStr() {
    let errorStr = this._getSharedErrorPostfix();
    errorStr += ` maxFeePerGas=${this.maxFeePerGas} maxPriorityFeePerGas=${this.maxPriorityFeePerGas}`;
    return errorStr;
  }

  /**
   * Internal helper function to create an annotated error message
   *
   * @param msg Base error message
   * @hidden
   */
  protected _errorMsg(msg: string) {
    return `${msg} (${this.errorStr()})`;
  }
}
