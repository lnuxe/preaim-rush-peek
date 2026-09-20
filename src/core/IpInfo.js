/**
 * 公网 IP 与归属地识别（纯前端，零后端依赖）
 * 多 provider 容错 + localStorage 缓存（24h），全部失败时回退到「本机」标识
 */
const CACHE_KEY = "preaim.ipinfo.v1";
const TTL = 24 * 3600 * 1000;

const PROVIDERS = [
  () => fetch("https://ipwho.is/").then((r) => r.json()),
  () => fetch("https://ipapi.co/json/").then((r) => r.json()),
  () => fetch("https://api.ip.sb/geoip").then((r) => r.json())
];

/** 归一化 provider 返回值 → { ip, loc }；不合法返回 null */
function normalize(d) {
  if (!d || typeof d !== "object") return null;
  const ip = d.ip || d.query || "";
  if (!ip) return null;
  const country = d.country || d.country_name || "";
  const region = d.region || "";
  const city = d.city || "";
  const loc = [country, region, city].filter(Boolean).join(" · ") || "未知";
  return { ip, loc };
}

export async function getIpInfo() {
  // 1) 命中缓存
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.ts && Date.now() - c.ts < TTL && c.data && c.data.ip) return c.data;
    }
  } catch (e) { /* 存储不可用时忽略 */ }

  // 2) 依次尝试多个免费 IP 服务
  for (const p of PROVIDERS) {
    try {
      const data = normalize(await p());
      if (!data) continue;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
      return data;
    } catch (e) { /* 该 provider 失败，尝试下一个 */ }
  }

  // 3) 兜底：无法识别时返回空标识（榜单不参与 IP 去重）
  return { ip: "", loc: "本机" };
}
