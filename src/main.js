import { Agents } from "./core/Agents.js";
import { UI } from "./ui/UI.js";
import { initAudio } from "./audio/Sound.js";
import { getIpInfo } from "./core/IpInfo.js";

async function main() {
  // 预取公网 IP / 归属地（排行榜按 IP 区分，尽早缓存）
  getIpInfo().catch(() => {});
  const agents = new Agents();
  await agents.init();
  await initAudio();

  const mode = new URLSearchParams(location.search).get("mode") === "3d" ? "3d" : "2d";

  // 代码分割：菜单 3D 粒子背景移出主包（两模式共用，异步加载 three.js）
  const { MenuBg } = await import("./three/MenuBg.js");
  const menuBg = new MenuBg();

  let game;
  if (mode === "3d") {
    // 3D 玩法 chunk：three + Game3D + Agent3D + OBJLoader，仅 3D 模式加载
    const { Game3D } = await import("./three/Game3D.js");
    game = new Game3D(agents);
  } else {
    // 2D 玩法 chunk：pixi.js + Game/Room/Crosshair，仅 2D 模式加载
    const [{ Game }, PIXI] = await Promise.all([
      import("./core/Game.js"),
      import("pixi.js")
    ]);
    Agents.setPixi(PIXI); // 注入 PIXI，特工头像 texture 惰性创建

    const app = new PIXI.Application();
    await app.init({
      resizeTo: window,
      background: "#070a12",
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });

    app.canvas.id = "game";
    app.canvas.style.position = "fixed";
    app.canvas.style.inset = "0";
    app.canvas.style.zIndex = "0";
    app.canvas.style.display = "none"; // 菜单期间隐藏游戏画布
    document.body.appendChild(app.canvas);

    game = new Game(app, agents);

    app.canvas.addEventListener("mousemove", (e) => game.crosshair.move(e.clientX, e.clientY));
    app.canvas.addEventListener("mousedown", (e) => { if (e.button === 0) game.handleShoot(e.clientX, e.clientY); });
    app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  const ui = new UI(game, agents);
  game.setUI(ui);

  // 菜单背景与游戏画面互斥显示
  const syncBg = (screen) => {
    if (screen === "menu") menuBg.resume();
    else menuBg.pause();
  };
  const origShow = ui.showScreen.bind(ui);
  ui.showScreen = (screen) => { origShow(screen); syncBg(screen); };

  // 渲染模式切换按钮
  const modeBtn = document.getElementById("mode-btn");
  if (modeBtn) {
    modeBtn.textContent = mode === "3d" ? "3D → 2D" : "2D → 3D";
    modeBtn.addEventListener("click", () => {
      location.search = mode === "3d" ? "" : "?mode=3d";
    });
  }
}

main();
