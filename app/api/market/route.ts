type SinaQuote = {
  symbol?: string; code?: string; name?: string; trade?: string; pricechange?: number;
  changepercent?: number; open?: string; high?: string; low?: string; settlement?: string;
  volume?: number; amount?: number; turnoverratio?: number; per?: number; mktcap?: number; nmc?: number;
};

const SINA_API = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center";
const REQUEST_HEADERS = { Accept: "application/json,text/plain,*/*", Referer: "https://finance.sina.com.cn/stock/", "User-Agent": "Mozilla/5.0" };
const indexSymbols = [
  { symbol: "sh000001", name: "上证指数", code: "000001" },
  { symbol: "sz399001", name: "深证成指", code: "399001" },
  { symbol: "sz399006", name: "创业板指", code: "399006" },
  { symbol: "sh000300", name: "沪深300", code: "000300" },
  { symbol: "sh000688", name: "科创50", code: "000688" },
];

const fallbackIndices = [
  { name: "上证指数", code: "000001", secid: "sh000001", price: 3982.65, change: 1.41, changeAmount: 55.47, high: 3983.51, low: 3924.47, open: 3930.1, previousClose: 3927.18, volume: 706246394459 },
  { name: "深证成指", code: "399001", secid: "sz399001", price: 14704.27, change: 2.44, changeAmount: 349.96, high: 14704.55, low: 14348.47, open: 14399.2, previousClose: 14354.31, volume: 465109058625 },
  { name: "创业板指", code: "399006", secid: "sz399006", price: 3246.8, change: 3.07, changeAmount: 96.66, high: 3249.2, low: 3138.5, open: 3155.1, previousClose: 3150.14, volume: 208700000000 },
];

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapStock(row: SinaQuote) {
  const symbol = String(row.symbol ?? "");
  return {
    name: String(row.name ?? "—"), code: String(row.code ?? ""), secid: symbol,
    price: number(row.trade), change: number(row.changepercent), changeAmount: number(row.pricechange),
    volume: number(row.volume), turnover: number(row.amount), turnoverRate: number(row.turnoverratio),
    pe: number(row.per), high: number(row.high), low: number(row.low), open: number(row.open),
    previousClose: number(row.settlement), marketCap: number(row.mktcap) * 10000,
    floatMarketCap: number(row.nmc) * 10000,
  };
}

async function sinaJson<T>(url: string) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`Sina returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function ranking(ascending: 0 | 1, node = "hs_a", count = 10) {
  return sinaJson<SinaQuote[]>(`${SINA_API}.getHQNodeData?page=1&num=${count}&sort=changepercent&asc=${ascending}&node=${node}&symbol=&_s_r_a=page`);
}

async function indices() {
  const response = await fetch(`https://qt.gtimg.cn/q=${indexSymbols.map((item) => item.symbol).join(",")}`, { headers: { ...REQUEST_HEADERS, Referer: "https://gu.qq.com/" } });
  if (!response.ok) throw new Error("Index feed unavailable");
  const text = await response.text();
  return indexSymbols.flatMap((item) => {
    const raw = text.match(new RegExp(`v_${item.symbol}="([^"]*)"`))?.[1];
    if (!raw) return [];
    const fields = raw.split("~");
    return [{
      name: item.name, code: item.code, secid: item.symbol,
      price: number(fields[3]), changeAmount: number(fields[31]), change: number(fields[32]),
      volume: number(fields[37]) * 10000, high: number(fields[33]), low: number(fields[34]),
      open: number(fields[5]), previousClose: number(fields[4]),
    }];
  });
}

export async function GET() {
  try {
    const [indexRows, leaders, laggards, sectorRows, total] = await Promise.all([
      indices(), ranking(0), ranking(1), ranking(0, "hs_s", 6),
      sinaJson<string>(`${SINA_API}.getHQNodeStockCount?node=hs_a`),
    ]);
    return Response.json({
      indices: indexRows.length ? indexRows : fallbackIndices,
      leaders: leaders.map(mapStock), laggards: laggards.map(mapStock),
      sectors: sectorRows.map((row) => ({ name: String(row.name ?? "—"), code: String(row.code ?? ""), price: number(row.trade), change: number(row.changepercent), netFlow: 0 })),
      totalStocks: number(total), updatedAt: new Date().toISOString(), stale: false,
    }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ indices: fallbackIndices, leaders: [], laggards: [], sectors: [], totalStocks: 0, updatedAt: new Date().toISOString(), stale: true }, { headers: { "Cache-Control": "public, max-age=30" } });
  }
}
