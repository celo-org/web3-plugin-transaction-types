import { registryABI, feeCurrencyWhitelistABI } from "@celo/abis";
import { feeCurrencyDirectoryABI } from "@celo/abis-l2";
import Web3, { Address, Contract } from "web3";
import { CeloTransactionTypesPlugin } from ".";

export enum TxTypeToPrefix {
  "ethereum-legacy" = "",
  cip42 = "0x7c",
  cip64 = "0x7b",
  cip66 = "0x7a",
  eip1559 = "0x02",
}

const celo = {
  chainId: 42220,
  rpcUrl: "https://forno.celo.org",
  explorerUrl: "https://celoscan.io",
} as const;
const alfajores = {
  chainId: 44787,
  rpcUrl: "https://alfajores-forno.celo-testnet.org",
  explorerUrl: "https://alfajores.celoscan.io",
} as const;
const dango = {
  chainId: 44787,
  rpcUrl: "https://forno.dango.celo-testnet.org",
  explorerUrl: "https://celo-dango.blockscout.com/",
} as const;

export const CeloChains = {
  celo,
  mainnet: celo,
  alfajores,
  testnet: alfajores,
  dango,
  testnetl2: dango,
} as const;

export const PROXY_ADMIN_ADDRESS = "0x4200000000000000000000000000000000000018";
export const REGISTRY_ADDRESS = "0x000000000000000000000000000000000000ce10";

export const getContractAddress = async (
  ctx: CeloTransactionTypesPlugin,
  contractName: string
) => {
  const contract = new Contract(registryABI, REGISTRY_ADDRESS);
  contract.link(ctx);

  const address = await contract.methods
    .getAddressForString(contractName)
    .call();

  return address;
};

export const isCel2 = async (ctx: CeloTransactionTypesPlugin) => {
  const web3 = new Web3(ctx.provider);
  const code = await web3.eth.getCode(PROXY_ADMIN_ADDRESS);

  if (typeof code === "string") {
    return code != "0x" && code.length > 2;
  }

  return false;
};

export async function isWhitelisted(
  ctx: CeloTransactionTypesPlugin,
  feeCurrency: Address
) {
  const l2 = await isCel2(ctx);

  const address = await getContractAddress(
    ctx,
    l2 ? "FeeCurrencyDirectory" : "FeeCurrencyWhitelist"
  );

  const contract = new Contract(
    l2 ? feeCurrencyDirectoryABI : feeCurrencyWhitelistABI,
    address
  );
  contract.link(ctx);

  const whitelist = await contract.methods[
    l2 ? "getCurrencies" : "getWhitelist"
  ]().call();

  return whitelist
    .map((x) => x.toLowerCase())
    .includes(feeCurrency.toLowerCase());
}
