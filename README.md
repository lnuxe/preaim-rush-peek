# PREAIM Rush Peek

无畏契约（VALORANT）风格瞄准训练器 —— 专注「击杀 → 转火 → 再击杀」的 rush 抗压与快速补枪训练。

纯前端实现（Vite 5 + PixiJS 8 + Three.js），无后端、无框架、无运行时依赖，构建产物可直接静态部署。

## 特性

- **Rush 抗压核心 loop**：场上永远只有 1 个可击杀目标，击杀后立即在对侧刷新，左右严格交替
- **2D / 3D 双模式**：2D 几何房间 + 3D 真三维训练房（`?mode=3d`），射线命中判定
- **29 名特工头像**：击杀目标随机轮换官方特工立绘，支持上传自定义头像
- **参数化准星**：支持导入职业准星代码（`0;P;c;1;...`）
- **分轨音效**：击杀 / 爆头 / 连杀 / miss / 局末独立音轨，MP3 缺省自动回退合成音效
- **3D 特工模型**：TripoSR 顶点着色 OBJ，生产构建自动 gzip 压缩

## 玩法

| 规则 | 说明 |
|------|------|
| 目标数量 | 场上同时只有 1 个可击杀目标 |
| 刷新 | 击杀即刷新，对侧刷新 + 左右严格交替 |
| 击杀判定 | 单击击杀，打空触发惩罚性重刷新 |
| 时长 | 单局 60 秒，Ghost 态（0.28s）预瞄提示 |

## 快速开始

### 开发环境

```bash
npm install
npm run dev        # http://localhost:5173
```

### 生产构建

```bash
npm run build      # vite build + 压缩 OBJ 为 .obj.gz
npm run preview    # 本地预览构建产物
```

构建产物输出到 `dist/`，可部署到任意静态服务器：

```bash
python3 -m http.server 5173 --directory dist
```

## 目录结构

```
rush/
├── index.html                # 结构（菜单 / HUD / 结算 / 设置）
├── style.css                 # 主题样式
├── public/
│   ├── agents/{id}.png       # 29 名特工头像
│   ├── agents_3d/{id}/       # 特工 3D 模型（OBJ）
│   └── sounds/*.mp3          # 真实音效（可选覆盖）
├── scripts/compress-obj.mjs  # OBJ gzip 压缩后处理
└── src/
    ├── main.js               # 入口
    ├── config/               # 特工 / 场景 / 准星 / i18n 配置
    ├── core/                 # 状态机 + 主循环 + 射击判定
    ├── three/                # three.js 3D 模式
    ├── audio/Sound.js        # 音效
    └── ui/UI.js              # DOM UI
```

## 版权声明

VALORANT 特工立绘、头像、音效均为 **Riot Games** 版权素材，仅用于个人学习与内容创作，**禁止商业分发**。本项目采用「本地覆盖」机制：放入即生效，不放则用程序化兜底（剪影 + 合成音效）。

## 相关文档

- [PRD（产品需求）](./PRD_PREAIM_Rush_Peek.md)
- [开发文档](./DEVELOPMENT.md)
