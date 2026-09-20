# 特工头像（可选覆盖）

把官方特工透明 PNG 头像放到本目录，命名 `{id}.png`（`{id}` 见 `src/config/agents.js`）。

例如：
```
public/agents/jett.png
public/agents/reyna.png
public/agents/sova.png
...
```

- 放入后，对应特工在「特工模式」下会显示为官方头像（运行时自动加载）。
- 未放入则回退到「主题色 + 名字缩写」剪影。
- 版权：Riot 官方素材仅供本地个人使用，勿商业分发。

官方获取途径见 `DEVELOPMENT.md` §4.1。
