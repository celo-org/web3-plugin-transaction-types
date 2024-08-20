import { describe, it, expect } from "bun:test";
import { RLP } from "@ethereumjs/rlp";
import { hexToBytes, toWei } from "web3-utils";

import { CIP64Transaction } from "../cip64";
import {
  Common,
  privateKeyToAddress,
  privateKeyToPublicKey,
} from "web3-eth-accounts";
import { CeloChains } from "../utils";

const common = Common.custom({
  // using the same as in
  // https://github.com/celo-org/developer-tooling/blob/master/packages/sdk/wallets/wallet-local/src/local-wallet.test.ts
  chainId: 44378,
});

const TWO_POW256 = BigInt(
  "0x10000000000000000000000000000000000000000000000000000000000000000"
);

const PRIVATE_KEY1 =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const PUBLIC_KEY1 = privateKeyToPublicKey(PRIVATE_KEY1, false);
const ACCOUNT_ADDRESS1 = privateKeyToAddress(PRIVATE_KEY1);
const PRIVATE_KEY2 =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890fdeccc";
const ACCOUNT_ADDRESS2 = privateKeyToAddress(PRIVATE_KEY2);

const baseTxData = {
  from: ACCOUNT_ADDRESS1,
  to: ACCOUNT_ADDRESS2,
  chainId: `0x${(44378).toString(16)}`,
  value: BigInt(toWei(1, "ether")),
  nonce: 0,
  gasLimit: BigInt("10"),
  gas: BigInt("10"),
  data: "0xabcdef",
  maxFeePerGas: BigInt("99"),
  maxPriorityFeePerGas: BigInt("99"),
  feeCurrency: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826",
};

describe("[CIP64Transaction]", () => {
  it("sign()", () => {
    const pkey = hexToBytes(PRIVATE_KEY1);
    const txn = CIP64Transaction.fromTxData(baseTxData, { common });
    const signed = txn.sign(pkey);
    const rlpSerialized = RLP.encode(Uint8Array.from(signed.serialize()));
    expect(rlpSerialized).toMatchSnapshot();
  });

  it("hash()", () => {
    const pkey = hexToBytes(PRIVATE_KEY1);
    let txn = CIP64Transaction.fromTxData(baseTxData, { common });
    let signed = txn.sign(pkey);
    const expectedHash = hexToBytes(
      // Copied from https://github.com/celo-org/developer-tooling/blob/master/packages/sdk/wallets/wallet-local/src/local-wallet.test.ts#L320
      "0x645afc1d19fe805c0c0956e70d5415487bf073741d7b297ccb7e7040c6ce5df6"
    );
    expect(signed.hash()).toEqual(expectedHash);
  });

  it("fromSerializedTx()", () => {
    let txn = CIP64Transaction.fromSerializedTx(
      hexToBytes(
        // Copied from https://github.com/celo-org/developer-tooling/blob/master/packages/sdk/wallets/wallet-local/src/local-wallet.test.ts#L315
        "0x7bf88282ad5a8063630a94588e4b68193001e4d10928660ab4165b813717c0880de0b6b3a764000083abcdefc094cd2a3d9f938e13cd947ec05abc7fe734df8dd82680a091b5504a59e529e7efa42dbb97fbc3311a91d035c873a94ab0789441fc989f84a02e8254d6b3101b63417e5d496833bc84f4832d4a8bf8a2b83e291d8f38c0f62d"
      ),
      { common }
    );
    expect(txn.toJSON()).toMatchSnapshot();
  });

  it("toJSON()", () => {
    const pkey = hexToBytes(PRIVATE_KEY1);
    const txn = CIP64Transaction.fromTxData(
      { ...baseTxData, to: ACCOUNT_ADDRESS2 },
      { common }
    );
    const signed = txn.sign(pkey);

    const json = signed.toJSON();
    const expectedJSON = {
      chainId: "0xad5a",
      nonce: "0x0",
      maxPriorityFeePerGas: "0x63",
      maxFeePerGas: "0x63",
      gasLimit: "0xa",
      to: "0x588e4b68193001e4d10928660ab4165b813717c0",
      value: "0xde0b6b3a7640000",
      data: "0xabcdef",
      accessList: [],
      feeCurrency: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826",
      v: "0x0",
      r: "0x91b5504a59e529e7efa42dbb97fbc3311a91d035c873a94ab0789441fc989f84",
      s: "0x2e8254d6b3101b63417e5d496833bc84f4832d4a8bf8a2b83e291d8f38c0f62d",
    };
    expect(json).toEqual(expectedJSON);
  });

  it("Fee validation", () => {
    expect(() => {
      CIP64Transaction.fromTxData(
        {
          ...baseTxData,
          maxFeePerGas: TWO_POW256 - BigInt(1),
          maxPriorityFeePerGas: 100,
          gasLimit: 1,
          value: 6,
        },
        { common }
      );
    }).not.toThrow();
    expect(() => {
      CIP64Transaction.fromTxData(
        {
          ...baseTxData,
          maxFeePerGas: TWO_POW256 - BigInt(1),
          maxPriorityFeePerGas: 100,
          gasLimit: 100,
          value: 6,
        },
        { common }
      );
    }).toThrow();
    expect(() => {
      CIP64Transaction.fromTxData(
        {
          ...baseTxData,
          maxFeePerGas: 1,
          maxPriorityFeePerGas: 2,
          gasLimit: 100,
          value: 6,
        },
        { common }
      );
    }).toThrow();
  });
});
