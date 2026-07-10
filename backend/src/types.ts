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

export interface ActivityBreakdown {
  swap: number;
  approve: number;
  transfer: number;
  native: number;
  other: number;
}

export interface TokenHolding {
  symbol: string;
  contractAddress: string;
  amount: string;
  priceUsd: number;
  valueUsd: number;
}

export interface TokenTransfer {
  txId: string;
  from: string;
  to: string;
  symbol: string;
  amount: string;
  contractAddress: string;
  timestamp: number;
}

export interface CrossChainActivity {
  total: number;
  deposits: number;
  withdrawals: number;
}

export interface PortfolioSummary {
  tokenCount: number;
  totalValueUsd: number;
  stablecoinValueUsd: number;
  topHoldings: { symbol: string; amount: string; valueUsd: number }[];
  nftCount: number;
}

export interface TokenActivitySummary {
  transferCount: number;
  uniqueTokens: number;
  inbound: number;
  outbound: number;
  topToken: string;
}

// Decision-grade behavioral flags an agent can act on. All heuristic and
// derived only from analyzed on-chain activity.
export interface WalletSignals {
  nightOwl: boolean;
  approvalHeavy: boolean;
  likelyBot: boolean;
  dustPattern: boolean;
  highSwapActivity: boolean;
  newWallet: boolean;
  dormant: boolean;
  whale: boolean;
  diversifiedPortfolio: boolean;
  stablecoinHeavy: boolean;
  crossChainUser: boolean;
  nftCollector: boolean;
  contractHeavy: boolean;
}

// Recent-activity direction, so an agent sees where a wallet is heading — not
// just a static snapshot. Counts are within the analyzed window.
export interface WalletTrajectory {
  tx7d: number; // transactions in the last 7 days
  tx30d: number; // transactions in the last 30 days
  prev7d: number; // transactions in the 7 days before last (days 8–14)
  momentum: "heating" | "cooling" | "steady" | "dormant";
}

// What the analysis was based on, so an agent can weigh how much to trust it.
export interface AnalysisEvidence {
  analyzedTx: number;
  totalTx: number;
  window: string;
  caveat: string;
}

export interface WalletMetrics {
  totalTx: number;
  tokenSymbol: string;
  balanceEth: string;
  balanceUsd: string;
  gasBurnedEth: string;
  gasBurnedUsd: string;
  swapCount: number;
  activityBreakdown: ActivityBreakdown;
  portfolio: PortfolioSummary;
  tokenActivity: TokenActivitySummary;
  internalTxCount: number;
  crossChain: CrossChainActivity;
  netWorthUsd: string;
  defiScore: number;
  airdropScore: number;
  degenScore: number;
  diamondHandsDays: number;
  whaleometer: number;
  uniqueProtocols: number;
  topFrenemy: string;
  topFrenemyLabel: string;
  peakHour: number;
  activityStreak: number;
  trajectory: WalletTrajectory;
  archetype: WalletArchetype;
  archetypeConfidence: number;
  signals: WalletSignals;
  evidence: AnalysisEvidence;
  rarity: string;
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
  | "The Ghost"
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
