import type { OkLinkTransaction, TokenHolding, TokenTransfer, CrossChainActivity } from "./types.js";
import {
  getAddressInfo,
  getAddressTransactions,
  getTokenBalances,
  getTokenTransactions,
  getInternalTransactions,
  getCrossChainTransactions,
  XLayerEmptyDataError,
} from "./xlayer-client.js";

export interface AddressProfile {
  address: string;
  balance: string;
  balanceSymbol: string;
  transactionCount: number;
  firstTransactionTime: string;
  lastTransactionTime: string;
}

export async function fetchAddressProfile(address: string): Promise<AddressProfile> {
  const info = await getAddressInfo(address);
  return {
    address: info.address,
    balance: info.balance,
    balanceSymbol: info.balanceSymbol || "OKB",
    transactionCount: parseInt(info.transactionCount || "0", 10),
    firstTransactionTime: info.firstTransactionTime,
    lastTransactionTime: info.lastTransactionTime,
  };
}

export async function fetchAllTransactions(
  address: string,
  maxPages = 5
): Promise<OkLinkTransaction[]> {
  const allTxs: OkLinkTransaction[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    // A wallet with no history returns an empty payload; that is not an error,
    // it just means there is nothing more to page through.
    let data;
    try {
      data = await getAddressTransactions(address, page, 50);
    } catch (err) {
      if (err instanceof XLayerEmptyDataError) break;
      throw err;
    }
    const list = data.transactionLists || [];

    for (const tx of list) {
      if (seen.has(tx.txId)) continue;
      seen.add(tx.txId);

      allTxs.push({
        txId: tx.txId,
        from: tx.from,
        to: tx.to,
        value: tx.amount || "0",
        gasUsed: "0",
        gasPrice: "0",
        txFee: tx.txFee || "0",
        blockHeight: parseInt(tx.height || "0", 10),
        timestamp: parseInt(tx.transactionTime || "0", 10),
        methodId: tx.methodId,
        status: tx.state === "success" ? "success" : "fail",
      });
    }

    const totalPages = parseInt(data.totalPage || "1", 10);
    if (page >= totalPages) break;
  }

  return allTxs;
}

// ---- Supplementary data (each degrades gracefully to empty on failure so a
// single flaky endpoint never takes down the whole profile) ----

async function safe<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function fetchTokenHoldings(address: string): Promise<TokenHolding[]> {
  return safe([] as TokenHolding[], async () => {
    const holdings: TokenHolding[] = [];
    for (let page = 1; page <= 2; page++) {
      const data = await getTokenBalances(address, "token_20", page, 50);
      for (const t of data.tokenList || []) {
        holdings.push({
          symbol: t.symbol,
          contractAddress: t.tokenContractAddress,
          amount: t.holdingAmount,
          priceUsd: Number(t.priceUsd) || 0,
          valueUsd: Number(t.valueUsd) || 0,
        });
      }
      if (page >= parseInt(data.totalPage || "1", 10)) break;
    }
    return holdings;
  });
}

export async function fetchNftCount(address: string): Promise<number> {
  return safe(0, async () => {
    const data = await getTokenBalances(address, "token_721", 1, 50);
    const onPage = (data.tokenList || []).length;
    const totalPage = parseInt(data.totalPage || "1", 10);
    // Exact when it fits on one page; a lower bound (50+) otherwise.
    return totalPage > 1 ? 50 : onPage;
  });
}

export async function fetchTokenTransfers(address: string, maxPages = 2): Promise<TokenTransfer[]> {
  return safe([] as TokenTransfer[], async () => {
    const transfers: TokenTransfer[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await getTokenTransactions(address, "token_20", page, 50);
      for (const t of data.transactionList || []) {
        transfers.push({
          txId: t.txId,
          from: t.from,
          to: t.to,
          symbol: t.symbol,
          amount: t.amount,
          contractAddress: t.tokenContractAddress,
          timestamp: parseInt(t.transactionTime || "0", 10),
        });
      }
      if (page >= parseInt(data.totalPage || "1", 10)) break;
    }
    return transfers;
  });
}

export async function fetchInternalTxCount(address: string): Promise<number> {
  return safe(0, async () => {
    const data = await getInternalTransactions(address, 1, 50);
    const totalPage = parseInt(data.totalPage || "1", 10);
    const onPage = (data.transactionList || []).length;
    return totalPage > 1 ? totalPage * 50 : onPage; // approximation beyond page 1
  });
}

export async function fetchCrossChainActivity(address: string): Promise<CrossChainActivity> {
  return safe({ total: 0, deposits: 0, withdrawals: 0 }, async () => {
    const data = await getCrossChainTransactions(address, 1, 50);
    const list = data.data || [];
    const deposits = list.filter((t) => t.crossType === "Deposit").length;
    const withdrawals = list.length - deposits;
    return { total: parseInt(data.total || "0", 10) || list.length, deposits, withdrawals };
  });
}

export interface FullWalletData {
  profile: AddressProfile;
  transactions: OkLinkTransaction[];
  holdings: TokenHolding[];
  tokenTransfers: TokenTransfer[];
  nftCount: number;
  internalTxCount: number;
  crossChain: CrossChainActivity;
}

// One-shot comprehensive fetch. Profile + native tx history are required;
// everything else is best-effort and fetched in parallel.
export async function fetchFullWalletData(address: string): Promise<FullWalletData> {
  const [profile, transactions, holdings, tokenTransfers, nftCount, internalTxCount, crossChain] =
    await Promise.all([
      fetchAddressProfile(address),
      fetchAllTransactions(address, 5),
      fetchTokenHoldings(address),
      fetchTokenTransfers(address),
      fetchNftCount(address),
      fetchInternalTxCount(address),
      fetchCrossChainActivity(address),
    ]);
  return { profile, transactions, holdings, tokenTransfers, nftCount, internalTxCount, crossChain };
}
