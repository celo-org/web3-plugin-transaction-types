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
