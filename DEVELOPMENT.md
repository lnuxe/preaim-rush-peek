# PREAIM · Rush Peek — 开发文档

> 无畏契约（VALORANT）风格瞄准训练器。纯前端，Vite + PixiJS 8。
> 本文档是「无畏契约味增强」迭代的开发依据，覆盖需求、素材、数据规范与验收标准。

---

## 1. 项目概述

**目标**：在现有 Rush Peek 训练器（单目标 / 对侧刷新 / 60s 计时 / Ghost 预览）基础上，叠加「无畏契约味」增强，让射击目标、准星、音效更贴近 VALORANT 手感。

**核心玩法（PRD §4，保持不变）**
- 场上永远只有 1 个可击杀目标
- 击杀即刷新，对侧刷新 + 左右严格交替
- 单击击杀，打空触发惩罚性重刷新
- 单局 60 秒，Ghost 态（0.28s）预瞄提示

---

## 2. 技术栈与架构

| 层 | 技术 | 说明 |
|----|------|------|
| 构建 | Vite 5 | `base: "./"`，产物 `dist/` |
| 渲染 | PixiJS 8.6 | WebGL，2D 场景 |
| 音效 | Web Audio API | 合成音效，可选 MP3 覆盖 |
| 语言 | 原生 ES Module | 无框架、无运行时依赖 |

**目录结构**
```
rush/
├── DEVELOPMENT.md          # 本文档
├── index.html              # 结构（菜单 / HUD / 结算 / 设置）
├── style.css               # 主题样式
├── vite.config.js
├── public/                 # 静态素材（用户自备，见 §4）
│   ├── agents/{id}.png     # 官方特工头像（可选覆盖）
│   └── sounds/*.mp3        # 真实音效（可选覆盖）
└── src/
    ├── main.js             # 入口：初始化 PixiJS + 输入绑定
    ├── config/
    │   ├── agents.js       # 29 名特工名单数据（新增）
    │   ├── scenes.js       # 场景配置
    │   ├── crosshair.js    # 参数化准星 + 代码导入
    │   └── i18n.js         # 中英双语
    ├── core/
    │   ├── Game.js         # 状态机 + 主循环 + 射击判定
    │   ├── Target.js       # 目标逻辑（纯逻辑）
    │   ├── Agents.js       # 特工头像库（剪影 / 官方图 / 上传）
    │   ├── Room.js         # 房间渲染
    │   └── Crosshair.js    # 准星渲染
    ├── audio/Sound.js      # 音效（MP3 优先，合成兜底）
    └── ui/UI.js            # DOM UI 绑定
```

---

## 3. 需求清单（累计 7 项）

| # | 需求 | 状态 | 落地说明 |
|---|------|------|---------|
| 1 | 击杀/爆头/连杀音效 | ✅ 已实现 | `Sound.js` 支持 `public/sounds/*.mp3`，缺省合成兜底 |
| 2 | 射击目标切换为特工 2D 头像 | ✅ 已实现 | 29 名官方头像已内置，支持上传自定义 |
| 3 | 参数化准星 + 导入职业代码 | ✅ 已完成 | `crosshair.js`（`0;P;c;1;...`） |
| 4 | 图片转 2D / 3D 开源方案 | 📋 调研 | rembg / TripoSR / Shap-E / img2threejs |
| 5 | 全部特工头像（官方获取） | ✅ 已实现 | 已从 valorant-api.com 下载 29 名头像到 `public/agents/` |
| 6 | 击杀音效对应具体事件 | ✅ 已实现 | 击杀 / 爆头 / 连杀 / miss / 局末 分轨 |
| 7 | 2D / 3D 模式 + three.js | ✅ 已实现 | 3D 模式：真 3D 房间 + billboard 特工 + 射线命中（`?mode=3d`） |

---

## 4. 素材方案与版权说明

> ⚠️ **版权**：VALORANT 特工立绘、头像、音效均为 Riot Games 版权素材。
> 官方 Asset Kit 允许「内容创作 / 个人使用」，**禁止商业分发**。
> 因此本项目**不内置任何版权素材**，改为「本地覆盖」机制：放入即生效，不放则用程序化兜底。

### 4.1 特工头像

**已内置**：29 名官方特工头像已下载到 `public/agents/{id}.png`（来源 valorant-api.com，官方资源镜像，透明半身像）。运行时自动加载并缩放到 256px 控制显存；文件缺失则回退「主题色剪影 + 名字缩写」。

**来源**：`valorant-api.com/v1/agents`（社区维护的官方资源镜像）。如需替换/补充，可用官方 Asset Kit 或 `wiki.biligame.com/valorant` 高清 PNG 覆盖同名文件。

### 4.2 音效

**社区素材站（用户自备，放入 `public/sounds/`）**
- 爱给网 `aigei.com`（「瓦罗兰特」分类）
- `yiuios.com`（特效皮肤击杀音效合集）、淘声网 `tosound.com`

**文件约定**
| 文件 | 触发时机 |
|------|---------|
| `sounds/kill.mp3` | 普通击杀 |
| `sounds/headshot.mp3` | 爆头（命中目标中心区） |
| `sounds/multikill.mp3` | 连杀 ≥2 |
| `sounds/miss.mp3` | 打空 |
| `sounds/end.mp3` | 单局结束 |

缺省时自动回退 Web Audio 合成音效，保证零资源也能运行。

---

## 5. 数据规范

### 5.1 特工名单 `src/config/agents.js`

```js
export const AGENTS = [
  {
    id: "jett",           // 唯一 id，小写英文，对应 public/agents/jett.png
    name: "Jett",         // 英文名
    nameZh: "捷风",       // 中文名
    role: "duelist",      // controller | sentinel | initiator | duelist
    roleZh: "决斗",       // 中文定位
    color: "#5ad9ff",     // 主题色（剪影主色）
    accent: "#bff0ff"     // 主题亮色（剪影高光）
  },
  // ... 共 29 名
];
```

### 5.2 音效模块 `src/audio/Sound.js`

接口不变（`playKill / playHeadshot / playMultiKill / playMiss / playEnd`），内部：
1. 初始化时尝试 `fetch` 对应 MP3 → `decodeAudioData` 缓存
2. 命中时优先播放缓存 MP3；无缓存则回退合成音效

---

## 6. 3D 模式（three.js，已实现）

**实现**：`src/three/Game3D.js`，通过 URL `?mode=3d` 进入（菜单「2D / 3D」按钮切换）。

- **渲染**：three.js 真 3D 训练房（地板网格 + 四面墙 + 雾效）+ 第一人称透视相机
- **目标**：billboard 特工立绘（`CanvasTexture` 贴头像）或圆形，Ghost 态半透明 + 青色
- **命中**：`Raycaster` 射线检测（鼠标 NDC → 相机射线 → 目标平面相交）
- **准星**：2D Canvas 覆盖层，复用参数化准星配置

**遗留（可选进阶）**：真 3D 人物模型仍需外部资源，可用 `img2threejs`（Apache 2.0）单图生成程序化模型，或 TripoSR / Shap-E 生成 GLB 后导入。

---

## 7. 验收标准

- [x] 特工模式下，目标在 29 名官方特工头像中随机轮换
- [x] 29 名官方头像已内置（`public/agents/`），缺失文件回退剪影
- [x] 放入 `public/sounds/*.mp3` 后，击杀/爆头/连杀/miss/局末分别播放真实音效
- [x] 无任何素材文件时，项目仍完整可玩（剪影 + 合成音效兜底）
- [x] 准星参数化 + 职业代码导入
- [x] 3D 模式（`?mode=3d`）：真 3D 房间 + billboard 特工 + 射线命中
