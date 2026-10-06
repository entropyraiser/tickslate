import type { Session, Tone } from "./types";

export function priceDigits(value: number, quoteType: string) {
  const abs = Math.abs(value);
  if (quoteType === "CURRENCY") return abs >= 20 ? 2 : 4;
  if (abs > 0 && abs < 1) return 4;
  return 2;
}

export function formatPrice(value: number, quoteType: string) {
  const digits = priceDigits(value, quoteType);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatSigned(value: number, digits: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value);
}

export function formatPercent(value: number) {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value);
  return `${formatted}%`;
}

export function formatAsOf(unix: number, timeZone: string) {
  return formatZoned(
    new Date(unix * 1000),
    timeZone,
    {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
  );
}

export function formatBarTime(
  unix: number,
  timeZone: string,
  intraday: boolean,
  gmtOffset: number,
) {
  if (!intraday) {
    const shifted = new Date((unix + gmtOffset) * 1000);
    return formatZoned(shifted, "UTC", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return formatZoned(new Date(unix * 1000), timeZone, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toneOf(change: number): Tone {
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
}

export const SESSION_LABEL: Record<Session, string> = {
  open: "Open",
  pre: "Pre-market",
  post: "After hours",
  closed: "Closed",
};

function formatZoned(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: timeZone || "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
}
