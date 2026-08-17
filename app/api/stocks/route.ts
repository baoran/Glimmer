type SinaQuote = {
  symbol?: string; code?: string; name?: string; trade?: string; pricechange?: number;
  changepercent?: number; open?: string; high?: string; low?: string; settlement?: string;
  volume?: number; amount?: number; turnoverratio?: number; per?: number; mktcap?: number; nmc?: number;
};

type StockQuote = {
  name: string; code: string; secid: string; price: number; change: number; changeAmount: number;
  volume: number; turnover: number; turnoverRate: number; volumeRatio: number; pe: number;
  high: number; low: number; open: number; previousClose: number; marketCap: number; floatMarketCap: number;
};

const SINA_API = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center";
const HEADERS = { Accept: "application/json,text/plain,*/*", Referer: "https://finance.sina.com.cn/stock/", "User-Agent": "Mozilla/5.0" };
const PAGE_SIZE = 100;
const PAGES_PER_BATCH = 10;

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function sinaJson<T>(url: string) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`Sina returned ${response.status}`);
  return response.json() as Promise<T>;
}

function mapStock(row: SinaQuote): StockQuote {
  return {
    name: String(row.name ?? "—"), code: String(row.code ?? ""), secid: String(row.symbol ?? ""),
    price: number(row.trade), change: number(row.changepercent), changeAmount: number(row.pricechange),
    volume: number(row.volume), turnover: number(row.amount), turnoverRate: number(row.turnoverratio),
    volumeRatio: 0, pe: number(row.per), high: number(row.high), low: number(row.low), open: number(row.open),
    previousClose: number(row.settlement), marketCap: number(row.mktcap) * 10000,
    floatMarketCap: number(row.nmc) * 10000,
  };
}

async function enrichVolumeRatio(stocks: StockQuote[]) {
  const ratioMap = new Map<string, number>();
  await Promise.all(chunks(stocks.map((stock) => stock.secid).filter(Boolean), 500).map(async (symbols) => {
    const response = await fetch(`https://qt.gtimg.cn/q=${symbols.join(",")}`, { headers: { ...HEADERS, Referer: "https://gu.qq.com/" } });
    if (!response.ok) return;
    const text = await response.text();
    for (const match of text.matchAll(/v_([a-z]{2}\d{6})="([^"]*)"/g)) ratioMap.set(match[1], number(match[2].split("~")[49]));
  }));
  return stocks.map((stock) => ({ ...stock, volumeRatio: ratioMap.get(stock.secid) ?? 0 }));
}

export async function GET(request: Request) {
  const requestedBatch = Math.max(0, Math.floor(number(new URL(request.url).searchParams.get("batch"))));
  try {
    const total = number(await sinaJson<string>(`${SINA_API}.getHQNodeStockCount?node=hs_a`));
    const pageCount = Math.ceil(total / PAGE_SIZE);
    const batchCount = Math.ceil(pageCount / PAGES_PER_BATCH);
    if (requestedBatch >= batchCount) return Response.json({ error: "Batch out of range" }, { status: 400 });

    const firstPage = requestedBatch * PAGES_PER_BATCH + 1;
    const lastPage = Math.min(pageCount, firstPage + PAGES_PER_BATCH - 1);
    const pageNumbers = Array.from({ length: lastPage - firstPage + 1 }, (_, index) => firstPage + index);
    const pages = await Promise.all(pageNumbers.map((page) => sinaJson<SinaQuote[]>(`${SINA_API}.getHQNodeData?page=${page}&num=${PAGE_SIZE}&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page`)));
    const items = await enrichVolumeRatio(pages.flat().map(mapStock).filter((stock) => stock.secid));

    return Response.json({ items, total, batch: requestedBatch, batchCount }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch {
    return Response.json({ items: [], total: 0, batch: requestedBatch, batchCount: 0, error: "A股行情暂时不可用" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
