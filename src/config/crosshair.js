/**
 * 准星配置：无畏契约同款「参数化准星」
 * 颜色 / 中心点 / 内线 / 外线 / 轮廓 / 射击扩散，均可用代码表达
 * 准星代码格式：`0;P;c;1;o;1;d;1;z;4;f;0;s;0;0t;4;0l;2;0o;1;0a;1;...`
 */

// 无畏契约 7 个预设色（近似）
export const CROSSHAIR_COLORS = [
  "#ffffff", // 1 白
  "#00ff00", // 2 绿
  "#ccff00", // 3 黄绿
  "#00ff80", // 4 青绿
  "#00ffff", // 5 青
  "#ff00ff", // 6 粉
  "#ff0000"  // 7 红
];

export const DEFAULT_CROSSHAIR = {
  color: 5,              // 1-7 预设色索引
  outline: true,         // 轮廓开关
  outlineThickness: 1,   // 1-6
  outlineOpacity: 1,     // 0-1
  centerDot: false,      // 中心点
  centerDotSize: 2,      // 0-6
  centerDotOpacity: 1,   // 0-1
  inner: { opacity: 1, length: 6, thickness: 2, offset: 2, firingError: false },
  outer: { opacity: 0, length: 2, thickness: 2, offset: 9, firingError: false },
  fadeFiringError: true  // 开火时扩散淡化
};

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

/* ---------- 准星配置持久化（localStorage） ---------- */
const STORE_KEY = "preaim.crosshair.v1";

/** 读取保存的准星配置；无则返回默认 */
export function loadCrosshair() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // 与默认配置合并，避免旧存档缺字段
    return deepClone({ ...deepClone(DEFAULT_CROSSHAIR), ...saved, inner: { ...DEFAULT_CROSSHAIR.inner, ...saved.inner }, outer: { ...DEFAULT_CROSSHAIR.outer, ...saved.outer } });
  } catch (e) {
    return null;
  }
}

/** 保存准星配置 */
export function saveCrosshair(cfg) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
  } catch (e) {
    /* 存储不可用（隐私模式等）时静默 */
  }
}

/** 清除保存的准星配置 */
export function clearCrosshair() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch (e) {}
}

const KNOWN_KEYS = new Set([
  "c", "h", "d", "z", "a", "m", "f", "s", "t", "o",
  "0t", "0l", "0o", "0a", "0m", "0f",
  "1t", "1l", "1o", "1a", "1m", "1f"
]);

const clampInt = (v, min, max) => Math.min(max, Math.max(min, parseInt(v, 10) || 0));

/** 解析无畏契约准星代码 → 配置对象 */
export function parseCrosshairCode(code) {
  const cfg = deepClone(DEFAULT_CROSSHAIR);
  const parts = String(code).split(";").map((p) => p.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i];
    if (!KNOWN_KEYS.has(k)) continue; // 跳过 "0"、"P" 前缀与未知键
    const v = parts[i + 1];
    i++;
    switch (k) {
      case "c": cfg.color = clampInt(v, 1, 7); break;
      case "h": cfg.customOn = v === "1"; break;
      case "d": cfg.centerDot = v === "1"; break;
      case "z": cfg.centerDotSize = clampInt(v, 0, 6); break;
      case "a": cfg.centerDotOpacity = clampInt(v, 0, 10) / 10; break;
      case "f": cfg.fadeFiringError = v === "1"; break;
      case "s": cfg.outline = v === "1"; break;
      case "t": cfg.outlineThickness = clampInt(v, 1, 6); break;
      case "o": cfg.outlineOpacity = clampInt(v, 0, 10) / 10; break;
      case "0t": cfg.inner.opacity = clampInt(v, 0, 10) / 10; break;
      case "0l": cfg.inner.length = clampInt(v, 0, 10); break;
      case "0o": cfg.inner.offset = clampInt(v, 0, 10); break;
      case "0a": cfg.inner.thickness = clampInt(v, 1, 10); break;
      case "0f": cfg.inner.firingError = v === "1"; break;
      case "1t": cfg.outer.opacity = clampInt(v, 0, 10) / 10; break;
      case "1l": cfg.outer.length = clampInt(v, 0, 10); break;
      case "1o": cfg.outer.offset = clampInt(v, 0, 10); break;
      case "1a": cfg.outer.thickness = clampInt(v, 1, 10); break;
      case "1f": cfg.outer.firingError = v === "1"; break;
      default: break;
    }
  }
  return cfg;
}

/** 导出准星代码 */
export function exportCrosshairCode(cfg) {
  const i = cfg.inner, o = cfg.outer;
  return [
    "0", "P",
    "c", cfg.color,
    "h", cfg.customOn ? 1 : 0,
    "d", cfg.centerDot ? 1 : 0,
    "z", cfg.centerDotSize,
    "a", Math.round(cfg.centerDotOpacity * 10),
    "f", cfg.fadeFiringError ? 1 : 0,
    "s", cfg.outline ? 1 : 0,
    "t", cfg.outlineThickness,
    "o", Math.round(cfg.outlineOpacity * 10),
    "0t", Math.round(i.opacity * 10),
    "0l", i.length,
    "0o", i.offset,
    "0a", i.thickness,
    "0f", i.firingError ? 1 : 0,
    "1t", Math.round(o.opacity * 10),
    "1l", o.length,
    "1o", o.offset,
    "1a", o.thickness,
    "1f", o.firingError ? 1 : 0
  ].join(";");
}

export function crosshairColor(cfg) {
  return CROSSHAIR_COLORS[cfg.color - 1] || "#00ffff";
}
