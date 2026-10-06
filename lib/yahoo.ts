import { catalogItem } from "./symbols";
import type { ChartSeries, Point, Quote, RangeId, Session } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const JSON_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  Referer: "https://finance.yahoo.com/",
};

const HTML_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

const RANGES: Record<
  RangeId,
  { range: string; interval: string; intraday: boolean }
> = {
  "1d": { range: "1d", interval: "5m", intraday: true },
  "5d": { range: "5d", interval: "15m", intraday: true },
  "1mo": { range: "1mo", interval: "1d", intraday: false },
  "6mo": { range: "6mo", interval: "1d", intraday: false },
  ytd: { range: "ytd", interval: "1d", intraday: false },
  "1y": { range: "1y", interval: "1d", intraday: false },
  "5y": { range: "5y", interval: "1wk", intraday: false },
};

const QUOTE_TTL_MS = 25_000;
const CHART_TTL_MS = 60_000;

type CacheEntry<T> = { exp: number; value: T };

const quoteCache = new Map<string, CacheEntry<Quote>>();
const quoteInflight = new Map<string, Promise<Quote | null>>();
const chartCache = new Map<string, CacheEntry<ChartSeries>>();

let sparkBlockedUntil = 0;
let chartBlockedUntil = 0;

type YahooRecord = Record<string, unknown>;

export function isRangeId(value: string): value is RangeId {
  return value in RANGES;
}

export async function getQuotes(symbols: string[]) {
  const needed = symbols.filter((symbol) => !freshQuote(symbol));
  if (needed.length) {
    await trySpark(needed);
  }
  const still = symbols.filter((symbol) => !freshQuote(symbol));
  await mapPool(still, 4, loadPage);
  const failed = symbols.filter((symbol) => !freshQuote(symbol));
  await mapPool(failed, 2, loadPage);

  return symbols.flatMap((symbol) => {
    const quote = freshQuote(symbol);
    return quote ? [quote] : [];
  });
}

export async function getChart(symbol: string, range: RangeId) {
  const key = `${symbol}:${range}`;
  const cached = chartCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.value;

  const spec = RANGES[range];
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${spec.range}&interval=${spec.interval}&includePrePost=false`;
  const payload = await yahooJson(url, "chart");
  if (payload === "blocked" || !payload) {
    throw new FeedError(
      "Longer ranges aren’t available from the feed right now. Today’s session is still on 1D.",
    );
  }

  const chart = readChart(payload, symbol, range, spec.intraday);
  if (!chart) {
    throw new FeedError("No prices for this range.");
  }
  chartCache.set(key, { exp: Date.now() + CHART_TTL_MS, value: chart });
  return chart;
}

export class FeedError extends Error {}

async function trySpark(symbols: string[]) {
  const url =
    "https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=5m&includePrePost=false&includeTimestamps=true&symbols=" +
    symbols.map(encodeURIComponent).join(",");
  const payload = await yahooJson(url, "spark");
  if (payload === "blocked" || !payload) return;

  const result = asRecord(asRecord(payload).spark).result;
  if (!Array.isArray(result)) return;

  for (const item of result) {
    const record = asRecord(item);
    const symbol = typeof record.symbol === "string" ? record.symbol : "";
    const response = Array.isArray(record.response) ? record.response[0] : record.response;
    const quote = buildQuote(symbol, asRecord(response), undefined);
    if (quote) rememberQuote(quote);
  }
}

async function loadPage(symbol: string) {
  const pending = quoteInflight.get(symbol);
  if (pending) {
    await pending;
    return;
  }
  const task = fetchQuotePage(symbol)
    .then((quote) => {
      if (quote) rememberQuote(quote);
      return quote;
    })
    .finally(() => {
      quoteInflight.delete(symbol);
    });
  quoteInflight.set(symbol, task);
  await task;
}

async function fetchQuotePage(symbol: string) {
  const response = await fetch(
    `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
    {
      headers: HTML_HEADERS,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) return null;
  const html = await response.text();
  return parseQuotePage(symbol, html);
}

function parseQuotePage(symbol: string, html: string) {
  const payloads = embeddedPayloads(html);
  const spark = sparkFor(payloads, symbol);
  if (!spark) return null;
  return buildQuote(symbol, spark, quoteFor(payloads, symbol));
}

function buildQuote(
  requested: string,
  spark: YahooRecord,
  quoteObj: YahooRecord | undefined,
) {
  const meta = asRecord(spark.meta);
  const live = livePrice(quoteObj);
  const price = live?.price ?? num(meta.regularMarketPrice);
  if (price == null || !requested) return null;

  const previousClose =
    num(quoteObj?.regularMarketPreviousClose) ??
    num(meta.previousClose) ??
    num(meta.chartPreviousClose);

  const change =
    live?.change ?? (previousClose == null ? 0 : price - previousClose);
  const changePercent =
    live?.changePercent ??
    (previousClose ? (change / previousClose) * 100 : 0);

  const quoteType = text(quoteObj?.quoteType) || text(meta.instrumentType);
  const session = quoteObj?.marketState
    ? sessionFromState(text(quoteObj.marketState), quoteType)
    : sessionFromMeta(meta, quoteType);

  const series = seriesFrom(spark);
  const feedName =
    text(quoteObj?.longName) ||
    text(quoteObj?.shortName) ||
    text(meta.longName) ||
    text(meta.shortName) ||
    requested;

  const quote: Quote = {
    symbol: requested,
    name: catalogItem(requested)?.name ?? cleanName(feedName),
    quoteType,
    exchange: text(quoteObj?.fullExchangeName) || text(meta.fullExchangeName),
    currency: text(quoteObj?.currency) || text(meta.currency),
    timezone:
      text(quoteObj?.exchangeTimezoneName) ||
      text(meta.exchangeTimezoneName) ||
      "UTC",
    gmtOffset:
      num(meta.gmtoffset) ??
      (num(quoteObj?.gmtOffSetMilliseconds) != null
        ? num(quoteObj?.gmtOffSetMilliseconds)! / 1000
        : 0),
    price,
    change,
    changePercent,
    previousClose,
    session,
    delayedMinutes: Math.max(0, num(quoteObj?.exchangeDataDelayedBy) ?? 0),
    asOf: live?.asOf ?? num(meta.regularMarketTime),
    spark: downsample(series.map((point) => point.value), 48),
    series,
  };
  return quote;
}

function livePrice(quote: YahooRecord | undefined) {
  if (!quote) return null;
  const state = text(quote.marketState);
  if ((state === "PRE") && num(quote.preMarketPrice) != null) {
    return {
      price: num(quote.preMarketPrice)!,
      change: num(quote.preMarketChange),
      changePercent: num(quote.preMarketChangePercent),
      asOf: num(quote.preMarketTime),
    };
  }
  if ((state === "POST") && num(quote.postMarketPrice) != null) {
    return {
      price: num(quote.postMarketPrice)!,
      change: num(quote.postMarketChange),
      changePercent: num(quote.postMarketChangePercent),
      asOf: num(quote.postMarketTime),
    };
  }
  const price = num(quote.regularMarketPrice);
  if (price == null) return null;
  return {
    price,
    change: num(quote.regularMarketChange),
    changePercent: num(quote.regularMarketChangePercent),
    asOf: num(quote.regularMarketTime),
  };
}

function sessionFromState(state: string, quoteType: string): Session {
  if (quoteType === "CRYPTOCURRENCY" || quoteType === "CURRENCY") return "open";
  if (state === "REGULAR") return "open";
  if (state === "PRE") return "pre";
  if (state === "POST") return "post";
  return "closed";
}

function sessionFromMeta(meta: YahooRecord, quoteType: string): Session {
  if (quoteType === "CRYPTOCURRENCY" || quoteType === "CURRENCY") return "open";
  const period = asRecord(meta.currentTradingPeriod);
  const regular = asRecord(period.regular);
  const start = num(regular.start);
  const end = num(regular.end);
  const now = Date.now() / 1000;
  if (start == null || end == null) return "closed";
  if (end - start >= 20 * 60 * 60) return "open";
  if (now >= start && now < end) return "open";
  const pre = asRecord(period.pre);
  const post = asRecord(period.post);
  const preStart = num(pre.start);
  const preEnd = num(pre.end);
  const postStart = num(post.start);
  const postEnd = num(post.end);
  if (preStart != null && preEnd != null && now >= preStart && now < preEnd) return "pre";
  if (postStart != null && postEnd != null && now >= postStart && now < postEnd) return "post";
  return "closed";
}

function seriesFrom(spark: YahooRecord): Point[] {
  const timestamps = Array.isArray(spark.timestamp) ? spark.timestamp : [];
  const closes = closesOf(spark);
  const points: Point[] = [];
  let last = -Infinity;
  for (let index = 0; index < timestamps.length; index += 1) {
    const time = num(timestamps[index]);
    const value = num(closes[index]);
    if (time == null || value == null || time <= last) continue;
    points.push({ time, value });
    last = time;
  }
  return points;
}

function closesOf(spark: YahooRecord) {
  const indicators = asRecord(spark.indicators);
  const quote = indicators.quote;
  if (!Array.isArray(quote) || !quote.length) return [];
  const closes = asRecord(quote[0]).close;
  return Array.isArray(closes) ? closes : [];
}

function readChart(
  payload: unknown,
  symbol: string,
  range: RangeId,
  intraday: boolean,
): ChartSeries | null {
  const result = asRecord(asRecord(payload).chart).result;
  if (!Array.isArray(result) || !result.length) return null;
  const entry = asRecord(result[0]);
  const meta = asRecord(entry.meta);
  const series = seriesFrom(entry);
  if (!series.length) return null;
  return {
    symbol,
    range,
    intraday,
    timezone: text(meta.exchangeTimezoneName) || "UTC",
    gmtOffset: num(meta.gmtoffset) ?? 0,
    previousClose: num(meta.chartPreviousClose) ?? num(meta.previousClose),
    series,
  };
}

function embeddedPayloads(html: string) {
  const payloads: { url: string; body: YahooRecord }[] = [];
  const pattern =
    /<script type="application\/json" data-sveltekit-fetched([^>]*)>([\s\S]*?)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    const urlMatch = match[1]?.match(/data-url="([^"]+)"/);
    if (!urlMatch?.[1]) continue;
    try {
      const wrapper = JSON.parse(match[2] ?? "") as { status?: number; body?: unknown };
      if ((wrapper.status ?? 200) >= 400) continue;
      const body =
        typeof wrapper.body === "string" ? JSON.parse(wrapper.body) : wrapper.body;
      payloads.push({ url: decodeHtml(urlMatch[1]), body: asRecord(body) });
    } catch {
      continue;
    }
  }
  return payloads;
}

function sparkFor(payloads: { url: string; body: YahooRecord }[], symbol: string) {
  const sparks = payloads.filter((payload) => payload.url.includes("/v7/finance/spark"));
  const exact = sparks.find((payload) => symbolParam(payload.url) === symbol);
  const single =
    exact ??
    sparks.find((payload) => {
      const symbols = symbolParam(payload.url);
      return symbols.length > 0 && !symbols.includes(",");
    });
  const response = single?.body.spark;
  const result = asRecord(response).result;
  if (!Array.isArray(result) || !result.length) return null;
  const first = asRecord(result[0]).response;
  const entry = Array.isArray(first) ? first[0] : first;
  const record = asRecord(entry);
  return record.meta ? record : null;
}

function quoteFor(payloads: { url: string; body: YahooRecord }[], symbol: string) {
  let best: YahooRecord | undefined;
  for (const payload of payloads) {
    const results = asRecord(payload.body.quoteResponse).result;
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      const record = asRecord(result);
      if (record.symbol !== symbol) continue;
      if (!best || Object.keys(record).length > Object.keys(best).length) best = record;
    }
  }
  return best;
}

function symbolParam(url: string) {
  try {
    return new URL(url).searchParams.get("symbols") ?? "";
  } catch {
    return "";
  }
}

async function yahooJson(url: string, kind: "spark" | "chart"): Promise<unknown | "blocked"> {
  const blockedUntil = kind === "spark" ? sparkBlockedUntil : chartBlockedUntil;
  if (Date.now() < blockedUntil) return "blocked";
  try {
    const response = await fetch(url, {
      headers: JSON_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 429) {
      const until = Date.now() + (kind === "spark" ? 10 : 2) * 60 * 1000;
      if (kind === "spark") sparkBlockedUntil = until;
      else chartBlockedUntil = until;
      console.warn(`Yahoo ${kind} feed is rate-limited; backing off`);
      return "blocked";
    }
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Yahoo JSON request failed", error);
    return null;
  }
}

function freshQuote(symbol: string) {
  const entry = quoteCache.get(symbol);
  if (!entry || entry.exp <= Date.now()) return null;
  return entry.value;
}

function rememberQuote(quote: Quote) {
  quoteCache.set(quote.symbol, { exp: Date.now() + QUOTE_TTL_MS, value: quote });
}

function downsample(values: number[], max: number) {
  if (values.length <= max) return values;
  const sampled: number[] = [];
  const step = (values.length - 1) / (max - 1);
  for (let index = 0; index < max; index += 1) {
    sampled.push(values[Math.round(index * step)] ?? values[values.length - 1]);
  }
  return sampled;
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function asRecord(value: unknown): YahooRecord {
  return value && typeof value === "object" ? (value as YahooRecord) : {};
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function mapPool<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  if (!items.length) return;
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      try {
        await task(current);
      } catch (error) {
        console.error("Quote fetch failed", error);
      }
    }
  });
  await Promise.all(workers);
}
