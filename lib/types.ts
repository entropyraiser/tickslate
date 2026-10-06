export type GroupId =
  | "us-indices"
  | "us-stocks"
  | "energy"
  | "india"
  | "global"
  | "fx"
  | "crypto";

export type Session = "open" | "pre" | "post" | "closed";

export type Tone = "up" | "down" | "flat";

export type RangeId = "1d" | "5d" | "1mo" | "6mo" | "ytd" | "1y" | "5y";

export type Point = {
  time: number;
  value: number;
};

export type Quote = {
  symbol: string;
  name: string;
  quoteType: string;
  exchange: string;
  currency: string;
  timezone: string;
  gmtOffset: number;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number | null;
  session: Session;
  delayedMinutes: number;
  asOf: number | null;
  spark: number[];
  series: Point[];
};

export type ChartSeries = {
  symbol: string;
  range: RangeId;
  intraday: boolean;
  timezone: string;
  gmtOffset: number;
  previousClose: number | null;
  series: Point[];
};
