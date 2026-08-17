type TencentKline = { data?: Record<string, { qfqday?: string[][]; day?: string[][] }> };

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const secid = new URL(request.url).searchParams.get("secid") ?? "";
  if (!/^(sh|sz|bj)\d{6}$/.test(secid)) return Response.json({ error: "Invalid stock symbol" }, { status: 400 });
  try {
    const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${secid},day,,,60,qfq`, { headers: { Referer: "https://gu.qq.com/", "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error("History unavailable");
    const payload = await response.json() as TencentKline;
    const rows = payload.data?.[secid]?.qfqday ?? payload.data?.[secid]?.day ?? [];
    const items = rows.map((row, index) => {
      const previousClose = index ? number(rows[index - 1]?.[2]) : number(row[1]);
      const close = number(row[2]);
      return {
        date: row[0], open: number(row[1]), close, high: number(row[3]), low: number(row[4]), volume: number(row[5]),
        change: previousClose ? (close - previousClose) / previousClose * 100 : 0,
      };
    }).reverse();
    return Response.json({ secid, items }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch {
    return Response.json({ secid, items: [], error: "历史行情暂时不可用" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
