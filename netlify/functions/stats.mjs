// 관리자 통계. Netlify 환경변수 ADMIN_PASSWORD 와 같은 비밀번호로만 열려요.
import { getStore } from "@netlify/blobs";

const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

function emptyDay() { return { views: 0, visitors: [], clicks: {}, src: {}, dev: {}, cc: {}, hours: Array(24).fill(0) }; }

async function buildDay(store, day) {
  const agg = emptyDay();
  const seen = new Set();
  const { blobs } = await store.list({ prefix: `ev/${day}/` });
  const evs = await Promise.all(blobs.map(b => store.get(b.key, { type: "json" }).catch(() => null)));
  for (const e of evs) {
    if (!e) continue;
    if (e.type === "click") { agg.clicks[e.name] = (agg.clicks[e.name] || 0) + 1; continue; }
    agg.views++;
    const h = new Date(e.t + 9 * 3600e3).getUTCHours(); agg.hours[h]++;
    if (seen.has(e.v)) continue;
    seen.add(e.v);
    agg.src[e.src] = (agg.src[e.src] || 0) + 1;
    agg.dev[e.dev] = (agg.dev[e.dev] || 0) + 1;
    agg.cc[e.cc] = (agg.cc[e.cc] || 0) + 1;
  }
  agg.visitors = [...seen];
  return agg;
}

export default async (req) => {
  const pw = process.env.ADMIN_PASSWORD;
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!pw) return Response.json({ error: "no_password" }, { status: 503 });
  if (auth !== pw) {
    await new Promise(r => setTimeout(r, 600));
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const range = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10)));
  const store = getStore({ name: "stats", consistency: "strong" });
  const today = kst(Date.now());
  const days = [];
  for (let i = range - 1; i >= 0; i--) days.push(kst(Date.now() - i * 86400e3));

  const out = [];
  for (const d of days) {
    let agg = null;
    if (d !== today) agg = await store.get(`agg/${d}`, { type: "json" }).catch(() => null);
    if (!agg) {
      agg = await buildDay(store, d);
      if (d !== today) await store.setJSON(`agg/${d}`, agg);
    }
    out.push({ date: d, ...agg });
  }

  const sum = (list, key) => {
    const m = {};
    for (const x of list) for (const [k, v] of Object.entries(x[key] || {})) m[k] = (m[k] || 0) + v;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const last = (n) => out.slice(-n);
  const hours = Array(24).fill(0);
  for (const x of last(7)) (x.hours || []).forEach((v, i) => hours[i] += v);

  return Response.json({
    today: { date: today, visitors: out.at(-1).visitors.length, views: out.at(-1).views },
    week: { visitors: last(7).reduce((a, x) => a + x.visitors.length, 0), views: last(7).reduce((a, x) => a + x.views, 0) },
    month: { visitors: out.reduce((a, x) => a + x.visitors.length, 0), views: out.reduce((a, x) => a + x.views, 0) },
    daily: out.map(x => ({ date: x.date, visitors: x.visitors.length, views: x.views })),
    sources: sum(out, "src"),
    devices: sum(out, "dev"),
    countries: sum(out, "cc"),
    clicks: sum(out, "clicks"),
    todaySources: sum(last(1), "src"),
    hours,
    range,
  }, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/stats" };
