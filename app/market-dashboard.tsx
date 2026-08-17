"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type IndexQuote = { name: string; code: string; secid: string; price: number; change: number; changeAmount: number; high: number; low: number; open: number; previousClose: number; volume: number };
type StockQuote = { name: string; code: string; secid: string; price: number; change: number; changeAmount: number; volume?: number; turnover?: number; turnoverRate?: number; pe?: number; high?: number; low?: number; marketCap?: number; netFlow?: number };
type Sector = { name: string; code: string; price: number; change: number; netFlow: number };
type NewsItem = { id: string; title: string; source: string; category: string; url: string; publishedAt: string };
type MarketData = { indices: IndexQuote[]; leaders: StockQuote[]; laggards: StockQuote[]; sectors: Sector[]; totalStocks: number; updatedAt: string; stale: boolean };

const initialMarket: MarketData = {
  indices: [
    { name: "上证指数", code: "000001", secid: "1.000001", price: 3982.65, change: 1.41, changeAmount: 55.47, high: 3983.51, low: 3924.47, open: 3930.1, previousClose: 3927.18, volume: 706246394459 },
    { name: "深证成指", code: "399001", secid: "0.399001", price: 14704.27, change: 2.44, changeAmount: 349.96, high: 14704.55, low: 14348.47, open: 14399.2, previousClose: 14354.31, volume: 465109058625 },
    { name: "创业板指", code: "399006", secid: "0.399006", price: 3246.8, change: 3.07, changeAmount: 96.66, high: 3249.2, low: 3138.5, open: 3155.1, previousClose: 3150.14, volume: 208700000000 },
  ],
  leaders: [], laggards: [], sectors: [], totalStocks: 0, updatedAt: new Date().toISOString(), stale: true,
};

const newsFilters = ["全部", "市场", "公司", "政策", "行业"];

function signed(value: number, digits = 2) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}`;
}

function compact(value: number) {
  const absolute = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (absolute >= 1e12) return `${prefix}${(absolute / 1e12).toFixed(2)}万亿`;
  if (absolute >= 1e8) return `${prefix}${(absolute / 1e8).toFixed(1)}亿`;
  if (absolute >= 1e4) return `${prefix}${(absolute / 1e4).toFixed(1)}万`;
  return `${value.toFixed(0)}`;
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMinutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}小时前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function updateTime(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
}

function marketClock() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minute = Number(values.hour) * 60 + Number(values.minute);
  const weekday = values.weekday;
  const workday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  const open = workday && ((minute >= 570 && minute < 690) || (minute >= 780 && minute < 900));
  const lunch = workday && minute >= 690 && minute < 780;
  return open ? { label: "沪深交易进行中", className: "is-open" } : lunch ? { label: "午间休市", className: "is-paused" } : { label: "沪深交易已收盘", className: "" };
}

function bars(seed: string, rising: boolean) {
  let hash = [...seed].reduce((value, char) => value + char.charCodeAt(0), 0);
  return Array.from({ length: 12 }, (_, index) => {
    hash = (hash * 9301 + 49297) % 233280;
    const base = 20 + (hash / 233280) * 58;
    const trend = rising ? index * 2 : (11 - index) * 2;
    return Math.min(96, Math.round(base + trend));
  });
}

function Tone({ value, children }: { value: number; children: React.ReactNode }) {
  return <span className={value > 0 ? "up" : value < 0 ? "down" : "flat"}>{children}</span>;
}

export function MarketDashboard() {
  const [market, setMarket] = useState(initialMarket);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rankTab, setRankTab] = useState<"leaders" | "laggards" | "watchlist">("leaders");
  const [newsFilter, setNewsFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockQuote[]>([]);
  const [searching, setSearching] = useState(false);
  const [watchlist, setWatchlist] = useState<StockQuote[]>([]);
  const [watchlistReady, setWatchlistReady] = useState(false);
  const [selected, setSelected] = useState<StockQuote | null>(null);
  const searchWrap = useRef<HTMLDivElement>(null);
  const clock = marketClock();

  const loadMarket = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/market", { cache: "no-store" });
      if (response.ok) setMarket(await response.json() as MarketData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadNews = useCallback(async () => {
    try {
      const response = await fetch("/api/news", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { items: NewsItem[] };
        setNews(payload.items);
      }
    } catch {
      setNews([]);
    }
  }, []);

  useEffect(() => {
    void loadMarket();
    void loadNews();
    const marketTimer = window.setInterval(() => void loadMarket(), 180000);
    const newsTimer = window.setInterval(() => void loadNews(), 900000);
    return () => { window.clearInterval(marketTimer); window.clearInterval(newsTimer); };
  }, [loadMarket, loadNews]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("panmian-watchlist");
      if (stored) setWatchlist(JSON.parse(stored) as StockQuote[]);
    } catch { /* Device storage may be unavailable. */ }
    setWatchlistReady(true);
  }, []);

  useEffect(() => {
    if (!watchlistReady) return;
    window.localStorage.setItem("panmian-watchlist", JSON.stringify(watchlist));
  }, [watchlist, watchlistReady]);

  useEffect(() => {
    if (!watchlistReady || !watchlist.length) return;
    const secids = watchlist.map((item) => item.secid).join(",");
    const refresh = async () => {
      const response = await fetch(`/api/quotes?secids=${encodeURIComponent(secids)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { items: StockQuote[] };
      if (payload.items.length) {
        setWatchlist((current) => payload.items.map((quote) => {
          const saved = current.find((item) => item.secid === quote.secid);
          return { ...saved, ...quote, name: saved?.name ?? quote.name };
        }));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 180000);
    return () => window.clearInterval(timer);
  }, [watchlistReady, watchlist.map((item) => item.secid).join(",")]);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setSearchResults([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const payload = await response.json() as { items: StockQuote[] };
        setSearchResults(payload.items);
      } catch {
        if (!controller.signal.aborted) setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 260);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!searchWrap.current?.contains(event.target as Node)) setQuery("");
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const isWatched = useCallback((secid: string) => watchlist.some((item) => item.secid === secid), [watchlist]);
  const toggleWatch = useCallback((quote: StockQuote) => {
    setWatchlist((items) => items.some((item) => item.secid === quote.secid) ? items.filter((item) => item.secid !== quote.secid) : [...items, quote]);
  }, []);

  const rows = rankTab === "leaders" ? market.leaders : rankTab === "laggards" ? market.laggards : watchlist;
  const filteredNews = useMemo(() => newsFilter === "全部" ? news : news.filter((item) => item.category === newsFilter), [news, newsFilter]);
  const leadStock = market.leaders[0];
  const primaryIndices = market.indices.slice(0, 3);

  return (
    <main className="site-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="盘面首页">
          <span className="brand-mark">盘</span><span>盘面</span><span className="brand-tag">A股市场雷达</span>
        </a>
        <nav className="nav" aria-label="主导航">
          <a className="active" href="#market">行情</a><a href="#rankings">榜单</a><a href="#news">快讯</a>
        </nav>
        <div className="stock-search" ref={searchWrap}>
          <label className="sr-only" htmlFor="stock-search">搜索股票</label>
          <span aria-hidden="true">⌕</span>
          <input id="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="代码 / 名称" autoComplete="off" />
          {query && (
            <div className="search-popover" role="listbox" aria-label="股票搜索结果">
              {searching ? <p className="search-state">正在查找…</p> : searchResults.length ? searchResults.map((item) => (
                <button type="button" key={item.secid} onClick={() => { setSelected(item); setQuery(""); }}>
                  <span><b>{item.name}</b><small>{item.code}</small></span>
                  <span className="search-price">{item.price.toFixed(2)}<Tone value={item.change}>{signed(item.change)}%</Tone></span>
                </button>
              )) : <p className="search-state">没有找到沪深 A 股</p>}
            </div>
          )}
        </div>
        <div className={`market-open ${clock.className}`}><span />{clock.label}</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">MARKET INTELLIGENCE · {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(new Date()).replace("/", " / ")}</p>
          <h1>今天的市场，<br /><em>一眼看清。</em></h1>
          <p className="lede">聚合沪深核心行情、强势板块与重要资讯，<br />让每个交易日从关键信号开始。</p>
          <div className="freshness" aria-live="polite">
            <span className={loading ? "loading-dot" : ""} />
            {market.stale ? "数据源连接中" : `行情更新于 ${updateTime(market.updatedAt)}`}
            <button type="button" onClick={() => void loadMarket(true)} disabled={refreshing}>{refreshing ? "刷新中" : "刷新"}</button>
          </div>
        </div>
        <div className="hero-stat">
          <span>{leadStock ? "今日领涨" : "覆盖沪深市场"}</span>
          <strong>{leadStock ? leadStock.name : market.totalStocks ? market.totalStocks.toLocaleString("zh-CN") : "A 股"}</strong>
          <small>{leadStock ? `${leadStock.code} · ${signed(leadStock.change)}%` : "指数 · 个股 · 行业 · 资讯"}</small>
          <div className="breadth" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </div>
      </section>

      <section className="indices" id="market" aria-label="主要指数">
        {primaryIndices.map((item, index) => (
          <article className="index-card" key={item.secid}>
            <div className="index-heading"><span>0{index + 1}</span><b>{item.name}</b><small>{item.code}</small></div>
            <div className="index-main"><strong>{item.price.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</strong><Tone value={item.change}><em>{signed(item.change)}%</em></Tone></div>
            <div className={`micro-chart ${item.change < 0 ? "negative" : ""}`} aria-hidden="true">
              {bars(item.code, item.change >= 0).map((height, barIndex) => <span key={barIndex} style={{ height: `${height}%` }} />)}
            </div>
            <div className="index-meta"><small>高 {item.high.toFixed(2)}</small><small>低 {item.low.toFixed(2)}</small><small>成交 {compact(item.volume)}</small></div>
          </article>
        ))}
      </section>

      <section className="signal-grid">
        <article className="panel sector-panel">
          <div className="panel-title"><span>资金温度</span><b>强势板块</b><small>TOP {market.sectors.length || "—"}</small></div>
          <div className="pulse-list">
            {market.sectors.length ? market.sectors.slice(0, 5).map((item, index) => (
              <div className="pulse-row" key={item.code}>
                <span>0{index + 1}</span><b>{item.name}</b>
                <div><i style={{ width: `${Math.max(16, Math.min(100, (Math.abs(item.change) / Math.max(...market.sectors.map((sector) => Math.abs(sector.change)))) * 100))}%` }} /></div>
                <Tone value={item.change}><em>{signed(item.change)}%</em></Tone>
              </div>
            )) : <div className="empty-inline">板块数据加载中</div>}
          </div>
        </article>

        <article className="panel market-pulse-panel">
          <div className="panel-title"><span>盘面信号</span><b>核心指数</b><small>{market.indices.length}</small></div>
          <div className="mini-index-list">
            {market.indices.slice(3).map((item) => (
              <div key={item.secid}><span>{item.name}<small>{item.code}</small></span><b>{item.price.toFixed(2)}</b><Tone value={item.change}>{signed(item.change)}%</Tone></div>
            ))}
            <div><span>全市场股票<small>沪深 A 股</small></span><b>{market.totalStocks ? market.totalStocks.toLocaleString("zh-CN") : "—"}</b><span className="neutral">只</span></div>
          </div>
        </article>
      </section>

      <section className="rank-section" id="rankings">
        <div className="section-heading">
          <div><p>MARKET MOVERS</p><h2>个股风向</h2></div>
          <div className="segmented" role="tablist" aria-label="个股榜单">
            <button role="tab" aria-selected={rankTab === "leaders"} onClick={() => setRankTab("leaders")}>领涨</button>
            <button role="tab" aria-selected={rankTab === "laggards"} onClick={() => setRankTab("laggards")}>领跌</button>
            <button role="tab" aria-selected={rankTab === "watchlist"} onClick={() => setRankTab("watchlist")}>自选 <span>{watchlist.length}</span></button>
          </div>
        </div>
        <div className="stock-table-wrap">
          <table className="stock-table">
            <thead><tr><th>股票</th><th>最新价</th><th>涨跌幅</th><th>成交额</th><th>换手率</th><th>市盈率</th><th><span className="sr-only">添加自选</span></th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.secid} onClick={() => setSelected(item)}>
                  <td><b>{item.name}</b><small>{item.code}</small></td>
                  <td className="mono">{item.price.toFixed(2)}</td>
                  <td><Tone value={item.change}>{signed(item.change)}%</Tone></td>
                  <td className="muted-cell">{item.turnover ? compact(item.turnover) : "—"}</td>
                  <td className="muted-cell">{item.turnoverRate ? `${item.turnoverRate.toFixed(2)}%` : "—"}</td>
                  <td className="muted-cell">{item.pe ? item.pe.toFixed(1) : "—"}</td>
                  <td><button className={isWatched(item.secid) ? "watch active" : "watch"} type="button" aria-label={isWatched(item.secid) ? `从自选移除${item.name}` : `添加${item.name}到自选`} onClick={(event) => { event.stopPropagation(); toggleWatch(item); }}>☆</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="table-empty">{rankTab === "watchlist" ? "搜索股票或点击 ☆，建立你的自选清单。" : "个股行情正在更新，请稍后刷新。"}</div>}
        </div>
      </section>

      <section className="news-section" id="news">
        <div className="section-heading news-heading">
          <div><p>DAILY SIGNALS</p><h2>今日快讯</h2></div>
          <div className="news-filters" aria-label="资讯筛选">
            {newsFilters.map((filter) => <button key={filter} className={newsFilter === filter ? "active" : ""} onClick={() => setNewsFilter(filter)}>{filter}</button>)}
          </div>
        </div>
        <div className="news-list">
          {filteredNews.slice(0, 10).map((item, index) => (
            <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
              <span className="news-number">{String(index + 1).padStart(2, "0")}</span>
              <div><span className="news-chip">{item.category}</span><h3>{item.title}</h3><p>{item.source} · {timeLabel(item.publishedAt)}</p></div>
              <span className="news-arrow">↗</span>
            </a>
          ))}
          {!filteredNews.length && <div className="table-empty">这一分类暂时没有新资讯。</div>}
        </div>
      </section>

      <footer className="site-footer">
        <div><span className="brand-mark small">盘</span><p><b>盘面</b><small>A股市场雷达</small></p></div>
        <p>行情自动刷新 · 新闻每 15 分钟更新<br />行情数据来自东方财富公开行情，资讯聚合自 Google 新闻</p>
        <p>数据仅供参考，不构成任何投资建议<br />市场有风险，投资需谨慎</p>
      </footer>

      {selected && (
        <div className="quote-modal" role="dialog" aria-modal="true" aria-labelledby="quote-title" onMouseDown={() => setSelected(null)}>
          <article onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setSelected(null)}>×</button>
            <p>QUICK QUOTE · {selected.code}</p><h2 id="quote-title">{selected.name}</h2>
            <div className="modal-price"><b>{selected.price.toFixed(2)}</b><Tone value={selected.change}>{signed(selected.change)}%</Tone></div>
            <dl>
              <div><dt>涨跌额</dt><dd><Tone value={selected.changeAmount}>{signed(selected.changeAmount)}</Tone></dd></div>
              <div><dt>最高</dt><dd>{selected.high?.toFixed(2) ?? "—"}</dd></div>
              <div><dt>最低</dt><dd>{selected.low?.toFixed(2) ?? "—"}</dd></div>
              <div><dt>成交额</dt><dd>{selected.turnover ? compact(selected.turnover) : "—"}</dd></div>
            </dl>
            <button className="modal-watch" type="button" onClick={() => toggleWatch(selected)}>{isWatched(selected.secid) ? "已加入自选 · 点击移除" : "+ 加入自选"}</button>
          </article>
        </div>
      )}
    </main>
  );
}
