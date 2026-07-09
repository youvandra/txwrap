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

function request(method: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timestamp = isoNow();
    const signature = sign(timestamp, method, path, "");

    const url = new URL(`${BASE_URL}${path}`);

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      rejectUnauthorized: config.nodeEnv === "production",
      headers: {
        "OK-ACCESS-KEY": config.xlayerApiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-PASSPHRASE": config.xlayerPassphrase,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "User-Agent": "TxWrap/1.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
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

async function apiGet<T>(path: string): Promise<T> {
  const raw = await request("GET", path);
  const json = JSON.parse(raw);

  if (json.code !== "0") {
    throw new Error(`X Layer API error: ${json.code} ${json.msg}`);
  }

  return json.data[0];
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
