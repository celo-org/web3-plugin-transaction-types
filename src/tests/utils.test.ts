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
    test("returns a contract address", () => {
      expect(
        getContractAddressFromRegistry(plugin, "FeeCurrencyWhitelist")
      ).resolves.toMatch(/^0x[0-9a-f]{40}$/i);
    });
  });

  describe("isCel2()", () => {
    expect(isCel2(plugin)).resolves.toBe(false);
  });

  test("isWhitelisted()", () => {
    expect(isWhitelisted(plugin, "0x123")).resolves.toBe(false);
    expect(
      isWhitelisted(plugin, "0xc47bde654fEDA0d1dF4880f8BF00a5c650738586")
    ).resolves.toBe(true);
  });
});

testWithAnvilL2("l2", (web3) => {
  const plugin = new CeloTransactionTypesPlugin();
  web3.registerPlugin(plugin);

  describe("getContractAddressFromRegistry()", () => {
    test("returns a contract address", () => {
      expect(
        getContractAddressFromRegistry(plugin, "FeeCurrencyDirectory")
      ).resolves.toMatch(/^0x[0-9a-f]{40}$/i);
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

  describe("isCel2()", () => {
    expect(isCel2(plugin)).resolves.toBe(true);
  });
});
