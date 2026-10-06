"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Point, Tone } from "@/lib/types";

type Props = {
  series: Point[];
  intraday: boolean;
  timezone: string;
  gmtOffset: number;
  previousClose: number | null;
  tone: Tone;
  precision: number;
  theme: "dark" | "light";
  onHover: (point: { label: string; value: number } | null) => void;
};

export function PriceChart({
  series,
  intraday,
  timezone,
  gmtOffset,
  previousClose,
  tone,
  precision,
  theme,
  onHover,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const lineRef = useRef<IPriceLine | null>(null);
  const hoverRef = useRef(onHover);
  const formatRef = useRef<(time: Time) => string>(() => "");

  useEffect(() => {
    hoverRef.current = onHover;
    formatRef.current = (time) => labelForTime(time, timezone, intraday);
  }, [onHover, timezone, intraday]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const styles = getComputedStyle(document.documentElement);
    const read = (name: string) => styles.getPropertyValue(name).trim();
    const up = read("--up");
    const down = read("--down");
    const faint = read("--faint");
    const line = tone === "up" ? up : tone === "down" ? down : faint;
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: read("--bg-raise") },
        textColor: read("--muted"),
        fontFamily: read("--font-geist-sans") || "sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: read("--chart-grid") },
      },
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { visible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: read("--faint"), labelBackgroundColor: read("--text") },
        horzLine: { color: read("--faint"), labelBackgroundColor: read("--text") },
      },
      handleScroll: { vertTouchDrag: false },
    });
    const area = chart.addSeries(AreaSeries, {
      lineColor: line,
      topColor: colorWithAlpha(line, 0.28),
      bottomColor: colorWithAlpha(line, 0.02),
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: read("--bg-raise"),
      crosshairMarkerBackgroundColor: line,
    });
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        hoverRef.current(null);
        return;
      }
      const bar = param.seriesData.get(area);
      if (!bar || !("value" in bar) || typeof bar.value !== "number") {
        hoverRef.current(null);
        return;
      }
      hoverRef.current({ label: formatRef.current(param.time), value: bar.value });
    });

    chartRef.current = chart;
    seriesRef.current = area;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lineRef.current = null;
    };
  }, [theme, tone]);

  useEffect(() => {
    const chart = chartRef.current;
    const area = seriesRef.current;
    if (!chart || !area) return;

    const data = toLineData(series, intraday, gmtOffset);
    area.applyOptions({
      priceFormat: {
        type: "price",
        precision,
        minMove: precision >= 4 ? 0.0001 : 0.01,
      },
    });
    area.setData(data);
    if (lineRef.current) {
      area.removePriceLine(lineRef.current);
      lineRef.current = null;
    }
    if (previousClose != null && intraday && data.length) {
      const styles = getComputedStyle(document.documentElement);
      lineRef.current = area.createPriceLine({
        price: previousClose,
        color: styles.getPropertyValue("--faint").trim(),
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    }
    chart.applyOptions({
      localization: {
        timeFormatter: (time: Time) => formatRef.current(time),
      },
      timeScale: {
        timeVisible: intraday,
        secondsVisible: false,
        tickMarkFormatter: (time: Time, type: TickMarkType) =>
          tickLabel(time, type, intraday, timezone),
      },
    });
    if (data.length) chart.timeScale().fitContent();
  }, [series, intraday, gmtOffset, timezone, previousClose, precision, theme, tone]);

  return <div ref={containerRef} className="chart" />;
}

function toLineData(series: Point[], intraday: boolean, gmtOffset: number): LineData[] {
  const data: LineData[] = [];
  let previous = "";
  for (const point of series) {
    const time = intraday ? (point.time as UTCTimestamp) : businessDay(point.time, gmtOffset);
    const key = String(time);
    if (key === previous) {
      data[data.length - 1] = { time, value: point.value };
      continue;
    }
    data.push({ time, value: point.value });
    previous = key;
  }
  return data;
}

function businessDay(unix: number, gmtOffset: number) {
  const shifted = new Date((unix + gmtOffset) * 1000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

function labelForTime(time: Time, timezone: string, intraday: boolean) {
  const parts = timeParts(time, intraday ? timezone : "UTC");
  if (!parts) return "";
  if (typeof time === "number") return `${parts.month} ${parts.day}, ${parts.hm}`;
  return `${parts.month} ${parts.day}, ${parts.year}`;
}

function tickLabel(time: Time, type: TickMarkType, intraday: boolean, timezone: string) {
  const parts = timeParts(time, typeof time === "number" && intraday ? timezone : "UTC");
  if (!parts) return "";
  if (type === TickMarkType.Year) return parts.year;
  if (type === TickMarkType.Month) return parts.month;
  if (type === TickMarkType.DayOfMonth) return `${parts.month} ${parts.day}`;
  return parts.hm;
}

function timeParts(time: Time, timeZone: string) {
  const date = timeToDate(time);
  if (!date) return null;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    return {
      year: parts.year ?? "",
      month: parts.month ?? "",
      day: parts.day ?? "",
      hm: `${parts.hour ?? ""}:${parts.minute ?? ""}`,
    };
  } catch {
    return null;
  }
}

function timeToDate(time: Time) {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") {
    const [year, month, day] = time.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

function colorWithAlpha(color: string, alpha: number) {
  const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (match) return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
  const hex = color.replace("#", "");
  if (hex.length !== 6) return color;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
