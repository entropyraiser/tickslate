"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SESSION_LABEL,
  formatAsOf,
  formatBarTime,
  formatPercent,
  formatPrice,
  formatSigned,
  priceDigits,
  toneOf,
} from "@/lib/format";
import {
  DEFAULT_SYMBOLS,
  GROUPS,
  catalogItem,
  groupOf,
  isSymbol,
  normalizeSymbol,
  searchCatalog,
} from "@/lib/symbols";
import type { ChartSeries, Quote, RangeId } from "@/lib/types";
import { MarketClocks } from "./MarketClocks";
import { Watchlist } from "./Watchlist";

const PriceChart = dynamic(
  () => import("./PriceChart").then((mod) => mod.PriceChart),
  { ssr: false },
);

const SYMBOLS_KEY = "tickslate.symbols.v1";
const THEME_KEY = "tickslate.theme";
const SELECTED_KEY = "tickslate.selected";
const REFRESH_MS = 45_000;

const RANGES: { id: RangeId; label: string }[] = [
  { id: "1d", label: "1D" },
  { id: "5d", label: "5D" },
  { id: "1mo", label: "1M" },
  { id: "6mo", label: "6M" },
  { id: "ytd", label: "YTD" },
  { id: "1y", label: "1Y" },
  { id: "5y", label: "5Y" },
];

type ChartResult = {
  symbol: string;
  range: RangeId;
  data?: ChartSeries;
  error?: string;
};

function loadSymbols() {
  try {
    const stored = window.localStorage.getItem(SYMBOLS_KEY);
    if (!stored) return DEFAULT_SYMBOLS;
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_SYMBOLS;
    const next = parsed.map(String).map(normalizeSymbol).filter(isSymbol);
    return next.length ? next : DEFAULT_SYMBOLS;
  } catch {
    return DEFAULT_SYMBOLS;
  }
}

export function Dashboard() {
  const [symbols, setSymbols] = useState(loadSymbols);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(() => window.sessionStorage.getItem(SELECTED_KEY));
  const [range, setRange] = useState<RangeId>("1d");
  const [chartResult, setChartResult] = useState<ChartResult | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [hover, setHover] = useState<{ label: string; value: number } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  const searchRef = useRef<HTMLDivElement>(null);
  const refreshGen = useRef(0);

  useEffect(() => {
    window.localStorage.setItem(SYMBOLS_KEY, JSON.stringify(symbols));
  }, [symbols]);

  const refresh = useCallback(async (list: string[]) => {
    if (!list.length) return;
    const generation = ++refreshGen.current;
    setRefreshing(true);
    setListError(null);
    const chunks: string[][] = [];
    for (let index = 0; index < list.length; index += 6) {
      chunks.push(list.slice(index, index + 6));
    }
    let failed = false;
    try {
      for (let index = 0; index < chunks.length; index += 2) {
        if (generation !== refreshGen.current) return;
        await Promise.all(
          chunks.slice(index, index + 2).map(async (part) => {
            const response = await fetch(
              `/api/quotes?symbols=${encodeURIComponent(part.join(","))}`,
            );
            if (!response.ok) throw new Error("quotes failed");
            const data = (await response.json()) as { quotes: Quote[]; missing: string[] };
            if (generation !== refreshGen.current) return;
            setQuotes((current) => {
              const next = { ...current };
              for (const quote of data.quotes) next[quote.symbol] = quote;
              return next;
            });
            setMissing((current) => {
              const next = new Set(current);
              for (const quote of data.quotes) next.delete(quote.symbol);
              for (const symbol of data.missing) next.add(symbol);
              return next;
            });
          }),
        );
      }
    } catch {
      failed = true;
    } finally {
      if (generation === refreshGen.current) {
        setRefreshing(false);
        if (failed) setListError("Some prices didn’t load. They’ll retry shortly.");
      }
    }
  }, []);

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void refresh(symbols);
    }, 0);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(symbols);
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(symbols);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [symbols, refresh]);

  const active = symbols.includes(selected ?? "") ? selected : (symbols[0] ?? null);
  const quote = active ? quotes[active] : undefined;

  useEffect(() => {
    if (active) window.sessionStorage.setItem(SELECTED_KEY, active);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    document.querySelector(`[data-symbol="${CSS.escape(active)}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [active]);

  useEffect(() => {
    if (!active || range === "1d") return;
    const controller = new AbortController();
    const symbol = active;
    const requested = range;
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${requested}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as ChartSeries & { error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setChartResult({
            symbol,
            range: requested,
            error: data.error || "The chart couldn’t be loaded.",
          });
          return;
        }
        setChartResult({ symbol, range: requested, data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setChartResult({
          symbol,
          range: requested,
          error: error instanceof Error ? error.message : "The chart couldn’t be loaded.",
        });
      });
    return () => controller.abort();
  }, [active, range]);

  useEffect(() => {
    const quoteName = quote?.name;
    const price = quote ? formatPrice(quote.price, quote.quoteType) : null;
    document.title = quoteName && price ? `${quoteName} ${price} · Tickslate` : "Tickslate";
  }, [quote]);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.querySelector("input")?.focus();
        setSearchOpen(true);
      }
      if (!symbols || !active) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const order = GROUPS.flatMap((group) =>
        symbols.filter((symbol) => groupOf(symbol, quotes[symbol]?.quoteType) === group.id),
      );
      const index = order.indexOf(active);
      const next = order[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        setHover(null);
        setSelected(next);
      }
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [symbols, quotes, active]);

  const results = useMemo(() => searchCatalog(query), [query]);
  const typed = normalizeSymbol(query);
  const canAddExact = isSymbol(typed) && !results.some((item) => item.symbol === typed);
  const choices = [
    ...results.map((item) => item.symbol),
    ...(canAddExact ? [typed] : []),
  ];

  function addSymbol(symbol: string) {
    const next = normalizeSymbol(symbol);
    if (!isSymbol(next)) return;
    setSymbols((current) => (current.includes(next) ? current : [next, ...current]));
    setHover(null);
    setSelected(next);
    setQuery("");
    setSearchOpen(false);
    setHighlight(0);
  }

  function removeSymbol(symbol: string) {
    setHover(null);
    setSymbols((current) => current.filter((item) => item !== symbol));
    setQuotes((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    setMissing((current) => {
      const next = new Set(current);
      next.delete(symbol);
      return next;
    });
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  }

  const ready = symbols.filter((symbol) => quotes[symbol] || missing.has(symbol)).length;
  const status = listError
    ? listError
    : ready < symbols.length
      ? `Loading ${ready} of ${symbols.length}`
      : null;

  const chartMatch =
    chartResult && active && chartResult.symbol === active && chartResult.range === range
      ? chartResult
      : null;
  const chart = chartMatch?.data;
  const chartError = chartMatch?.error;
  const chartLoading = range !== "1d" && !chart && !chartError;

  const equity = quote?.quoteType === "EQUITY";
  const friendly = quote?.name ?? (active ? catalogItem(active)?.name : undefined) ?? active;
  const primary = equity && active ? active : friendly;
  const secondary = equity ? friendly : active;
  const tone = quote ? toneOf(quote.change) : "flat";
  const digits = quote ? priceDigits(quote.price, quote.quoteType) : 2;

  const shownSeries = range === "1d" ? (quote?.series ?? []) : (chart?.series ?? []);
  const intraday = range === "1d" ? true : (chart?.intraday ?? false);
  const timezone = range === "1d" ? (quote?.timezone ?? "UTC") : (chart?.timezone ?? quote?.timezone ?? "UTC");
  const gmtOffset = range === "1d" ? (quote?.gmtOffset ?? 0) : (chart?.gmtOffset ?? 0);
  const last = shownSeries[shownSeries.length - 1];
  const periodTone =
    range === "1d" || !shownSeries.length
      ? tone
      : toneOf(shownSeries[shownSeries.length - 1].value - shownSeries[0].value);
  const readout = hover
    ? `${hover.label} · ${formatPrice(hover.value, quote?.quoteType ?? "")}`
    : last
      ? `${formatBarTime(last.time, timezone, intraday, gmtOffset)} · ${formatPrice(last.value, quote?.quoteType ?? "")}`
      : "";

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M3 15.5 8 10l3.2 3.2L21 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="wordmark">Tickslate</span>
        </div>
        <MarketClocks />
        <div className="header-actions">
          <div className="search" ref={searchRef}>
            <input
              value={query}
              placeholder="Add a ticker"
              aria-label="Add a ticker"
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
                setHighlight(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchOpen(false);
                  event.currentTarget.blur();
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setSearchOpen(true);
                  setHighlight((current) => {
                    if (!choices.length) return 0;
                    const delta = event.key === "ArrowDown" ? 1 : -1;
                    return (current + delta + choices.length) % choices.length;
                  });
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const choice = choices[highlight] ?? choices[0];
                  if (choice) addSymbol(choice);
                }
              }}
            />
            {searchOpen && query.trim() ? (
              <div className="results" role="listbox">
                {results.map((item, index) => (
                  <button
                    type="button"
                    key={item.symbol}
                    data-active={index === highlight}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => addSymbol(item.symbol)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <em>{item.symbol}</em>
                    </span>
                    <span className="result-group">
                      {GROUPS.find((group) => group.id === item.group)?.label}
                    </span>
                  </button>
                ))}
                {canAddExact ? (
                  <button
                    type="button"
                    data-active={highlight === results.length}
                    onMouseEnter={() => setHighlight(results.length)}
                    onClick={() => addSymbol(typed)}
                  >
                    <span>
                      <strong>Add {typed}</strong>
                      <em>Look up this symbol</em>
                    </span>
                  </button>
                ) : null}
                {!results.length && !canAddExact ? <p className="no-results">No matches</p> : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn"
            data-busy={refreshing}
            aria-label="Refresh prices"
            onClick={() => void refresh(symbols)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6M20 5v5h-5M4 19v-5h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className="icon-btn" aria-label="Toggle color theme" onClick={toggleTheme}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <main className="detail">
          {active ? (
            <>
              <div className="detail-top">
                <div>
                  <p className="eyebrow">{secondary}</p>
                  <h1>{primary}</h1>
                  <p className="meta">
                    {[quote?.exchange, quote?.currency].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button type="button" className="text-btn" onClick={() => removeSymbol(active)}>
                  Remove
                </button>
              </div>
              <div className="quote-line">
                <p className="big num">
                  {quote ? formatPrice(quote.price, quote.quoteType) : missing.has(active) ? "—" : ""}
                </p>
                {quote ? (
                  <p className="delta num" data-tone={tone}>
                    <span>{formatSigned(quote.change, digits)}</span>
                    <span>{formatPercent(quote.changePercent)}</span>
                  </p>
                ) : null}
                {quote ? (
                  <span className="pill" data-session={quote.session}>
                    {SESSION_LABEL[quote.session]}
                  </span>
                ) : null}
                {quote && quote.delayedMinutes > 0 ? (
                  <span className="delay">{quote.delayedMinutes}m delayed</span>
                ) : null}
              </div>
              <p className="asof">
                {quote?.asOf ? `As of ${formatAsOf(quote.asOf, quote.timezone)}` : quote ? "" : "Fetching price"}
              </p>
              <div className="ranges" role="tablist" aria-label="Chart range">
                {RANGES.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    data-active={item.id === range}
                    onClick={() => {
                      setHover(null);
                      setRange(item.id);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="readout num">{readout}</p>
              <div className="chart-wrap">
                {range === "1d" && quote && quote.series.length ? (
                  <PriceChart
                    series={quote.series}
                    intraday
                    timezone={quote.timezone}
                    gmtOffset={quote.gmtOffset}
                    previousClose={quote.previousClose}
                    tone={tone}
                    precision={digits}
                    theme={theme}
                    onHover={setHover}
                  />
                ) : null}
                {range !== "1d" && chart && !chartLoading && !chartError ? (
                  <PriceChart
                    series={chart.series}
                    intraday={chart.intraday}
                    timezone={chart.timezone}
                    gmtOffset={chart.gmtOffset}
                    previousClose={null}
                    tone={periodTone}
                    precision={digits}
                    theme={theme}
                    onHover={setHover}
                  />
                ) : null}
                {(chartLoading || (range === "1d" && !quote && !missing.has(active))) && (
                  <div className="chart-skeleton" />
                )}
                {chartError ? <p className="chart-msg">{chartError}</p> : null}
                {range === "1d" && quote && !quote.series.length ? (
                  <p className="chart-msg">No prices in this session yet.</p>
                ) : null}
                {range === "1d" && missing.has(active) ? (
                  <p className="chart-msg">This ticker didn’t return a price.</p>
                ) : null}
              </div>
              <a
                className="chart-credit"
                href="https://www.tradingview.com/"
                target="_blank"
                rel="noreferrer"
              >
                Charts by TradingView
              </a>
            </>
          ) : (
            <p className="chart-msg">Add a ticker to start the tape.</p>
          )}
        </main>
        <Watchlist
          symbols={symbols}
          quotes={quotes}
          missing={missing}
          selected={active}
          status={status}
          onSelect={(symbol) => {
            setHover(null);
            setSelected(symbol);
          }}
          onRemove={removeSymbol}
          onReset={() => setSymbols(DEFAULT_SYMBOLS)}
        />
      </div>
    </div>
  );
}
