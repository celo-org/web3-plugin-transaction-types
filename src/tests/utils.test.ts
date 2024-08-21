import { describe, expect, test } from "bun:test";
import {
  CeloChains,
  getContractAddress,
  isCel2,
  isWhitelisted,
  TxTypeToPrefix,
} from "../utils";
import Web3 from "web3";
import { CeloTransactionTypesPlugin } from "..";
describe("CeloChains", () => {
  test("chains should be configured", () => {
    expect(CeloChains).toMatchSnapshot();
  });
});

describe("Types", () => {
  test("tx types should be configured", () => {
    expect(TxTypeToPrefix).toMatchSnapshot();
  });
});

describe("getContractAddress()", () => {
  const web3 = new Web3(CeloChains.alfajores.rpcUrl);
  const plugin = new CeloTransactionTypesPlugin();
  web3.registerPlugin(plugin);
  test("returns a contract address", async () => {
    expect(getContractAddress(plugin, "FeeCurrencyWhitelist")).resolves.toMatch(
      /0x[0-9a-f]{40}/i
    );
  });
});

describe("isCel2()", () => {
  test("l1", async () => {
    const web3 = new Web3(CeloChains.alfajores.rpcUrl);
    const plugin = new CeloTransactionTypesPlugin();
    web3.registerPlugin(plugin);
    expect(isCel2(plugin)).resolves.toBe(false);
  });
  test("l2", async () => {
    const web3 = new Web3(CeloChains.dango.rpcUrl);
    const plugin = new CeloTransactionTypesPlugin();
    web3.registerPlugin(plugin);
    expect(isCel2(plugin)).resolves.toBe(true);
  });
});
