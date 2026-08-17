"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type IndexQuote = { name: string; code: string; secid: string; price: number; change: number; changeAmount: number; high: number; low: number; open: number; previousClose: number; volume: number };
type StockQuote = { name: string; code: string; secid: string; price: number; change: number; changeAmount: number; volume: number; turnover: number; turnoverRate: number; volumeRatio: number; pe: number; high: number; low: number; open: number; previousClose: number; marketCap: number; floatMarketCap: number };
type Recommendation = StockQuote & { score: number; style: string; reasons: string[]; risks: string[] };
type NewsItem = { id: string; title: string; source: string; category: string; url: string; publishedAt: string; heat: number };
type NewsDay = { tradeDate: string; generatedAt: string; news: NewsItem[] };
type StockHistoryItem = { date: string; open: number; close: number; high: number; low: number; volume: number; change: number };
type DailySnapshot = {
  contentVersion?: number; tradeDate: string; generatedAt: string; nextRefreshAt: string; status: "final" | "provisional";
  indices: IndexQuote[]; sectors: Array<{ name: string; code: string; price: number; change: number; turnover: number }>;
  totalStocks: number; universe: StockQuote[]; recommendations: Recommendation[]; news: NewsItem[];
  summary: { averageIndexChange: number; positiveIndices: number; topSector: string; sampleSize: number };
};

type SortKey = "change" | "turnoverRate" | "volumeRatio" | "pe" | "price" | "marketCap" | "turnover";
type FilterKey = Exclude<SortKey, "turnover">;
type Range = { min: string; max: string };
type Theme = "light" | "dark";
type View = "overview" | "news" | "stocks" | "ideas";

const placeholderIndices: IndexQuote[] = [
  { name: "上证指数", code: "000001", secid: "sh000001", price: 3982.65, change: 1.41, changeAmount: 55.47, high: 3983.51, low: 3924.47, open: 3930.1, previousClose: 3927.18, volume: 706246394459 },
  { name: "深证成指", code: "399001", secid: "sz399001", price: 14704.27, change: 2.44, changeAmount: 349.96, high: 14704.55, low: 14348.47, open: 14399.2, previousClose: 14354.31, volume: 465109058625 },
  { name: "创业板指", code: "399006", secid: "sz399006", price: 3246.8, change: 3.07, changeAmount: 96.66, high: 3249.2, low: 3138.5, open: 3155.1, previousClose: 3150.14, volume: 208700000000 },
  { name: "沪深300", code: "000300", secid: "sh000300", price: 4588.23, change: 1.73, changeAmount: 78.1, high: 4591.2, low: 4512.1, open: 4520.2, previousClose: 4510.1, volume: 192000000000 },
  { name: "科创50", code: "000688", secid: "sh000688", price: 1324.18, change: 2.86, changeAmount: 36.8, high: 1328.3, low: 1280.5, open: 1288.6, previousClose: 1287.38, volume: 88000000000 },
];

const initialSnapshot: DailySnapshot = {
  tradeDate: "2026-08-17", generatedAt: "2026-08-17T07:35:00.000Z", nextRefreshAt: "2026-08-18T07:35:00.000Z", status: "provisional",
  indices: placeholderIndices, sectors: [], totalStocks: 0, universe: [], recommendations: [], news: [],
  summary: { averageIndexChange: 0, positiveIndices: 0, topSector: "—", sampleSize: 0 },
};

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "change", label: "涨幅" }, { key: "turnoverRate", label: "换手率" }, { key: "volumeRatio", label: "量比" },
  { key: "pe", label: "市盈率" }, { key: "price", label: "价格" }, { key: "marketCap", label: "总市值" }, { key: "turnover", label: "成交额" },
];

const filterFields: Array<{ key: FilterKey; label: string; unit: string; step: string }> = [
  { key: "change", label: "涨幅", unit: "%", step: "0.1" },
  { key: "turnoverRate", label: "换手率", unit: "%", step: "0.1" },
  { key: "volumeRatio", label: "量比", unit: "倍", step: "0.1" },
  { key: "pe", label: "市盈率", unit: "x", step: "1" },
  { key: "price", label: "价格", unit: "元", step: "0.1" },
  { key: "marketCap", label: "总市值", unit: "亿", step: "1" },
];

const emptyFilters = (): Record<FilterKey, Range> => ({
  change: { min: "", max: "" }, turnoverRate: { min: "", max: "" }, volumeRatio: { min: "", max: "" },
  pe: { min: "", max: "" }, price: { min: "", max: "" }, marketCap: { min: "", max: "" },
});

function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function compact(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1e12) return `${sign}${(absolute / 1e12).toFixed(2)}万亿`;
  if (absolute >= 1e8) return `${sign}${(absolute / 1e8).toFixed(1)}亿`;
  if (absolute >= 1e4) return `${sign}${(absolute / 1e4).toFixed(1)}万`;
  return `${value.toFixed(0)}`;
}

function formatTradeDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function clock(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function dayAndTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function dateChip(value: string) {
  const date = new Date(`${value}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", weekday: "short" }).format(date).replaceAll("/", ".");
}

function bars(seed: string, rising: boolean) {
  let hash = [...seed].reduce((value, char) => value + char.charCodeAt(0), 0);
  return Array.from({ length: 9 }, (_, index) => {
    hash = (hash * 9301 + 49297) % 233280;
    const base = 25 + (hash / 233280) * 45;
    return Math.min(96, Math.round(base + (rising ? index : 8 - index) * 3));
  });
}

function normalizeStock(stock: Partial<StockQuote> & Pick<StockQuote, "name" | "code" | "secid" | "price" | "change" | "changeAmount">): StockQuote {
  return {
    volume: 0, turnover: 0, turnoverRate: 0, volumeRatio: 0, pe: 0, high: 0, low: 0,
    open: 0, previousClose: 0, marketCap: 0, floatMarketCap: 0, ...stock,
  };
}

function Tone({ value, children }: { value: number; children: React.ReactNode }) {
  return <span className={value > 0 ? "up" : value < 0 ? "down" : "flat"}>{children}</span>;
}

export function MarketDashboard() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [descending, setDescending] = useState(true);
  const [filters, setFilters] = useState<Record<FilterKey, Range>>(emptyFilters);
  const [listMode, setListMode] = useState<"market" | "watchlist">("market");
  const [watchlist, setWatchlist] = useState<StockQuote[]>([]);
  const [watchReady, setWatchReady] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockQuote[]>([]);
  const [searching, setSearching] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [activeView, setActiveView] = useState<View>("overview");
  const [allStocks, setAllStocks] = useState<StockQuote[]>([]);
  const [allStockTotal, setAllStockTotal] = useState(0);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stocksError, setStocksError] = useState("");
  const [loadedBatches, setLoadedBatches] = useState(0);
  const [stockBatchCount, setStockBatchCount] = useState(0);
  const [stockPage, setStockPage] = useState(1);
  const [newsArchive, setNewsArchive] = useState<NewsDay[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [selectedNewsDate, setSelectedNewsDate] = useState("");
  const [newsSource, setNewsSource] = useState("全部");
  const [selectedStock, setSelectedStock] = useState<StockQuote | null>(null);
  const [stockHistory, setStockHistory] = useState<StockHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const searchWrap = useRef<HTMLDivElement>(null);

  const loadDaily = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/daily", { cache: "no-store" });
      if (!response.ok) throw new Error("Daily snapshot unavailable");
      setSnapshot(await response.json() as DailySnapshot);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadDaily(); }, [loadDaily]);

  useEffect(() => {
    const activeTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(activeTheme);
  }, []);

  useEffect(() => {
    const fromHash = (): View => {
      if (window.location.hash === "#news") return "news";
      if (window.location.hash === "#stocks") return "stocks";
      if (window.location.hash === "#ideas") return "ideas";
      return "overview";
    };
    const sync = () => setActiveView(fromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const loadAllStocks = useCallback(async () => {
    setStocksLoading(true);
    setStocksError("");
    setLoadedBatches(0);
    try {
      const getBatch = async (batch: number) => {
        const response = await fetch(`/api/stocks?batch=${batch}`, { cache: "no-store" });
        if (!response.ok) throw new Error("A股行情暂时不可用");
        const payload = await response.json() as { items: StockQuote[]; total: number; batchCount: number };
        setLoadedBatches((count) => count + 1);
        return payload;
      };
      const first = await getBatch(0);
      setAllStockTotal(first.total);
      setStockBatchCount(first.batchCount);
      const rest = await Promise.all(Array.from({ length: Math.max(0, first.batchCount - 1) }, (_, index) => getBatch(index + 1)));
      setAllStocks([first, ...rest].flatMap((batch) => batch.items));
    } catch (error) {
      setStocksError(error instanceof Error ? error.message : "A股行情暂时不可用");
    } finally {
      setStocksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === "stocks" && !allStocks.length && !stocksLoading && !stocksError) void loadAllStocks();
  }, [activeView, allStocks.length, stocksLoading, stocksError, loadAllStocks]);

  useEffect(() => {
    if (activeView !== "news" || archiveLoaded || archiveLoading) return;
    const loadArchive = async () => {
      setArchiveLoading(true);
      try {
        const response = await fetch("/api/archive", { cache: "no-store" });
        if (!response.ok) throw new Error("archive unavailable");
        const payload = await response.json() as { days: NewsDay[] };
        setNewsArchive(payload.days);
      } catch { setNewsArchive([]); }
      finally { setArchiveLoading(false); setArchiveLoaded(true); }
    };
    void loadArchive();
  }, [activeView, archiveLoaded, archiveLoading]);

  useEffect(() => {
    const delay = Math.max(60000, new Date(snapshot.nextRefreshAt).getTime() - Date.now() + 120000);
    const timer = window.setTimeout(() => void loadDaily(), Math.min(delay, 2147483000));
    return () => window.clearTimeout(timer);
  }, [snapshot.nextRefreshAt, loadDaily]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("panmian-watchlist");
      if (saved) setWatchlist(JSON.parse(saved) as StockQuote[]);
    } catch { /* Device-local storage is optional. */ }
    setWatchReady(true);
  }, []);

  useEffect(() => {
    if (!watchReady) return;
    window.localStorage.setItem("panmian-watchlist", JSON.stringify(watchlist));
  }, [watchlist, watchReady]);

  useEffect(() => {
    if (!snapshot.universe.length || !watchlist.length) return;
    setWatchlist((items) => items.map((item) => snapshot.universe.find((quote) => quote.secid === item.secid) ?? item));
  }, [snapshot.tradeDate]);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setSearchResults([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const payload = await response.json() as { items: Array<Partial<StockQuote> & Pick<StockQuote, "name" | "code" | "secid" | "price" | "change" | "changeAmount">> };
        setSearchResults(payload.items.map(normalizeStock));
      } catch { if (!controller.signal.aborted) setSearchResults([]); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 260);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!searchWrap.current?.contains(event.target as Node)) setQuery(""); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const isWatched = useCallback((secid: string) => watchlist.some((item) => item.secid === secid), [watchlist]);
  const toggleWatch = useCallback((stock: StockQuote) => {
    setWatchlist((items) => items.some((item) => item.secid === stock.secid) ? items.filter((item) => item.secid !== stock.secid) : [...items, stock]);
  }, []);

  const activeFilterCount = useMemo(() => Object.values(filters).filter((range) => range.min !== "" || range.max !== "").length, [filters]);

  const rankingRows = useMemo(() => {
    const source = listMode === "market" ? allStocks : watchlist;
    const metricValue = (stock: StockQuote, key: SortKey) => stock[key];
    return source.filter((stock) => filterFields.every(({ key }) => {
      const raw = key === "marketCap" ? stock.marketCap / 1e8 : stock[key];
      const minimum = filters[key].min === "" ? -Infinity : Number(filters[key].min);
      const maximum = filters[key].max === "" ? Infinity : Number(filters[key].max);
      return raw >= minimum && raw <= maximum;
    })).sort((a, b) => (metricValue(a, sortKey) - metricValue(b, sortKey)) * (descending ? -1 : 1));
  }, [allStocks, watchlist, listMode, filters, sortKey, descending]);

  useEffect(() => { setStockPage(1); }, [filters, sortKey, descending, listMode]);

  const rowsPerPage = 50;
  const stockPageCount = Math.max(1, Math.ceil(rankingRows.length / rowsPerPage));
  const visibleRankingRows = rankingRows.slice((stockPage - 1) * rowsPerPage, stockPage * rowsPerPage);

  const newsDays = useMemo(() => {
    const byDate = new Map(newsArchive.map((day) => [day.tradeDate, day]));
    byDate.set(snapshot.tradeDate, { tradeDate: snapshot.tradeDate, generatedAt: snapshot.generatedAt, news: snapshot.news });
    return [...byDate.values()].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
  }, [newsArchive, snapshot.tradeDate, snapshot.generatedAt, snapshot.news]);

  useEffect(() => {
    if (!selectedNewsDate && newsDays.length) setSelectedNewsDate(newsDays[0].tradeDate);
  }, [newsDays, selectedNewsDate]);

  const activeNewsDay = newsDays.find((day) => day.tradeDate === selectedNewsDate) ?? newsDays[0];
  const newsSources = useMemo(() => ["全部", ...new Set((activeNewsDay?.news ?? []).map((item) => item.source))], [activeNewsDay]);
  const visibleNews = (activeNewsDay?.news ?? []).filter((item) => newsSource === "全部" || item.source === newsSource);

  const updateFilter = (key: FilterKey, side: keyof Range, value: string) => setFilters((current) => ({ ...current, [key]: { ...current[key], [side]: value } }));
  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("panmian-theme", nextTheme);
    setTheme(nextTheme);
  };
  const selectView = (view: View) => {
    setActiveView(view);
    window.history.pushState(null, "", view === "overview" ? window.location.pathname : `#${view}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const preset = (name: "active" | "value" | "midcap") => {
    const next = emptyFilters();
    if (name === "active") { next.change.min = "1"; next.turnoverRate.min = "3"; next.volumeRatio.min = "1.2"; }
    if (name === "value") { next.pe.min = "1"; next.pe.max = "30"; next.marketCap.min = "100"; }
    if (name === "midcap") { next.marketCap.min = "30"; next.marketCap.max = "300"; next.price.min = "5"; }
    setFilters(next);
  };
  const openStockHistory = async (stock: StockQuote) => {
    setSelectedStock(stock);
    setHistoryLoading(true);
    setHistoryError("");
    setStockHistory([]);
    try {
      const response = await fetch(`/api/stock-history?secid=${encodeURIComponent(stock.secid)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("历史行情暂时不可用");
      const payload = await response.json() as { items: StockHistoryItem[] };
      setStockHistory(payload.items);
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "历史行情暂时不可用"); }
    finally { setHistoryLoading(false); }
  };

  return (
    <main className="site-shell" id="top">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => selectView("overview")} aria-label="微光首页"><span className="brand-mark" aria-hidden="true" /><span>微光</span><span className="brand-tag">A股收盘研究台</span></button>
        <nav className="nav" aria-label="主导航"><button className={activeView === "news" ? "active" : ""} type="button" onClick={() => selectView("news")}>每日资讯</button><button className={activeView === "stocks" ? "active" : ""} type="button" onClick={() => selectView("stocks")}>个股信息</button><button className={activeView === "ideas" ? "active" : ""} type="button" onClick={() => selectView("ideas")}>选股建议</button></nav>
        <div className="stock-search" ref={searchWrap}>
          <label className="sr-only" htmlFor="stock-search">搜索股票</label><span aria-hidden="true">⌕</span>
          <input id="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索代码 / 名称" autoComplete="off" />
          {query && <div className="search-popover" role="listbox" aria-label="股票搜索结果">
            {searching ? <p>正在搜索…</p> : searchResults.length ? searchResults.map((item) => <button type="button" key={item.secid} onClick={() => { toggleWatch(item); setQuery(""); }}><span><b>{item.name}</b><small>{item.code}</small></span><span>{item.price.toFixed(2)} <Tone value={item.change}>{signed(item.change)}%</Tone></span><i>{isWatched(item.secid) ? "已自选" : "+ 自选"}</i></button>) : <p>没有找到沪深 A 股</p>}
          </div>}
        </div>
        <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "切换至日间模式" : "切换至夜间模式"} title={theme === "dark" ? "切换至日间模式" : "切换至夜间模式"}><span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span><b>{theme === "dark" ? "日间" : "夜间"}</b></button>
        <div className={snapshot.status === "final" ? "close-status final" : "close-status"}><span />{snapshot.status === "final" ? "收盘定稿" : "盘中预览"}</div>
      </header>

      <div className="daily-strip">
        <b>{formatTradeDate(snapshot.tradeDate)} · 收盘数据</b>
        <span>生成 {clock(snapshot.generatedAt)}</span><span>下次定稿 {dayAndTime(snapshot.nextRefreshAt)}</span>
        <button type="button" onClick={() => void loadDaily(true)} disabled={refreshing}>{refreshing ? "正在检查" : "检查更新"}</button>
      </div>

      {activeView === "overview" && <section className="overview" id="market">
        <div className="section-title compact-title"><div><p>DAILY MARKET CLOSE</p><h1>收盘总览</h1></div><span>每日 15:35 后更新 · 盘中保留上一交易日定稿</span></div>
        <div className="summary-grid">
          <article><span>核心指数红盘</span><b>{snapshot.summary.positiveIndices}<small> / {snapshot.indices.length}</small></b><em>市场广度</em></article>
          <article><span>指数平均涨跌</span><Tone value={snapshot.summary.averageIndexChange}><b>{signed(snapshot.summary.averageIndexChange)}<small>%</small></b></Tone><em>等权口径</em></article>
          <article><span>最强行业指数</span><b className="text-value">{snapshot.summary.topSector}</b><em>按收盘涨幅</em></article>
          <article><span>A股股票总数</span><b>{snapshot.totalStocks}<small> 只</small></b><em>沪深北市场</em></article>
        </div>
        <div className="indices">
          {snapshot.indices.map((item) => <article className="index-card" key={item.secid}>
            <div className="index-head"><span>{item.name}<small>{item.code}</small></span><Tone value={item.change}>{signed(item.change)}%</Tone></div>
            <div className="index-price"><b>{item.price.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</b><small><Tone value={item.changeAmount}>{signed(item.changeAmount)}</Tone></small></div>
            <div className={`micro-chart ${item.change < 0 ? "negative" : ""}`} aria-hidden="true">{bars(item.code, item.change >= 0).map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
            <div className="index-foot"><span>高 {item.high.toFixed(2)}</span><span>低 {item.low.toFixed(2)}</span><span>{compact(item.volume)}</span></div>
          </article>)}
        </div>
        <div className="sector-heading"><div><p>SECTOR PULSE</p><h2>板块脉搏</h2></div><span>涨幅前列与弱势板块 · 一屏看清市场结构</span></div>
        <div className="sector-grid">
          {snapshot.sectors.map((item, index) => <article className={`sector-card ${index < 8 ? "leading" : "lagging"}`} key={item.code}>
            <div className="sector-card-head"><span>{String(index + 1).padStart(2, "0")}</span><small>{index < 8 ? "活跃板块" : "弱势观察"}</small></div>
            <h3>{item.name}</h3>
            <div><b>{item.price.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</b><Tone value={item.change}>{signed(item.change)}%</Tone></div>
            <p>成交额 <b>{compact(item.turnover)}</b></p>
          </article>)}
          {!snapshot.sectors.length && <div className="empty-state">正在整理板块数据…</div>}
        </div>
      </section>}

      {activeView === "ideas" && <section className="ideas-section" id="ideas">
        <div className="section-title"><div><p>MULTI-STRATEGY SELECTION</p><h2>选股建议</h2></div><div className="method-note"><b>六种战法 · 每种一只</b><span>突破 · 低估 · 趋势 · 换手 · 资金 · 弹性</span></div></div>
        <div className="idea-disclaimer"><b>多战法观察名单，不是买入指令。</b> 基于 {formatTradeDate(snapshot.tradeDate)} 收盘数据，分别从六类规则中筛选；未纳入收盘后公告、隔夜消息、次日跳空等变量，任何信号都可能失效。</div>
        <div className="idea-grid">
          {snapshot.recommendations.map((item, index) => <article className="idea-card" key={item.secid}>
            <div className="idea-rank"><span>0{index + 1}</span><b>{item.score}<small>分</small></b></div>
            <div className="idea-name"><span><b>{item.name}</b><small>{item.code}</small></span><button type="button" className={isWatched(item.secid) ? "watch active" : "watch"} onClick={() => toggleWatch(item)} aria-label={isWatched(item.secid) ? `移除${item.name}自选` : `添加${item.name}自选`}>{isWatched(item.secid) ? "★" : "☆"}</button></div>
            <div className="idea-price"><b>{item.price.toFixed(2)}</b><Tone value={item.change}>{signed(item.change)}%</Tone></div>
            <div className="idea-metrics"><span>换手 <b>{item.turnoverRate.toFixed(2)}%</b></span><span>量比 <b>{item.volumeRatio.toFixed(2)}</b></span><span>PE <b>{item.pe.toFixed(1)}</b></span></div>
            <span className="style-tag">{item.style}</span>
            <ul>{item.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <p><b>主要风险：</b>{item.risks.join("、")}</p>
          </article>)}
          {!snapshot.recommendations.length && <div className="empty-state">正在生成选股建议…</div>}
        </div>
      </section>}

      {activeView === "stocks" && <section className="rank-section" id="stocks">
        <div className="section-title"><div><p>A-SHARE UNIVERSE</p><h2>个股信息</h2></div><span className="sample-note">覆盖沪深北 A 股 {allStockTotal || snapshot.totalStocks} 只</span></div>
        <div className="screener">
          {stocksLoading && <div className="stocks-loading"><b>正在载入完整 A 股行情</b><span>{stockBatchCount ? `${loadedBatches} / ${stockBatchCount} 批` : "正在准备数据"}</span><i><em style={{ width: stockBatchCount ? `${Math.max(6, loadedBatches / stockBatchCount * 100)}%` : "6%" }} /></i></div>}
          {stocksError && <div className="stocks-error"><span>{stocksError}</span><button type="button" onClick={() => { setStocksError(""); void loadAllStocks(); }}>重新加载</button></div>}
          <div className="screener-toolbar">
            <div className="mode-tabs"><button className={listMode === "market" ? "active" : ""} onClick={() => setListMode("market")}>全部 A 股</button><button className={listMode === "watchlist" ? "active" : ""} onClick={() => setListMode("watchlist")}>我的自选 <span>{watchlist.length}</span></button></div>
            <label>排序指标<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>{sortOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label>
            <button className="order-button" type="button" onClick={() => setDescending((value) => !value)}>{descending ? "从高到低 ↓" : "从低到高 ↑"}</button>
            <div className="preset-buttons"><span>快捷：</span><button onClick={() => preset("active")}>放量活跃</button><button onClick={() => preset("value")}>低估值</button><button onClick={() => preset("midcap")}>中小市值</button></div>
            <button className="reset-button" type="button" onClick={() => setFilters(emptyFilters())}>清空{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
          </div>
          <div className="filter-grid">
            {filterFields.map((field) => <label key={field.key}><span>{field.label}<i>{field.unit}</i></span><div><input type="number" step={field.step} value={filters[field.key].min} onChange={(event) => updateFilter(field.key, "min", event.target.value)} placeholder="不限" aria-label={`${field.label}最小值`} /><b>—</b><input type="number" step={field.step} value={filters[field.key].max} onChange={(event) => updateFilter(field.key, "max", event.target.value)} placeholder="不限" aria-label={`${field.label}最大值`} /></div></label>)}
          </div>
          <div className="result-bar"><b>{rankingRows.length}</b> 只符合条件 <span>当前按“{sortOptions.find((item) => item.key === sortKey)?.label}”{descending ? "降序" : "升序"} · 第 {stockPage} / {stockPageCount} 页</span></div>
          {selectedStock && <div className="history-panel">
            <div className="history-title"><div><p>60-DAY PRICE HISTORY</p><h3>{selectedStock.name} <small>{selectedStock.code}</small></h3></div><div className="history-current"><b>{selectedStock.price.toFixed(2)}</b><Tone value={selectedStock.change}>{signed(selectedStock.change)}%</Tone></div><button type="button" onClick={() => setSelectedStock(null)} aria-label="关闭历史行情">×</button></div>
            {historyLoading && <div className="history-state">正在加载近 60 个交易日行情…</div>}
            {historyError && <div className="history-state error">{historyError}</div>}
            {!!stockHistory.length && <div className="history-table-wrap"><table className="history-table"><thead><tr><th>日期</th><th>开盘</th><th>收盘</th><th>最高</th><th>最低</th><th>涨跌幅</th><th>成交量</th></tr></thead><tbody>{stockHistory.slice(0, 20).map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.open.toFixed(2)}</td><td>{row.close.toFixed(2)}</td><td>{row.high.toFixed(2)}</td><td>{row.low.toFixed(2)}</td><td><Tone value={row.change}>{signed(row.change)}%</Tone></td><td>{compact(row.volume)}</td></tr>)}</tbody></table><p>显示最近 20 条 · 接口保留近 60 个交易日</p></div>}
          </div>}
          <div className="stock-table-wrap"><table className="stock-table">
            <thead><tr><th>#</th><th>股票</th><th>收盘价</th><th>涨幅</th><th>换手率</th><th>量比</th><th>市盈率</th><th>总市值</th><th>成交额</th><th>自选</th></tr></thead>
            <tbody>{visibleRankingRows.map((item, index) => <tr key={item.secid}><td>{String((stockPage - 1) * rowsPerPage + index + 1).padStart(2, "0")}</td><td><button className="stock-name-button" type="button" onClick={() => void openStockHistory(item)}><b>{item.name}</b><small>{item.code} · 查看历史</small></button></td><td>{item.price.toFixed(2)}</td><td><Tone value={item.change}>{signed(item.change)}%</Tone></td><td>{item.turnoverRate.toFixed(2)}%</td><td>{item.volumeRatio ? item.volumeRatio.toFixed(2) : "—"}</td><td>{item.pe > 0 ? item.pe.toFixed(1) : "亏损"}</td><td>{compact(item.marketCap)}</td><td>{compact(item.turnover)}</td><td><button type="button" className={isWatched(item.secid) ? "watch active" : "watch"} onClick={() => toggleWatch(item)} aria-label={isWatched(item.secid) ? `移除${item.name}自选` : `添加${item.name}自选`}>{isWatched(item.secid) ? "★" : "☆"}</button></td></tr>)}</tbody>
          </table>{!stocksLoading && !rankingRows.length && <div className="empty-state">没有符合当前组合条件的股票，请放宽筛选范围。</div>}</div>
          {!!rankingRows.length && <div className="pagination"><button type="button" onClick={() => setStockPage(1)} disabled={stockPage === 1}>首页</button><button type="button" onClick={() => setStockPage((page) => Math.max(1, page - 1))} disabled={stockPage === 1}>上一页</button><b>{stockPage} / {stockPageCount}</b><button type="button" onClick={() => setStockPage((page) => Math.min(stockPageCount, page + 1))} disabled={stockPage === stockPageCount}>下一页</button><button type="button" onClick={() => setStockPage(stockPageCount)} disabled={stockPage === stockPageCount}>末页</button></div>}
        </div>
      </section>}

      {activeView === "news" && <section className="news-section" id="news">
        <div className="section-title"><div><p>DAILY HOT SIGNALS</p><h2>每日资讯</h2></div><div className="method-note"><b>财联社 · 新浪财经 · 同花顺</b><span>按 A 股相关性、市场焦点与时效综合排序</span></div></div>
        <div className="news-archive-bar">
          <div className="date-scroll" aria-label="历史资讯日期">{newsDays.map((day) => <button className={activeNewsDay?.tradeDate === day.tradeDate ? "active" : ""} type="button" key={day.tradeDate} onClick={() => { setSelectedNewsDate(day.tradeDate); setNewsSource("全部"); }}><b>{dateChip(day.tradeDate)}</b><small>{day.news.length} 条</small></button>)}</div>
          <div className="source-tabs" aria-label="资讯来源筛选">{newsSources.map((source) => <button className={newsSource === source ? "active" : ""} type="button" key={source} onClick={() => setNewsSource(source)}>{source}</button>)}</div>
        </div>
        <div className="news-day-title"><div><span>{activeNewsDay ? formatTradeDate(activeNewsDay.tradeDate) : "历史资讯"}</span><b>{newsSource === "全部" ? "全网热门" : newsSource}</b></div><small>{archiveLoading ? "正在读取历史归档…" : `收录 ${visibleNews.length} 条`}</small></div>
        <div className="news-list">
          {visibleNews.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={item.id}><span className="news-rank">{String(index + 1).padStart(2, "0")}</span><div><p><span>{item.category}</span>{item.source} · {dayAndTime(item.publishedAt)}</p><h3>{item.title}</h3></div><b className="heat"><i style={{ width: `${item.heat}%` }} />热度 {item.heat}</b><span className="news-arrow">↗</span></a>)}
          {!visibleNews.length && <div className="empty-state">该日期或来源暂时没有收录资讯。</div>}
        </div>
      </section>}

      <footer className="site-footer"><div><span className="brand-mark small" aria-hidden="true" /><p><b>微光</b><small>A股收盘研究台</small></p></div><p>每日 15:35 后刷新收盘价格、热门资讯与选股建议<br />资讯：财联社、新浪财经、同花顺 · 行情：腾讯公开数据</p><p>选股建议由规则模型生成，不构成投资建议<br />市场有风险，投资需谨慎</p></footer>
    </main>
  );
}
