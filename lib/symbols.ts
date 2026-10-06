import type { GroupId } from "./types";

export type CatalogItem = {
  symbol: string;
  name: string;
  group: GroupId;
};

export const GROUPS: { id: GroupId | "added"; label: string }[] = [
  { id: "added", label: "Added" },
  { id: "us-indices", label: "US indices" },
  { id: "us-stocks", label: "US stocks" },
  { id: "energy", label: "Energy" },
  { id: "india", label: "India" },
  { id: "global", label: "Asia & Europe" },
  { id: "fx", label: "Currencies" },
  { id: "crypto", label: "Crypto" },
];

const DEFAULTS: CatalogItem[] = [
  { symbol: "^GSPC", name: "S&P 500", group: "us-indices" },
  { symbol: "^DJI", name: "Dow Jones", group: "us-indices" },
  { symbol: "^IXIC", name: "Nasdaq", group: "us-indices" },
  { symbol: "^RUT", name: "Russell 2000", group: "us-indices" },
  { symbol: "^VIX", name: "VIX", group: "us-indices" },

  { symbol: "AAPL", name: "Apple", group: "us-stocks" },
  { symbol: "MSFT", name: "Microsoft", group: "us-stocks" },
  { symbol: "NVDA", name: "NVIDIA", group: "us-stocks" },
  { symbol: "AMZN", name: "Amazon", group: "us-stocks" },
  { symbol: "GOOGL", name: "Alphabet", group: "us-stocks" },
  { symbol: "META", name: "Meta", group: "us-stocks" },
  { symbol: "TSLA", name: "Tesla", group: "us-stocks" },
  { symbol: "JPM", name: "JPMorgan", group: "us-stocks" },

  { symbol: "CL=F", name: "WTI crude", group: "energy" },
  { symbol: "BZ=F", name: "Brent crude", group: "energy" },

  { symbol: "^NSEI", name: "Nifty 50", group: "india" },
  { symbol: "^BSESN", name: "Sensex", group: "india" },
  { symbol: "^NSEBANK", name: "Nifty Bank", group: "india" },

  { symbol: "^N225", name: "Nikkei 225", group: "global" },
  { symbol: "^HSI", name: "Hang Seng", group: "global" },
  { symbol: "000001.SS", name: "Shanghai Composite", group: "global" },
  { symbol: "399001.SZ", name: "Shenzhen Component", group: "global" },
  { symbol: "XIN9.FGI", name: "China A50", group: "global" },
  { symbol: "^KS11", name: "KOSPI", group: "global" },
  { symbol: "^TWII", name: "Taiwan Weighted", group: "global" },
  { symbol: "^GDAXI", name: "DAX", group: "global" },
  { symbol: "^FTSE", name: "FTSE 100", group: "global" },

  { symbol: "DX-Y.NYB", name: "US Dollar Index", group: "fx" },
  { symbol: "EURUSD=X", name: "EUR/USD", group: "fx" },
  { symbol: "GBPUSD=X", name: "GBP/USD", group: "fx" },
  { symbol: "USDJPY=X", name: "USD/JPY", group: "fx" },
  { symbol: "USDINR=X", name: "USD/INR", group: "fx" },
  { symbol: "USDCNY=X", name: "USD/CNY", group: "fx" },

  { symbol: "BTC-USD", name: "Bitcoin", group: "crypto" },
  { symbol: "ETH-USD", name: "Ethereum", group: "crypto" },
  { symbol: "SOL-USD", name: "Solana", group: "crypto" },
];

const EXTRAS: CatalogItem[] = [
  { symbol: "BRK-B", name: "Berkshire Hathaway", group: "us-stocks" },
  { symbol: "AVGO", name: "Broadcom", group: "us-stocks" },
  { symbol: "AMD", name: "AMD", group: "us-stocks" },
  { symbol: "NFLX", name: "Netflix", group: "us-stocks" },
  { symbol: "XOM", name: "Exxon Mobil", group: "us-stocks" },
  { symbol: "WMT", name: "Walmart", group: "us-stocks" },
  { symbol: "JNJ", name: "Johnson & Johnson", group: "us-stocks" },
  { symbol: "GC=F", name: "Gold", group: "energy" },
  { symbol: "SI=F", name: "Silver", group: "energy" },
  { symbol: "NG=F", name: "Natural gas", group: "energy" },
  { symbol: "RELIANCE.NS", name: "Reliance", group: "india" },
  { symbol: "TCS.NS", name: "TCS", group: "india" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", group: "india" },
  { symbol: "INFY.NS", name: "Infosys", group: "india" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", group: "india" },
  { symbol: "^AXJO", name: "ASX 200", group: "global" },
  { symbol: "^FCHI", name: "CAC 40", group: "global" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", group: "global" },
  { symbol: "^GSPTSE", name: "S&P/TSX", group: "global" },
  { symbol: "AUDUSD=X", name: "AUD/USD", group: "fx" },
  { symbol: "USDCHF=X", name: "USD/CHF", group: "fx" },
  { symbol: "XRP-USD", name: "XRP", group: "crypto" },
  { symbol: "BNB-USD", name: "BNB", group: "crypto" },
];

export const CATALOG: CatalogItem[] = [...DEFAULTS, ...EXTRAS];

export const DEFAULT_SYMBOLS = DEFAULTS.map((item) => item.symbol);

const bySymbol = new Map(CATALOG.map((item) => [item.symbol, item]));

export function catalogItem(symbol: string) {
  return bySymbol.get(symbol);
}

export function isSymbol(value: string) {
  return /^[\^A-Z0-9.=-]{1,24}$/.test(value);
}

export function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

export function groupOf(symbol: string, quoteType?: string): GroupId | "added" {
  const known = bySymbol.get(symbol);
  if (known) return known.group;
  if (quoteType === "CRYPTOCURRENCY") return "crypto";
  if (quoteType === "CURRENCY") return "fx";
  if (quoteType === "FUTURE") return "energy";
  if (quoteType === "INDEX") return "global";
  return "added";
}

export function searchCatalog(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored = CATALOG.flatMap((item) => {
    const symbol = item.symbol.toLowerCase();
    const name = item.name.toLowerCase();
    let score = 0;
    if (symbol === q) score = 100;
    else if (symbol.startsWith(q)) score = 80;
    else if (name.startsWith(q)) score = 60;
    else if (symbol.includes(q) || name.includes(q)) score = 40;
    else return [];
    return [{ item, score }];
  });

  scored.sort(
    (a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name),
  );
  return scored.slice(0, 8).map((entry) => entry.item);
}
