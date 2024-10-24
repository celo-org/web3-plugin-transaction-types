import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { CeloContract, CeloTransactionTypesPlugin } from "..";
import Web3, { Address } from "web3";
import { stableTokenEurABI } from "@celo/abis";
import { CeloChains, isWhitelisted } from "../utils";
import { sleep } from "bun";

let stable: CeloContract<typeof stableTokenEurABI>;
let stableAddress: Address;

const web3 = new Web3(CeloChains.alfajores.rpcUrl);
const account = web3.eth.accounts.privateKeyToAccount(
  process.env.TEST_ACCOUNT_1 as string
);
const account2 = web3.eth.accounts.privateKeyToAccount(
  process.env.TEST_ACCOUNT_2 as string
);
web3.eth.accounts.wallet?.add(account);

beforeAll(async () => {
  web3.registerPlugin(new CeloTransactionTypesPlugin());
  web3.celo.link(web3);

  stableAddress = await web3.celo.getCoreContractAddress("StableTokenEUR");
  stable = new CeloContract(stableTokenEurABI, stableAddress, web3);

  web3.eth.defaultAccount = account.address;
});

test(
  "can do a transaction",
  async () => {
    const amount = BigInt(10);
    const balanceSenderBefore = BigInt(
      await stable.methods.balanceOf(account.address).call()
    );
    const balanceReceiverBefore = BigInt(
      await stable.methods.balanceOf(account2.address).call()
    );

    const tx = await stable.methods.transfer(account2.address, amount).send({
      from: web3.eth.defaultAccount,
      feeCurrency: stableAddress,
    });

    await sleep(5_000);

    const balanceSenderAfter = BigInt(
      await stable.methods.balanceOf(account.address).call()
    );
    const balanceReceiverAfter = BigInt(
      await stable.methods.balanceOf(account2.address).call()
    );

    expect(tx.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(balanceSenderAfter).toBeLessThanOrEqual(
      balanceSenderBefore - amount
    );
    expect(balanceReceiverAfter).toEqual(balanceReceiverBefore + amount);
  },
  { timeout: 15_000 }
);

test(
  "can do a transaction with feeCurrency",
  async () => {
    const amount = BigInt(10);
    const stableBalanceSenderBefore = BigInt(
      await stable.methods.balanceOf(account.address).call()
    );
    const nativeBalanceBefore = BigInt(
      await web3.eth.getBalance(account.address)
    );
    const txData = {
      from: web3.eth.defaultAccount,
      to: account2.address,
      value: amount,
      feeCurrency: stableAddress,
    };
    await web3.celo.populateTransaction(txData);
    const tx = await web3.eth.sendTransaction(txData);

    await sleep(5_000);

    const stableBalanceSenderAfter = BigInt(
      await stable.methods.balanceOf(account.address).call()
    );
    const nativeBalanceAfter = BigInt(
      await web3.eth.getBalance(account.address)
    );

    expect(tx.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(stableBalanceSenderAfter).toBeLessThan(stableBalanceSenderBefore);
    expect(nativeBalanceBefore).toEqual(nativeBalanceAfter + amount);
  },
  { timeout: 15_000 }
);
