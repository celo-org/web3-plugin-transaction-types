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
import {
  testWithAnvilL1,
  testWithAnvilL2,
} from "@celo/dev-utils/lib/anvil-test";

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

testWithAnvilL1("l1", (web3) => {
  const plugin = new CeloTransactionTypesPlugin();
  web3.registerPlugin(plugin);

  describe("getContractAddress()", () => {
    test("returns a contract address", async () => {
      expect(
        getContractAddress(plugin, "FeeCurrencyWhitelist")
      ).resolves.toMatch(/0x[0-9a-f]{40}/i);
    });
  });

  describe("isCel2()", () => {
    expect(isCel2(plugin)).resolves.toBe(false);
  });

  test("isWhitelisted()", () => {
    expect(isWhitelisted(plugin, "0x123")).resolves.toBe(false);
    expect(
      isWhitelisted(plugin, "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1")
    ).resolves.toBe(true);
  });
});

testWithAnvilL2("l2", (web3) => {
  const plugin = new CeloTransactionTypesPlugin();
  web3.registerPlugin(plugin);

  describe("getContractAddress()", () => {
    test("returns a contract address", async () => {
      expect(
        getContractAddress(plugin, "FeeCurrencyDirectory")
      ).resolves.toMatch(/0x[0-9a-f]{40}/i);
    });
  });

  describe("isCel2()", () => {
    expect(isCel2(plugin)).resolves.toBe(false);
  });

  test("isWhitelisted", () => {
    web3.setProvider(CeloChains.dango.rpcUrl);
    expect(isWhitelisted(plugin, "0x123")).resolves.toBe(false);
    expect(
      isWhitelisted(plugin, "0x4822e58de6f5e485eF90df51C41CE01721331dC0")
    ).resolves.toBe(true);
  });
});
