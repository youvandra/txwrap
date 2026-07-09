import type { OkLinkTransaction } from "./types.js";
import {
  getAddressInfo,
  getAddressTransactions,
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
    const data = await getAddressTransactions(address, page, 50);
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
