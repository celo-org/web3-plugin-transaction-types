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

export const CeloChains = {
  celo,
  mainnet: celo,
  alfajores,
  testnet: alfajores,
} as const;
