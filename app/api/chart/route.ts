import { FeedError, getChart, isRangeId } from "@/lib/yahoo";
import { isSymbol, normalizeSymbol } from "@/lib/symbols";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol") ?? "");
  const range = url.searchParams.get("range") ?? "";

  if (!isSymbol(symbol) || !isRangeId(range)) {
    return Response.json({ error: "Unknown symbol or range." }, { status: 400 });
  }

  try {
    const chart = await getChart(symbol, range);
    return Response.json(chart, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof FeedError
        ? error.message
        : "The chart couldn’t be loaded.";
    return Response.json({ error: message }, { status: 503 });
  }
}
