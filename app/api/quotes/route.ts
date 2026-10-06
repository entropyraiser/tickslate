import { getQuotes } from "@/lib/yahoo";
import { isSymbol, normalizeSymbol } from "@/lib/symbols";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("symbols") ?? "";
  const symbols = [
    ...new Set(
      raw
        .split(",")
        .map(normalizeSymbol)
        .filter(isSymbol),
    ),
  ].slice(0, 40);

  if (!symbols.length) {
    return Response.json({ quotes: [], missing: [] });
  }

  const quotes = await getQuotes(symbols);
  const found = new Set(quotes.map((quote) => quote.symbol));
  const missing = symbols.filter((symbol) => !found.has(symbol));

  return Response.json(
    { quotes, missing },
    { headers: { "Cache-Control": "no-store" } },
  );
}
