"use client";

import { useEffect, useState } from "react";

const CLOCKS = [
  { city: "New York", timeZone: "America/New_York", open: 9 * 60 + 30, close: 16 * 60 },
  { city: "London", timeZone: "Europe/London", open: 8 * 60, close: 16 * 60 + 30 },
  { city: "Mumbai", timeZone: "Asia/Kolkata", open: 9 * 60 + 15, close: 15 * 60 + 30 },
  { city: "Tokyo", timeZone: "Asia/Tokyo", open: 9 * 60, close: 15 * 60 },
];

export function MarketClocks() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="clocks">
      {CLOCKS.map((clock) => {
        const open = sessionOpen(now, clock.timeZone, clock.open, clock.close);
        const time = new Intl.DateTimeFormat("en-GB", {
          timeZone: clock.timeZone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(now);
        return (
          <div className="clock" key={clock.city} title={open ? "Regular session" : "Session closed"}>
            <span className="session-dot" data-open={open} />
            <span className="clock-city">{clock.city}</span>
            <span className="clock-time num">{time}</span>
          </div>
        );
      })}
    </div>
  );
}

function sessionOpen(now: Date, timeZone: string, open: number, close: number) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(now)
        .map((part) => [part.type, part.value]),
    );
    if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const minutes = (hour === 24 ? 0 : hour) * 60 + minute;
    return minutes >= open && minutes < close;
  } catch {
    return false;
  }
}
