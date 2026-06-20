import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10_143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
  testnet: true,
});

export const mockUsdcAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const campaignFactoryAbi = [
  {
    type: "function",
    name: "createCampaign",
    stateMutability: "nonpayable",
    inputs: [
      { name: "beneficiary", type: "address" },
      { name: "token", type: "address" },
      { name: "oracle", type: "address" },
      { name: "maxPayout", type: "uint256" },
      { name: "baseFee", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "thresholds", type: "uint128[]" },
      { name: "bonuses", type: "uint128[]" },
      { name: "termsHash", type: "bytes32" },
    ],
    outputs: [
      { name: "campaignId", type: "uint256" },
      { name: "escrow", type: "address" },
    ],
  },
] as const;

export const monadContracts = {
  factory: process.env.NEXT_PUBLIC_CAMPAIGN_FACTORY_ADDRESS,
  token: process.env.NEXT_PUBLIC_MOCK_STABLECOIN_ADDRESS,
  oracle: process.env.NEXT_PUBLIC_PERFORMANCE_ORACLE_ADDRESS,
  registry: process.env.NEXT_PUBLIC_CONVERSION_REGISTRY_ADDRESS,
  treasury: process.env.NEXT_PUBLIC_AGENT_TREASURY_ADDRESS,
};

export function contractsConfigured() {
  return Object.values(monadContracts).every(
    (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value),
  );
}
