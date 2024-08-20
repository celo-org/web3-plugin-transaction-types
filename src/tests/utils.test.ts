import { describe, expect, test } from "bun:test";
import { CeloChains, TxTypeToPrefix } from "../utils";
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
