import { AGENTS } from "../config/agents.js";

/** 2D 模式懒加载注入的 PIXI 模块；3D 模式不注入即不加载 pixi.js */
let PIXI = null;

/**
 * 特工头像库
 * 基于 29 名官方特工名单，默认生成「主题色 + 名字缩写」剪影（规避版权），
 * 若 public/agents/{id}.png 存在则自动加载为官方头像。
 * 支持上传自定义透明 PNG 立绘。
 */

const BASE = import.meta.env.BASE_URL || "./";

/** 生成一张特工剪影（离屏 Canvas）：主题色圆底 + 名字缩写 + 定位色条 */
function drawSilhouette(agent) {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 96;
  const g = c.getContext("2d");

  // 圆形底
  g.fillStyle = agent.color;
  g.beginPath();
  g.arc(48, 48, 44, 0, Math.PI * 2);
  g.fill();

  // 顶部弧面高光
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.beginPath();
  g.arc(48, 44, 38, Math.PI, Math.PI * 2);
  g.fill();

  // 底部定位色条
  g.fillStyle = agent.accent;
  g.fillRect(12, 82, 72, 5);

  // 名字缩写（KAY/O → KA，其余取前两字母）
  const abbr = agent.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.font = "bold 32px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(abbr, 48, 50);

  return c;
}

/** 尝试加载官方头像 public/agents/{id}.png，失败返回 null；加载后缩放到 256px 内控制显存 */
function loadPortrait(id) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (img.naturalWidth <= 0) return resolve(null);
      const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = BASE + "agents/" + id + ".png";
  });
}

export class Agents {
  constructor() {
    this.items = [];
  }

  /** 异步初始化：逐特工尝试加载官方头像，失败回退剪影 */
  async init() {
    this.items = await Promise.all(
      AGENTS.map(async (a) => {
        const img = await loadPortrait(a.id);
        const source = img || drawSilhouette(a);
        return {
          ...a,
          custom: false,
          official: !!img,
          source,
          texture: null
        };
      })
    );
  }

  addCustom(img, name) {
    const item = {
      id: "custom-" + Date.now(),
      name: name || "Custom",
      nameZh: name || "自定义",
      custom: true,
      official: false,
      color: "#ffffff",
      accent: "#ffffff",
      source: img,
      texture: null
    };
    this.items.push(item);
    return item;
  }

  remove(id) {
    this.items = this.items.filter((i) => i.id !== id);
  }

  /** 注册 PIXI 模块（2D 模式动态 import 后注入；3D 模式不注入即不加载 pixi.js） */
  static setPixi(pixi) { PIXI = pixi; }

  /** 惰性生成 PIXI.Texture：仅在 2D 渲染真正用到时才创建 */
  textureFor(item) {
    if (!item.texture && item.source && PIXI) {
      item.texture = PIXI.Texture.from(item.source);
    }
    return item.texture;
  }

  random() {
    if (!this.items.length) return null;
    return this.items[Math.floor(Math.random() * this.items.length)];
  }
}
