import crypto from "crypto";
import https from "https";
import { config } from "./config.js";

const BASE_URL = "https://web3.okx.com";

function sign(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string
): string {
  const message = timestamp + method + requestPath + body;
  const hmac = crypto.createHmac("sha256", config.xlayerSecretKey);
  hmac.update(message);
  return hmac.digest("base64");
}

function isoNow(): string {
  return new Date().toISOString().slice(0, -5) + "Z";
}

export class XLayerRateLimitError extends Error {
  constructor() {
    super("X Layer API rate limit (429)");
    this.name = "XLayerRateLimitError";
  }
}

// The upstream throttles bursts, and a single profile fans out to ~12 calls.
// Serialize them behind a minimum gap so we never trip the limiter instead of
// firing everything at once and retrying our way out of it.
const MIN_GAP_MS = 220;
let chain: Promise<unknown> = Promise.resolve();

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const result = await fn();
    await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    return result;
  });
  // Keep the chain alive even when a call rejects.
  chain = run.catch(() => undefined);
  return run;
}

function rawRequest(method: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timestamp = isoNow();
    const signature = sign(timestamp, method, path, "");

    const url = new URL(`${BASE_URL}${path}`);

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      rejectUnauthorized: true,
      headers: {
        "OK-ACCESS-KEY": config.xlayerApiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-PASSPHRASE": config.xlayerPassphrase,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "User-Agent": "WalletLens/1.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else if (res.statusCode === 429) {
          reject(new XLayerRateLimitError());
        } else {
          reject(
            new Error(
              `X Layer API error ${res.statusCode}: ${data.slice(0, 200)}`
            )
          );
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// The upstream can answer `code: "0"` with an empty `data` array — most often
// when a burst of parallel requests gets throttled. Reading `data[0]` blindly
// then blew up far downstream as "Cannot read properties of undefined".
export class XLayerEmptyDataError extends Error {
  constructor(path: string) {
    super(`X Layer API returned no data for ${path}`);
    this.name = "XLayerEmptyDataError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiGetOnce<T>(path: string): Promise<T> {
  const raw = await schedule(() => rawRequest("GET", path));
  const json = JSON.parse(raw);

  // 50011 is the throttling code; it can arrive with a 200 status.
  if (json.code === "50011") throw new XLayerRateLimitError();
  if (json.code !== "0") {
    throw new Error(`X Layer API error: ${json.code} ${json.msg}`);
  }

  const first = Array.isArray(json.data) ? json.data[0] : undefined;
  if (first === undefined) throw new XLayerEmptyDataError(path);

  return first as T;
}

// Retry the two throttling symptoms — an outright 429, and a 200 whose `data`
// came back empty. A genuinely empty response stays empty after the retries.
async function apiGet<T>(path: string, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await apiGetOnce<T>(path);
    } catch (err) {
      lastErr = err;
      const retryable =
        err instanceof XLayerEmptyDataError || err instanceof XLayerRateLimitError;
      if (!retryable || i === attempts - 1) break;
      await sleep(400 * 2 ** i); // 400ms, 800ms, 1.6s, 3.2s
    }
  }
  throw lastErr;
}

export interface XlayerAddressInfo {
  address: string;
  balance: string;
  balanceSymbol: string;
  transactionCount: string;
  firstTransactionTime: string;
  lastTransactionTime: string;
}

export interface XlayerTxEntry {
  txId: string;
  methodId?: string;
  height: string;
  transactionTime: string;
  from: string;
  to: string;
  amount: string;
  transactionSymbol: string;
  txFee: string;
  state: string;
  tokenContractAddress?: string;
}

export interface XlayerTxList {
  page: string;
  limit: string;
  totalPage: string;
  transactionLists: XlayerTxEntry[];
}

export async function getAddressInfo(
  address: string
): Promise<XlayerAddressInfo> {
  return apiGet<XlayerAddressInfo>(
    `/api/v5/xlayer/address/information-evm?chainShortName=xlayer&address=${address}`
  );
}

export async function getAddressTransactions(
  address: string,
  page = 1,
  limit = 50
): Promise<XlayerTxList> {
  return apiGet<XlayerTxList>(
    `/api/v5/xlayer/address/transaction-list?chainShortName=xlayer&address=${address}&page=${page}&limit=${limit}`
  );
}

// ---- Transaction detail (includes full calldata) ----

export interface XlayerTxDetail {
  txid: string;
  methodId: string;
  inputData: string;
  state: string;
  transactionTime: string;
  outputDetails: { outputHash: string; isContract: boolean }[];
}

export async function getTransactionDetail(txId: string): Promise<XlayerTxDetail> {
  return apiGet<XlayerTxDetail>(
    `/api/v5/xlayer/transaction/transaction-fills?chainShortName=xlayer&txid=${txId}`
  );
}

// ---- Token balances (ERC-20 / -721 / -1155 holdings) ----

export interface XlayerTokenBalance {
  symbol: string;
  tokenContractAddress: string;
  tokenType: string;
  holdingAmount: string; // human-readable decimal string
  priceUsd: string;
  valueUsd: string;
  tokenId: string;
}

export interface XlayerTokenBalanceList {
  page: string;
  limit: string;
  totalPage: string;
  tokenList: XlayerTokenBalance[];
}

export async function getTokenBalances(
  address: string,
  protocolType: "token_20" | "token_721" | "token_1155" = "token_20",
  page = 1,
  limit = 50
): Promise<XlayerTokenBalanceList> {
  return apiGet<XlayerTokenBalanceList>(
    `/api/v5/xlayer/address/token-balance?chainShortName=xlayer&address=${address}&protocolType=${protocolType}&page=${page}&limit=${limit}`
  );
}

// ---- Token transfers (ERC-20 transfer history of an address) ----

export interface XlayerTokenTx {
  txId: string;
  height: string;
  transactionTime: string;
  from: string;
  to: string;
  tokenContractAddress: string;
  tokenId: string;
  amount: string; // human-readable decimal string
  symbol: string;
  isFromContract: boolean;
  isToContract: boolean;
}

export interface XlayerTokenTxList {
  page: string;
  limit: string;
  totalPage: string;
  transactionList: XlayerTokenTx[];
}

export async function getTokenTransactions(
  address: string,
  protocolType: "token_20" | "token_721" | "token_1155" = "token_20",
  page = 1,
  limit = 50
): Promise<XlayerTokenTxList> {
  return apiGet<XlayerTokenTxList>(
    `/api/v5/xlayer/address/token-transaction-list?chainShortName=xlayer&address=${address}&protocolType=${protocolType}&page=${page}&limit=${limit}`
  );
}

// ---- Internal transactions (contract-triggered) ----

export interface XlayerInternalTx {
  txId: string;
  height: string;
  transactionTime: string;
  from: string;
  to: string;
  isFromContract: boolean;
  isToContract: boolean;
  operation: string;
  amount: string;
  symbol: string;
  state: string;
}

export interface XlayerInternalTxList {
  page: string;
  limit: string;
  totalPage: string;
  transactionList: XlayerInternalTx[];
}

export async function getInternalTransactions(
  address: string,
  page = 1,
  limit = 50
): Promise<XlayerInternalTxList> {
  return apiGet<XlayerInternalTxList>(
    `/api/v5/xlayer/address/internal-transaction-list?chainShortName=xlayer&address=${address}&page=${page}&limit=${limit}`
  );
}

// ---- Cross-chain (X Layer <-> TradeZone) transfers ----

export interface XlayerCrossChainTx {
  txType: string; // "XLayerToTZ" | "TZToXLayer"
  crossType: string; // "Deposit" | "Withdraw" | "BatchWithdraw"
  status: string; // "0x1" success
  from: string;
  to: string;
  value: string;
  tokenType: string;
  tokenName: string;
  xlayerBlockTime: string;
}

export interface XlayerCrossChainList {
  page: string;
  limit: string;
  totalPage: string;
  total: string;
  data: XlayerCrossChainTx[];
}

export async function getCrossChainTransactions(
  address: string,
  page = 1,
  limit = 50
): Promise<XlayerCrossChainList> {
  return apiGet<XlayerCrossChainList>(
    `/api/v5/xlayer/tz/cross/transaction-list?chainShortName=TRADE_ZONE&address=${address}&page=${page}&limit=${limit}`
  );
}
