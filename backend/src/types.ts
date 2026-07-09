export interface OkLinkTransaction {
  txId: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  txFee: string;
  blockHeight: number;
  timestamp: number;
  methodId?: string;
  status: "success" | "fail";
}

export interface WalletMetrics {
  totalTx: number;
  tokenSymbol: string;
  balanceEth: string;
  balanceUsd: string;
  gasBurnedEth: string;
  gasBurnedUsd: string;
  swapCount: number;
  defiScore: number;
  airdropScore: number;
  degenScore: number;
  diamondHandsDays: number;
  whaleometer: number;
  uniqueProtocols: number;
  topFrenemy: string;
  peakHour: number;
  activityStreak: number;
  archetype: WalletArchetype;
  sarcasticTitle: string;
}

export type WalletArchetype =
  | "The 2AM Degen"
  | "The Diamond HODLer"
  | "The Gas Warrior"
  | "The DeFi Explorer"
  | "The Micro Duster"
  | "The Tourist"
  | "The Sleepy Whale"
  | "The Yield Farmer"
  | "The Bot"
  | "The Based Chad";

export interface WalletPersonality {
  title: string;
  roast: string;
  funFacts: string[];
  verdict: string;
}

export interface TxWrapResponse {
  success: boolean;
  data?: {
    metrics: WalletMetrics;
    personality: WalletPersonality;
    slideshowUrl: string;
    markdown: string;
  };
  error?: string;
}

export interface TxWrapRequest {
  address: string;
  chainId?: string;
}
