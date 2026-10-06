"use client";

import { useEffect, useRef, useState } from "react";
import { formatPercent, formatPrice, toneOf } from "@/lib/format";
import { GROUPS, catalogItem, groupOf } from "@/lib/symbols";
import type { Quote } from "@/lib/types";
import { Sparkline } from "./Sparkline";

type Props = {
  symbols: string[];
  quotes: Record<string, Quote>;
  missing: ReadonlySet<string>;
  selected: string | null;
  status: string | null;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onReset: () => void;
};

export function Watchlist({
  symbols,
  quotes,
  missing,
  selected,
  status,
  onSelect,
  onRemove,
  onReset,
}: Props) {
  const grouped = GROUPS.map((group) => ({
    ...group,
    symbols: symbols.filter((symbol) => groupOf(symbol, quotes[symbol]?.quoteType) === group.id),
  })).filter((group) => group.symbols.length > 0);

  return (
    <aside className="list">
      {status ? <p className="list-status">{status}</p> : null}
      {grouped.map((group) => (
        <section key={group.id}>
          <h2 className="group-label">
            {group.label}
            <span>{group.symbols.length}</span>
          </h2>
          {group.symbols.map((symbol) => (
            <QuoteRow
              key={symbol}
              symbol={symbol}
              quote={quotes[symbol]}
              missing={missing.has(symbol)}
              active={symbol === selected}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
        </section>
      ))}
      {!symbols.length ? (
        <p className="empty">Your list is empty.</p>
      ) : null}
      <button type="button" className="text-btn reset" onClick={onReset}>
        Restore default list
      </button>
      <p className="footnote">Prices from Yahoo Finance. Equity quotes are often delayed.</p>
    </aside>
  );
}

function QuoteRow({
  symbol,
  quote,
  missing,
  active,
  onSelect,
  onRemove,
}: {
  symbol: string;
  quote?: Quote;
  missing: boolean;
  active: boolean;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}) {
  const price = quote?.price;
  const previous = useRef(price);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const known = catalogItem(symbol);
  const equity = quote?.quoteType === "EQUITY";
  const name = quote?.name ?? known?.name ?? symbol;
  const primary = equity ? symbol : name;
  const secondary = equity ? name : symbol;
  const tone = quote ? toneOf(quote.change) : "flat";

  useEffect(() => {
    if (price == null || previous.current == null || price === previous.current) {
      previous.current = price;
      return;
    }
    setFlash(price > previous.current ? "up" : "down");
    previous.current = price;
    const timeout = window.setTimeout(() => setFlash(null), 700);
    return () => window.clearTimeout(timeout);
  }, [price]);

  return (
    <div
      className="row"
      data-active={active}
      data-flash={flash ?? undefined}
      data-symbol={symbol}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(symbol)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(symbol);
        }
      }}
    >
      <div className="row-name">
        <span className="primary" title={primary}>
          {primary}
        </span>
        <span className="secondary" title={secondary}>
          {missing ? "Unavailable" : secondary}
        </span>
      </div>
      {quote ? <Sparkline values={quote.spark} tone={tone} /> : <span className="spark-slot" />}
      <div className="row-price">
        {quote ? (
          <span className="num price">{formatPrice(quote.price, quote.quoteType)}</span>
        ) : (
          <span className={missing ? "num price" : "pending"}>{missing ? "—" : ""}</span>
        )}
        <span className="num change" data-tone={quote ? tone : "flat"}>
          {quote ? formatPercent(quote.changePercent) : ""}
        </span>
      </div>
      <button
        type="button"
        className="remove"
        aria-label={`Remove ${symbol}`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove(symbol);
        }}
      >
        ×
      </button>
    </div>
  );
}
