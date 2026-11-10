// 방문·클릭 기록. 원본 IP는 저장하지 않고, 하루 단위로 바뀌는 해시만 남겨요.
import { getStore } from "@netlify/blobs";

const kstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
}

function device(ua) {
  if (/iPad|Tablet/i.test(ua)) return "태블릿";
  if (/Mobi|Android|iPhone/i.test(ua)) return "모바일";
  return "PC";
}

function inApp(ua) {
  if (/KAKAOTALK/i.test(ua)) return "카카오톡";
  if (/NAVER\(inapp/i.test(ua)) return "네이버앱";
  if (/Instagram/i.test(ua)) return "인스타그램";
  if (/FBAN|FBAV/i.test(ua)) return "페이스북";
  if (/Line\//i.test(ua)) return "라인";
  return "";
}

function source(ref, utm, ua) {
  if (utm) return utm.slice(0, 40);
  const app = inApp(ua);
  if (app) return app;
  if (!ref) return "직접 방문";
  let h = "";
  try { h = new URL(ref).hostname.replace(/^www\.|^m\./, ""); } catch { return "기타"; }
  const map = [
    [/dcinside/, "디시인사이드"], [/fmkorea/, "에펨코리아"], [/ruliweb/, "루리웹"],
    [/theqoo/, "더쿠"], [/clien/, "클리앙"], [/ppomppu/, "뽐뿌"], [/instiz/, "인스티즈"],
    [/^(x\.com|twitter\.com|t\.co)$/, "X(트위터)"], [/threads/, "스레드"],
    [/naver/, "네이버"], [/daum|kakao/, "다음·카카오"], [/google/, "구글"],
    [/youtube|youtu\.be/, "유튜브"], [/facebook/, "페이스북"], [/instagram/, "인스타그램"],
    [/netlify\.app$|xn--6e0bp5jfrh13nusovma\.kr$/, "사이트 내부"],
  ];
  for (const [re, name] of map) if (re.test(h)) return name;
  return h.slice(0, 40);
}

export default async (req, context) => {
  if (req.method !== "POST") return new Response("", { status: 405 });
  let body = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const ua = req.headers.get("user-agent") || "";
  if (/bot|crawl|spider|slurp|preview|headless/i.test(ua)) return new Response("", { status: 204 });
  const day = kstDate();
  const visitor = await sha(`${context.ip || ""}|${ua}|${day}|usfk`);
  const ev = {
    t: Date.now(),
    type: body.type === "click" ? "click" : "view",
    name: typeof body.name === "string" ? body.name.slice(0, 40) : "",
    v: visitor,
    src: source(body.ref || "", body.utm || "", ua),
    dev: device(ua),
    cc: context.geo?.country?.name || context.geo?.country?.code || "알 수 없음",
    city: context.geo?.city || "",
  };
  const store = getStore({ name: "stats", consistency: "strong" });
  await store.setJSON(`ev/${day}/${ev.t}-${Math.random().toString(36).slice(2, 8)}`, ev);
  return new Response("", { status: 204 });
};

export const config = { path: "/api/track" };
