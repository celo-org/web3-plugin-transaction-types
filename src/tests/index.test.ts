import { describe, beforeAll, expect, test, beforeEach } from "bun:test";
import Web3 from "web3";

import { CeloTransactionTypesPlugin } from "../index";
import { CeloChains } from "../utils";

describe("CeloTransactionTypesPlugin", () => {
  let web3: Web3;

  beforeAll(() => {
    web3 = new Web3();
    web3.registerPlugin(new CeloTransactionTypesPlugin());
    web3.celo.link(web3);
  });
  beforeEach(() => {
    web3.setProvider(CeloChains.alfajores.rpcUrl);
  });

  test("should be registered under .celo namespace", () => {
    expect(web3.celo).toMatchSnapshot();
  });

  describe("isValidFeeCurrency()", () => {
    test("l1", async () => {
      expect(web3.celo.isValidFeeCurrency("0x123")).resolves.toBe(false);
      expect(
        web3.celo.isValidFeeCurrency(
          "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1"
        )
      ).resolves.toBe(true);
    });
    test("l2", async () => {
      web3.setProvider(CeloChains.dango.rpcUrl);
      expect(web3.celo.isValidFeeCurrency("0x123")).resolves.toBe(false);
      expect(
        web3.celo.isValidFeeCurrency(
          "0x4822e58de6f5e485eF90df51C41CE01721331dC0"
        )
      ).resolves.toBe(true);
    });
  });
});
