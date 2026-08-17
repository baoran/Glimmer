import { env } from "cloudflare:workers";

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

type IndexQuote = {
  name: string; code: string; secid: string; price: number; change: number; changeAmount: number;
  high: number; low: number; open: number; previousClose: number; volume: number;
};

type SinaTag = { id?: string; name?: string };
type SinaFeed = {
  id?: number; rich_text?: string; create_time?: string; ext?: string; tag?: SinaTag[];
  like_nums?: number; comment_list?: { list?: unknown[] };
};

type Recommendation = StockQuote & {
  score: number; style: string; reasons: string[]; risks: string[];
};

type DailySnapshot = {
  tradeDate: string; generatedAt: string; nextRefreshAt: string; status: "final" | "provisional";
  indices: IndexQuote[]; sectors: Array<{ name: string; code: string; price: number; change: number }>;
  totalStocks: number; universe: StockQuote[]; recommendations: Recommendation[];
  news: Array<{ id: string; title: string; source: string; category: string; url: string; publishedAt: string; heat: number }>;
  summary: { averageIndexChange: number; positiveIndices: number; topSector: string; sampleSize: number };
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

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function sinaJson<T>(url: string) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`Sina returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function ranking(sort: string, ascending: 0 | 1, count = 100, node = "hs_a") {
  return sinaJson<SinaQuote[]>(`${SINA_API}.getHQNodeData?page=1&num=${count}&sort=${sort}&asc=${ascending}&node=${node}&symbol=&_s_r_a=page`);
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
  await Promise.all(chunk(stocks.map((stock) => stock.secid).filter(Boolean), 50).map(async (symbols) => {
    const response = await fetch(`https://qt.gtimg.cn/q=${symbols.join(",")}`, { headers: { ...REQUEST_HEADERS, Referer: "https://gu.qq.com/" } });
    if (!response.ok) return;
    const text = await response.text();
    for (const match of text.matchAll(/v_([a-z]{2}\d{6})="([^"]*)"/g)) {
      ratioMap.set(match[1], number(match[2].split("~")[49]));
    }
  }));
  return stocks.map((stock) => ({ ...stock, volumeRatio: ratioMap.get(stock.secid) ?? 0 }));
}

async function fetchUniverse() {
  const lists = await Promise.all([
    ranking("changepercent", 0), ranking("turnoverratio", 0), ranking("volume_ratio", 0),
    ranking("amount", 0), ranking("mktcap", 0), ranking("per", 1),
  ]);
  const merged = new Map<string, StockQuote>();
  for (const row of lists.flat()) {
    const stock = mapStock(row);
    if (stock.secid && !merged.has(stock.secid)) merged.set(stock.secid, stock);
  }
  return enrichVolumeRatio([...merged.values()]);
}

async function fetchIndices() {
  const response = await fetch(`https://qt.gtimg.cn/q=${indexSymbols.map((item) => item.symbol).join(",")}`, { headers: { ...REQUEST_HEADERS, Referer: "https://gu.qq.com/" } });
  if (!response.ok) throw new Error("Index feed unavailable");
  const text = await response.text();
  let tradeDate = "";
  const indices = indexSymbols.flatMap((item) => {
    const raw = text.match(new RegExp(`v_${item.symbol}="([^"]*)"`))?.[1];
    if (!raw) return [];
    const fields = raw.split("~");
    const stamp = fields[30]?.slice(0, 8);
    if (!tradeDate && /^\d{8}$/.test(stamp)) tradeDate = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
    return [{
      name: item.name, code: item.code, secid: item.symbol, price: number(fields[3]),
      changeAmount: number(fields[31]), change: number(fields[32]), volume: number(fields[37]) * 10000,
      high: number(fields[33]), low: number(fields[34]), open: number(fields[5]), previousClose: number(fields[4]),
    }];
  });
  return { indices, tradeDate: tradeDate || chinaClock().date };
}

function cleanText(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function newsCategory(tags: SinaTag[] = [], title = "") {
  const names = tags.map((tag) => tag.name);
  if (names.includes("公司") || /公司|业绩|回购|增持|减持|重组|上市/.test(title)) return "公司";
  if (/政策|央行|证监|监管|国务院|交易所/.test(title)) return "政策";
  if (/板块|行业|科技|消费|医药|金融|能源|芯片|人工智能/.test(title)) return "行业";
  return "市场";
}

async function fetchHotNews(tradeDate: string) {
  const feedUrl = (tag: number) => `https://zhibo.sina.com.cn/api/zhibo/feed?callback=&page=1&page_size=50&zhibo_id=152&tag_id=${tag}&dire=f&dpc=1`;
  const responses = await Promise.all([9, 10, 3].map((tag) => fetch(feedUrl(tag), { headers: { ...REQUEST_HEADERS, Referer: "https://finance.sina.com.cn/7x24/" } })));
  const payloads = await Promise.all(responses.map((response) => response.json() as Promise<{ result?: { data?: { feed?: { list?: SinaFeed[] } } } }>));
  const rows = payloads.flatMap((payload) => payload.result?.data?.feed?.list ?? []).filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index);
  const relevant = /A股|沪深|股票|个股|涨停|跌停|股价|收盘|板块|上市|回购|业绩|证券|ETF|成交额|市值/;
  return rows.map((row, index) => {
    const title = cleanText(row.rich_text ?? "").replace(/^【([^】]+)】\s*/, "$1：");
    const tags = row.tag?.map((tag) => tag.name ?? "") ?? [];
    let url = "https://finance.sina.com.cn/7x24/";
    try { url = String((JSON.parse(row.ext ?? "{}") as { docurl?: string }).docurl ?? url); } catch { /* Keep the live-feed link. */ }
    const published = row.create_time ? `${row.create_time.replace(" ", "T")}+08:00` : new Date().toISOString();
    const sameDay = row.create_time?.startsWith(tradeDate) ?? false;
    const engagement = number(row.like_nums) + (row.comment_list?.list?.length ?? 0);
    const heat = Math.min(99, 42 + (tags.includes("A股") ? 20 : 0) + (tags.includes("焦点") ? 14 : 0) + (tags.includes("公司") ? 8 : 0) + (sameDay ? 10 : 0) + (relevant.test(title) ? 8 : 0) + Math.min(7, engagement));
    return { id: String(row.id ?? index), title, source: "新浪财经", category: newsCategory(row.tag, title), url, publishedAt: new Date(published).toISOString(), heat, relevant: relevant.test(title) || tags.includes("A股") || tags.includes("公司") };
  }).filter((item) => item.title && item.relevant).sort((a, b) => b.heat - a.heat || b.publishedAt.localeCompare(a.publishedAt)).slice(0, 12).map(({ relevant: _relevant, ...item }) => item);
}

function bandScore(value: number, min: number, max: number, idealMin: number, idealMax: number, weight: number) {
  if (value < min || value > max) return 0;
  if (value >= idealMin && value <= idealMax) return weight;
  if (value < idealMin) return weight * (value - min) / Math.max(idealMin - min, 0.001);
  return weight * (max - value) / Math.max(max - idealMax, 0.001);
}

function recommendations(universe: StockQuote[]): Recommendation[] {
  return universe
    .filter((stock) => !/^(N|C|\*?ST|退)/i.test(stock.name) && stock.price >= 3 && stock.change > 0.8 && stock.change < 9.6 && stock.turnoverRate > 0.8 && stock.turnoverRate < 20 && stock.volumeRatio > 1.05 && stock.volumeRatio < 5 && stock.pe > 0 && stock.pe < 100 && stock.marketCap > 3e9 && stock.turnover > 3e8)
    .map((stock) => {
      const score = Math.round(
        bandScore(stock.change, .8, 9.6, 2, 6.5, 24) +
        bandScore(stock.volumeRatio, 1.05, 5, 1.3, 2.8, 20) +
        bandScore(stock.turnoverRate, .8, 20, 2, 10, 16) +
        bandScore(stock.pe, 1, 100, 8, 45, 15) +
        bandScore(Math.log10(stock.turnover), 8.4, 11, 9, 10.4, 15) +
        bandScore(Math.log10(stock.marketCap), 9.4, 13, 10, 12, 10)
      );
      const reasons = [
        `收盘涨幅 ${stock.change.toFixed(2)}%，保持强势但未触及极端区间`,
        `量比 ${stock.volumeRatio.toFixed(2)}、换手率 ${stock.turnoverRate.toFixed(2)}%，成交活跃`,
        `成交额 ${(stock.turnover / 1e8).toFixed(1)} 亿，具备较好的流动性`,
      ];
      if (stock.pe > 0 && stock.pe <= 45) reasons.push(`市盈率 ${stock.pe.toFixed(1)}，位于规则设定的估值区间`);
      const risks = [stock.change > 6.5 ? "短线涨幅偏高" : "次日动能可能衰减"];
      if (stock.turnoverRate > 12) risks.push("换手率偏高");
      if (stock.pe > 55) risks.push("估值敏感度较高");
      const style = stock.change >= 4 && stock.volumeRatio >= 1.5 ? "放量强势" : stock.volumeRatio >= 2 ? "量能突破" : "稳健活跃";
      return { ...stock, score, style, reasons, risks };
    })
    .sort((a, b) => b.score - a.score || b.turnover - a.turnover)
    .slice(0, 5);
}

function chinaClock() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minute = number(values.hour) * 60 + number(values.minute);
  const workday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(values.weekday);
  return { date: `${values.year}-${values.month}-${values.day}`, weekday: values.weekday, afterClose: workday && minute >= 15 * 60 + 35 };
}

function nextRefreshAt() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minute = number(values.hour) * 60 + number(values.minute);
  const workday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(values.weekday);
  let target = new Date(Date.UTC(number(values.year), number(values.month) - 1, number(values.day), 7, 35));
  if (!workday || minute >= 15 * 60 + 35) target = new Date(target.getTime() + 86400000);
  while ([0, 6].includes(target.getUTCDay())) target = new Date(target.getTime() + 86400000);
  return target.toISOString();
}

async function ensureTable() {
  if (!env.DB) throw new Error("D1 binding unavailable");
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS daily_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, trade_date TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_snapshots_trade_date ON daily_snapshots (trade_date)"),
  ]);
  return env.DB;
}

async function buildSnapshot(probe?: Awaited<ReturnType<typeof fetchIndices>>, status: "final" | "provisional" = "final"): Promise<DailySnapshot> {
  const market = probe ?? await fetchIndices();
  const [universe, sectorRows, totalStocks, news] = await Promise.all([
    fetchUniverse(), ranking("changepercent", 0, 8, "hs_s"),
    sinaJson<string>(`${SINA_API}.getHQNodeStockCount?node=hs_a`), fetchHotNews(market.tradeDate),
  ]);
  const sectors = sectorRows.map((row) => ({ name: String(row.name ?? "—"), code: String(row.code ?? ""), price: number(row.trade), change: number(row.changepercent) }));
  const averageIndexChange = market.indices.reduce((sum, item) => sum + item.change, 0) / Math.max(market.indices.length, 1);
  return {
    tradeDate: market.tradeDate, generatedAt: new Date().toISOString(), nextRefreshAt: nextRefreshAt(), status,
    indices: market.indices, sectors, totalStocks: number(totalStocks), universe,
    recommendations: recommendations(universe), news,
    summary: { averageIndexChange, positiveIndices: market.indices.filter((item) => item.change > 0).length, topSector: sectors[0]?.name ?? "—", sampleSize: universe.length },
  };
}

export async function GET() {
  const refreshAt = nextRefreshAt();
  try {
    const db = await ensureTable();
    const latest = await db.prepare("SELECT trade_date AS tradeDate, payload FROM daily_snapshots ORDER BY trade_date DESC LIMIT 1").first<{ tradeDate: string; payload: string }>();
    const clock = chinaClock();
    if (latest && !clock.afterClose) {
      const payload = JSON.parse(latest.payload) as DailySnapshot;
      return Response.json({ ...payload, nextRefreshAt: refreshAt }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
    }

    const probe = await fetchIndices();
    if (latest?.tradeDate === probe.tradeDate) {
      const payload = JSON.parse(latest.payload) as DailySnapshot;
      return Response.json({ ...payload, nextRefreshAt: refreshAt }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
    }

    const snapshot = await buildSnapshot(probe, clock.afterClose ? "final" : "provisional");
    if (clock.afterClose) {
      await db.prepare("INSERT INTO daily_snapshots (trade_date, payload, created_at) VALUES (?, ?, ?) ON CONFLICT(trade_date) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at")
        .bind(snapshot.tradeDate, JSON.stringify(snapshot), snapshot.generatedAt).run();
    }
    return Response.json(snapshot, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch {
    const snapshot = await buildSnapshot(undefined, "provisional");
    return Response.json(snapshot, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
