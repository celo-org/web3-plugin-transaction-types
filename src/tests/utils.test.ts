import { describe, expect, test } from "bun:test";
import {
  CeloChains,
  getContractAddressFromRegistry,
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

  describe("getContractAddressFromRegistry()", () => {
    test("returns a contract address", async () => {
      expect(
        await getContractAddressFromRegistry(plugin, "FeeCurrencyWhitelist")
      ).toMatch(/^0x[0-9a-f]{40}$/i);
    });
  });

  describe("isCel2()", async () => {
    expect(await isCel2(plugin)).toBe(false);
  });

  test("isWhitelisted()", async () => {
    expect(await isWhitelisted(plugin, "0x123")).toBe(false);
    expect(
      await isWhitelisted(plugin, "0xc47bde654fEDA0d1dF4880f8BF00a5c650738586")
    ).toBe(true);
  });
});

testWithAnvilL2("l2", (web3) => {
  const plugin = new CeloTransactionTypesPlugin();
  web3.registerPlugin(plugin);

  describe("getContractAddressFromRegistry()", () => {
    test("returns a contract address", async () => {
      expect(
        await getContractAddressFromRegistry(plugin, "FeeCurrencyDirectory")
      ).toMatch(/^0x[0-9a-f]{40}$/i);
    });
    test("returns a non zero contract address", async () => {
      const address = await getContractAddressFromRegistry(
        plugin,
        "StableTokenEUR"
      );
      expect(address).toMatch(/^0x[0-9a-f]{40}$/i);
      expect(BigInt(address)).not.toEqual(0n);
    });
    test("throws if doesn't exists", () => {
      expect(
        getContractAddressFromRegistry(plugin, "FAKE CONTRACT NAME")
      ).rejects.toMatchSnapshot();
    });
  });

  describe("isCel2()", async () => {
    expect(await isCel2(plugin)).toBe(true);
  });

  test("isWhitelisted", async () => {
    web3.setProvider(CeloChains.dango.rpcUrl);
    expect(await isWhitelisted(plugin, "0x123")).toBe(false);
    expect(
      await isWhitelisted(plugin, "0x4822e58de6f5e485eF90df51C41CE01721331dC0")
    ).toBe(true);
  });
});
