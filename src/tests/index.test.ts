import { describe, beforeAll, expect, test } from "bun:test";
import Web3 from "web3";

import { CeloTransactionTypesPlugin } from "../index";

const defaultProvider = "https://forno.celo.org";

describe("CeloTransactionTypesPlugin", () => {
  let web3: Web3;

  beforeAll(() => {
    web3 = new Web3(defaultProvider);
    web3.registerPlugin(new CeloTransactionTypesPlugin());
  });

  test("should be registered under .celo namespace", () => {
    expect(web3.celo).toMatchSnapshot();
  });
});
