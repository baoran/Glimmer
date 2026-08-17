function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("secids") ?? "";
  const symbols = raw.split(",").filter((item) => /^(sh|sz|bj)\d{6}$/.test(item)).slice(0, 20);
  if (!symbols.length) return Response.json({ items: [] });
  try {
    const response = await fetch(`https://qt.gtimg.cn/q=${symbols.join(",")}`, { headers: { Referer: "https://gu.qq.com/", "User-Agent": "Mozilla/5.0" } });
    const text = await response.text();
    const items = [...text.matchAll(/v_([a-z]{2}\d{6})="([^"]*)"/g)].map((match) => {
      const fields = match[2].split("~");
      return { name: String(fields[1] ?? "—"), code: String(fields[2] ?? ""), secid: match[1], price: number(fields[3]), change: number(fields[32]), changeAmount: number(fields[31]), high: number(fields[33]), low: number(fields[34]), turnover: number(fields[37]) * 10000, turnoverRate: number(fields[38]), pe: number(fields[39]) };
    });
    return Response.json({ items, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return Response.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
