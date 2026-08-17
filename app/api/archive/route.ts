import { env } from "cloudflare:workers";

type NewsItem = { id: string; title: string; source: string; category: string; url: string; publishedAt: string; heat: number };
type StoredSnapshot = { tradeDate?: string; generatedAt?: string; news?: NewsItem[] };

export async function GET() {
  try {
    if (!env.DB) throw new Error("D1 binding unavailable");
    const result = await env.DB.prepare("SELECT trade_date AS tradeDate, payload FROM daily_snapshots ORDER BY trade_date DESC LIMIT 30").all<{ tradeDate: string; payload: string }>();
    const days = (result.results ?? []).flatMap((row) => {
      try {
        const payload = JSON.parse(row.payload) as StoredSnapshot;
        return [{ tradeDate: row.tradeDate, generatedAt: payload.generatedAt ?? "", news: payload.news ?? [] }];
      } catch {
        return [];
      }
    });
    return Response.json({ days }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch {
    return Response.json({ days: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
