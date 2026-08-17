type SinaTag = { id?: string; name?: string };
type SinaFeed = { id?: number; rich_text?: string; create_time?: string; ext?: string; tag?: SinaTag[] };

const feedUrl = (tag: number) => `https://zhibo.sina.com.cn/api/zhibo/feed?callback=&page=1&page_size=20&zhibo_id=152&tag_id=${tag}&dire=f&dpc=1`;

function cleanText(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function category(tags: SinaTag[] = [], title = "") {
  const names = tags.map((tag) => tag.name);
  if (names.includes("公司") || /公司|业绩|回购|增持|减持|重组/.test(title)) return "公司";
  if (/政策|央行|证监|监管|国务院|交易所/.test(title)) return "政策";
  if (/板块|行业|科技|消费|医药|金融|能源/.test(title)) return "行业";
  return "市场";
}

export async function GET() {
  try {
    const responses = await Promise.all([10, 3].map((tag) => fetch(feedUrl(tag), { headers: { Accept: "application/json", Referer: "https://finance.sina.com.cn/7x24/", "User-Agent": "Mozilla/5.0" } })));
    if (responses.some((response) => !response.ok)) throw new Error("News feed unavailable");
    const payloads = await Promise.all(responses.map((response) => response.json() as Promise<{ result?: { data?: { feed?: { list?: SinaFeed[] } } } }>));
    const rows = payloads.flatMap((payload) => payload.result?.data?.feed?.list ?? []).filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index).sort((a, b) => String(b.create_time).localeCompare(String(a.create_time))).slice(0, 20);
    const items = rows.map((row, index) => {
      const title = cleanText(row.rich_text ?? "").replace(/^【([^】]+)】\s*/, "$1：");
      let url = "https://finance.sina.com.cn/7x24/";
      try { url = String((JSON.parse(row.ext ?? "{}") as { docurl?: string }).docurl ?? url); } catch { /* Keep the live-feed link. */ }
      const published = row.create_time ? `${row.create_time.replace(" ", "T")}+08:00` : new Date().toISOString();
      return { id: String(row.id ?? index), title, source: "新浪财经", category: category(row.tag, title), url, publishedAt: new Date(published).toISOString() };
    }).filter((item) => item.title);
    return Response.json({ items, updatedAt: new Date().toISOString(), stale: false }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=1800" } });
  } catch {
    return Response.json({ items: [{ id: "fallback-1", title: "A股市场资讯暂时无法连接，请稍后刷新", source: "盘面", category: "市场", url: "https://finance.sina.com.cn/stock/", publishedAt: new Date().toISOString() }], updatedAt: new Date().toISOString(), stale: true }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
