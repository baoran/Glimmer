type Hint = { symbol: string; code: string; name: string };

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quoteMap(text: string) {
  const map = new Map<string, string[]>();
  for (const match of text.matchAll(/v_([a-z]{2}\d{6})="([^"]*)"/g)) map.set(match[1], match[2].split("~"));
  return map;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 16) ?? "";
  if (!query) return Response.json({ items: [] });
  try {
    const suggestResponse = await fetch(`https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(query)}&t=all`, { headers: { Referer: "https://gu.qq.com/", "User-Agent": "Mozilla/5.0" } });
    const suggestText = await suggestResponse.text();
    const encoded = suggestText.match(/v_hint=("[\s\S]*");?\s*$/)?.[1] ?? '""';
    const decoded = JSON.parse(encoded) as string;
    const hints: Hint[] = decoded.split("^").map((row) => row.split("~")).filter((fields) => fields[4] === "GP-A" && /^(sh|sz|bj)$/.test(fields[0])).slice(0, 6).map((fields) => ({ symbol: `${fields[0]}${fields[1]}`, code: fields[1], name: fields[2] }));
    if (!hints.length) return Response.json({ items: [] });
    const quoteResponse = await fetch(`https://qt.gtimg.cn/q=${hints.map((item) => item.symbol).join(",")}`, { headers: { Referer: "https://gu.qq.com/", "User-Agent": "Mozilla/5.0" } });
    const quotes = quoteMap(await quoteResponse.text());
    const items = hints.map((hint) => {
      const fields = quotes.get(hint.symbol) ?? [];
      return { name: hint.name, code: hint.code, secid: hint.symbol, price: number(fields[3]), change: number(fields[32]), changeAmount: number(fields[31]), high: number(fields[33]), low: number(fields[34]), turnover: number(fields[37]) * 10000, turnoverRate: number(fields[38]), pe: number(fields[39]) };
    });
    return Response.json({ items }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return Response.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
