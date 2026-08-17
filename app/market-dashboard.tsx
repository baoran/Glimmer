"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type IndexQuote = { name: string; code: string; secid: string; price: number; change: number; changeAmount: number; high: number; low: number; open: number; previousClose: number; volume: number };
type StockQuote = { name: string; code: string; secid: string; price: number; change: number; changeAmount: number; volume: number; turnover: number; turnoverRate: number; volumeRatio: number; pe: number; high: number; low: number; open: number; previousClose: number; marketCap: number; floatMarketCap: number };
type Recommendation = StockQuote & { score: number; style: string; reasons: string[]; risks: string[] };
type NewsItem = { id: string; title: string; source: string; category: string; url: string; publishedAt: string; heat: number };
type DailySnapshot = {
  tradeDate: string; generatedAt: string; nextRefreshAt: string; status: "final" | "provisional";
  indices: IndexQuote[]; sectors: Array<{ name: string; code: string; price: number; change: number }>;
  totalStocks: number; universe: StockQuote[]; recommendations: Recommendation[]; news: NewsItem[];
  summary: { averageIndexChange: number; positiveIndices: number; topSector: string; sampleSize: number };
};

type SortKey = "change" | "turnoverRate" | "volumeRatio" | "pe" | "price" | "marketCap" | "turnover";
type FilterKey = Exclude<SortKey, "turnover">;
type Range = { min: string; max: string };
type Theme = "light" | "dark";

const placeholderIndices: IndexQuote[] = [
  { name: "上证指数", code: "000001", secid: "sh000001", price: 3982.65, change: 1.41, changeAmount: 55.47, high: 3983.51, low: 3924.47, open: 3930.1, previousClose: 3927.18, volume: 706246394459 },
  { name: "深证成指", code: "399001", secid: "sz399001", price: 14704.27, change: 2.44, changeAmount: 349.96, high: 14704.55, low: 14348.47, open: 14399.2, previousClose: 14354.31, volume: 465109058625 },
  { name: "创业板指", code: "399006", secid: "sz399006", price: 3246.8, change: 3.07, changeAmount: 96.66, high: 3249.2, low: 3138.5, open: 3155.1, previousClose: 3150.14, volume: 208700000000 },
  { name: "沪深300", code: "000300", secid: "sh000300", price: 4588.23, change: 1.73, changeAmount: 78.1, high: 4591.2, low: 4512.1, open: 4520.2, previousClose: 4510.1, volume: 192000000000 },
  { name: "科创50", code: "000688", secid: "sh000688", price: 1324.18, change: 2.86, changeAmount: 36.8, high: 1328.3, low: 1280.5, open: 1288.6, previousClose: 1287.38, volume: 88000000000 },
];

const initialSnapshot: DailySnapshot = {
  tradeDate: "2026-08-17", generatedAt: new Date().toISOString(), nextRefreshAt: new Date(Date.now() + 86400000).toISOString(), status: "provisional",
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
    const source = listMode === "market" ? snapshot.universe : watchlist;
    const metricValue = (stock: StockQuote, key: SortKey) => stock[key];
    return source.filter((stock) => filterFields.every(({ key }) => {
      const raw = key === "marketCap" ? stock.marketCap / 1e8 : stock[key];
      const minimum = filters[key].min === "" ? -Infinity : Number(filters[key].min);
      const maximum = filters[key].max === "" ? Infinity : Number(filters[key].max);
      return raw >= minimum && raw <= maximum;
    })).sort((a, b) => (metricValue(a, sortKey) - metricValue(b, sortKey)) * (descending ? -1 : 1));
  }, [snapshot.universe, watchlist, listMode, filters, sortKey, descending]);

  const updateFilter = (key: FilterKey, side: keyof Range, value: string) => setFilters((current) => ({ ...current, [key]: { ...current[key], [side]: value } }));
  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("panmian-theme", nextTheme);
    setTheme(nextTheme);
  };
  const preset = (name: "active" | "value" | "midcap") => {
    const next = emptyFilters();
    if (name === "active") { next.change.min = "1"; next.turnoverRate.min = "3"; next.volumeRatio.min = "1.2"; }
    if (name === "value") { next.pe.min = "1"; next.pe.max = "30"; next.marketCap.min = "100"; }
    if (name === "midcap") { next.marketCap.min = "30"; next.marketCap.max = "300"; next.price.min = "5"; }
    setFilters(next);
  };

  return (
    <main className="site-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="盘面首页"><span className="brand-mark">盘</span><span>盘面</span><span className="brand-tag">A股收盘研究台</span></a>
        <nav className="nav" aria-label="主导航"><a href="#market">总览</a><a href="#ideas">选股建议</a><a href="#rankings">筛选榜单</a><a href="#news">每日热讯</a></nav>
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

      <section className="overview" id="market">
        <div className="section-title compact-title"><div><p>DAILY MARKET CLOSE</p><h1>收盘总览</h1></div><span>每日 15:35 后更新 · 盘中保留上一交易日定稿</span></div>
        <div className="summary-grid">
          <article><span>核心指数红盘</span><b>{snapshot.summary.positiveIndices}<small> / {snapshot.indices.length}</small></b><em>市场广度</em></article>
          <article><span>指数平均涨跌</span><Tone value={snapshot.summary.averageIndexChange}><b>{signed(snapshot.summary.averageIndexChange)}<small>%</small></b></Tone><em>等权口径</em></article>
          <article><span>最强行业指数</span><b className="text-value">{snapshot.summary.topSector}</b><em>按收盘涨幅</em></article>
          <article><span>筛选样本池</span><b>{snapshot.summary.sampleSize}<small> 只</small></b><em>活跃与高关注股票</em></article>
        </div>
        <div className="indices">
          {snapshot.indices.map((item) => <article className="index-card" key={item.secid}>
            <div className="index-head"><span>{item.name}<small>{item.code}</small></span><Tone value={item.change}>{signed(item.change)}%</Tone></div>
            <div className="index-price"><b>{item.price.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</b><small><Tone value={item.changeAmount}>{signed(item.changeAmount)}</Tone></small></div>
            <div className={`micro-chart ${item.change < 0 ? "negative" : ""}`} aria-hidden="true">{bars(item.code, item.change >= 0).map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
            <div className="index-foot"><span>高 {item.high.toFixed(2)}</span><span>低 {item.low.toFixed(2)}</span><span>{compact(item.volume)}</span></div>
          </article>)}
        </div>
        <div className="sector-tape"><b>强势行业</b>{snapshot.sectors.map((item, index) => <span key={item.code}><i>{index + 1}</i>{item.name}<Tone value={item.change}>{signed(item.change)}%</Tone></span>)}</div>
      </section>

      <section className="ideas-section" id="ideas">
        <div className="section-title"><div><p>STOCK SELECTION</p><h2>选股建议</h2></div><div className="method-note"><b>六因子量化初筛</b><span>涨幅 · 换手率 · 量比 · 成交额 · 市盈率 · 市值</span></div></div>
        <div className="idea-disclaimer"><b>观察名单，不是买入指令。</b> 基于 {formatTradeDate(snapshot.tradeDate)} 收盘数据生成；未纳入收盘后公告、隔夜消息、次日跳空等变量，任何信号都可能失效。</div>
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
      </section>

      <section className="rank-section" id="rankings">
        <div className="section-title"><div><p>MARKET SCREENER</p><h2>多指标榜单</h2></div><span className="sample-note">覆盖当日高关注与活跃样本 {snapshot.universe.length} 只</span></div>
        <div className="screener">
          <div className="screener-toolbar">
            <div className="mode-tabs"><button className={listMode === "market" ? "active" : ""} onClick={() => setListMode("market")}>市场样本</button><button className={listMode === "watchlist" ? "active" : ""} onClick={() => setListMode("watchlist")}>我的自选 <span>{watchlist.length}</span></button></div>
            <label>排序指标<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>{sortOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label>
            <button className="order-button" type="button" onClick={() => setDescending((value) => !value)}>{descending ? "从高到低 ↓" : "从低到高 ↑"}</button>
            <div className="preset-buttons"><span>快捷：</span><button onClick={() => preset("active")}>放量活跃</button><button onClick={() => preset("value")}>低估值</button><button onClick={() => preset("midcap")}>中小市值</button></div>
            <button className="reset-button" type="button" onClick={() => setFilters(emptyFilters())}>清空{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
          </div>
          <div className="filter-grid">
            {filterFields.map((field) => <label key={field.key}><span>{field.label}<i>{field.unit}</i></span><div><input type="number" step={field.step} value={filters[field.key].min} onChange={(event) => updateFilter(field.key, "min", event.target.value)} placeholder="不限" aria-label={`${field.label}最小值`} /><b>—</b><input type="number" step={field.step} value={filters[field.key].max} onChange={(event) => updateFilter(field.key, "max", event.target.value)} placeholder="不限" aria-label={`${field.label}最大值`} /></div></label>)}
          </div>
          <div className="result-bar"><b>{rankingRows.length}</b> 只符合条件 <span>当前按“{sortOptions.find((item) => item.key === sortKey)?.label}”{descending ? "降序" : "升序"}</span></div>
          <div className="stock-table-wrap"><table className="stock-table">
            <thead><tr><th>#</th><th>股票</th><th>收盘价</th><th>涨幅</th><th>换手率</th><th>量比</th><th>市盈率</th><th>总市值</th><th>成交额</th><th>自选</th></tr></thead>
            <tbody>{rankingRows.slice(0, 30).map((item, index) => <tr key={item.secid}><td>{String(index + 1).padStart(2, "0")}</td><td><b>{item.name}</b><small>{item.code}</small></td><td>{item.price.toFixed(2)}</td><td><Tone value={item.change}>{signed(item.change)}%</Tone></td><td>{item.turnoverRate.toFixed(2)}%</td><td>{item.volumeRatio ? item.volumeRatio.toFixed(2) : "—"}</td><td>{item.pe > 0 ? item.pe.toFixed(1) : "亏损"}</td><td>{compact(item.marketCap)}</td><td>{compact(item.turnover)}</td><td><button type="button" className={isWatched(item.secid) ? "watch active" : "watch"} onClick={() => toggleWatch(item)} aria-label={isWatched(item.secid) ? `移除${item.name}自选` : `添加${item.name}自选`}>{isWatched(item.secid) ? "★" : "☆"}</button></td></tr>)}</tbody>
          </table>{!rankingRows.length && <div className="empty-state">没有符合当前组合条件的股票，请放宽筛选范围。</div>}</div>
        </div>
      </section>

      <section className="news-section" id="news">
        <div className="section-title"><div><p>DAILY HOT SIGNALS</p><h2>每日热门快讯</h2></div><div className="method-note"><b>每日收盘后定稿</b><span>按 A 股相关性、焦点标签、互动与时效综合排序</span></div></div>
        <div className="news-list">
          {snapshot.news.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={item.id}><span className="news-rank">{String(index + 1).padStart(2, "0")}</span><div><p><span>{item.category}</span>{item.source} · {dayAndTime(item.publishedAt)}</p><h3>{item.title}</h3></div><b className="heat"><i style={{ width: `${item.heat}%` }} />热度 {item.heat}</b><span className="news-arrow">↗</span></a>)}
          {!snapshot.news.length && <div className="empty-state">正在汇总今日热门资讯…</div>}
        </div>
      </section>

      <footer className="site-footer"><div><span className="brand-mark small">盘</span><p><b>盘面</b><small>A股收盘研究台</small></p></div><p>每日 15:35 后刷新收盘价格、热门资讯与选股建议<br />行情与资讯来自新浪财经、腾讯行情公开数据</p><p>选股建议由规则模型生成，不构成投资建议<br />市场有风险，投资需谨慎</p></footer>
    </main>
  );
}
