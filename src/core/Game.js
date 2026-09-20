import * as PIXI from "pixi.js";
import { SCENES, ROUND_DURATION, KILLS_PER_LEVEL } from "../config/scenes.js";
import { createTarget, hitTest } from "./Target.js";
import { Room } from "./Room.js";
import { Crosshair } from "./Crosshair.js";
import { playKill, playHeadshot, playMultiKill, playMiss, playEnd } from "../audio/Sound.js";

/**
 * 游戏核心引擎：状态机 + 主循环 + 渲染协调
 * 依赖注入 PixiJS Application 与 Agents，UI 通过 setUI 回调解耦。
 */
export class Game {
  constructor(app, agents) {
    this.app = app;
    this.agents = agents;
    this.sceneKey = "rush-peek";
    this.targetStyle = "agent"; // 仅特工头像目标
    this.crosshairCfg = null;
    this.ui = null;

    // 渲染分层
    this.roomLayer = new PIXI.Container();
    this.targetLayer = new PIXI.Container();
    this.fxLayer = new PIXI.Container();
    this.crosshairLayer = new PIXI.Container();
    app.stage.addChild(this.roomLayer, this.targetLayer, this.fxLayer, this.crosshairLayer);

    this.room = new Room(this.roomLayer);
    this.crosshair = new Crosshair(this.crosshairLayer);

    // 游戏状态
    this.screen = "menu";
    this.paused = false;
    this.timeLeft = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.level = 1;
    this.side = 0;
    this.target = null;
    this.targetObj = null;
    this.targetAgent = null;
    this.particles = [];
    this.floaters = [];
    this._floaterPool = []; // 飘字对象池：避免快速射击时频繁 new PIXI.Text
    this.recoil = 0;

    this.room.build(app.screen.width, app.screen.height, this.scene());

    window.addEventListener("resize", () => {
      requestAnimationFrame(() => this.room.build(this.app.screen.width, this.app.screen.height, this.scene()));
    });

    app.ticker.add((ticker) => this.update(ticker.deltaTime / 60));
  }

  scene() { return SCENES[this.sceneKey]; }
  setUI(ui) { this.ui = ui; }

  setScene(key) {
    this.sceneKey = key;
    this.room.build(this.app.screen.width, this.app.screen.height, this.scene());
  }

  setTargetStyle(s) { this.targetStyle = s; }

  setCrosshair(cfg) {
    this.crosshairCfg = cfg;
    this.crosshair.setConfig(cfg);
  }

  setAim(cfg) { /* 2D 无视角旋转，瞄准设置仅 3D 模式生效 */ }

  /* ---------- 流程 ---------- */
  start() {
    this.screen = "playing";
    // 恢复游戏画布显示（菜单期间被 display:none 隐藏）
    if (this.app.canvas) this.app.canvas.style.display = "block";
    // 性能：菜单/结算/暂停期间 ticker 已停止，开局恢复渲染循环
    this.app.ticker.start();
    this.paused = false;
    this.timeLeft = ROUND_DURATION;
    this._lastHudTimer = null;
    this.kills = 0; this.shots = 0; this.hits = 0;
    this.streak = 0; this.bestStreak = 0; this.level = 1;
    this.side = 0;
    this.clearFx();
    this.clearTarget();
    this.crosshair.setVisible(true);
    this.spawn();
    this.pushHUD();
    if (this.ui) this.ui.showScreen("playing");
  }

  end() {
    this.screen = "result";
    playEnd();
    this.crosshair.setVisible(false);
    this.clearTarget();
    // 性能：结算画面由静态 overlay 盖住，停止渲染循环释放 GPU
    this.app.ticker.stop();
    if (this.ui) this.ui.showResult(this.stats());
  }

  pause() {
    if (this.screen !== "playing" || this.paused) return;
    this.paused = true;
    this.crosshair.setVisible(false);
    // 性能：暂停菜单遮住画面，停止渲染循环
    this.app.ticker.stop();
    if (this.ui) this.ui.showPause();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.crosshair.setVisible(true);
    // 恢复渲染循环
    this.app.ticker.start();
    if (this.ui) this.ui.showScreen("playing");
  }

  backToMenu() {
    this.screen = "menu";
    this.paused = false;
    this.crosshair.setVisible(false);
    this.clearTarget();
    this.clearFx();
    // 回菜单时重新隐藏游戏画布（避免盖住菜单背景）
    if (this.app.canvas) this.app.canvas.style.display = "none";
    // 性能：菜单页由 menu-bg 粒子背景接管，停止本渲染循环
    this.app.ticker.stop();
    if (this.ui) this.ui.showScreen("menu");
  }

  stats() {
    return {
      kills: this.kills,
      accuracy: this.shots === 0 ? 0 : Math.round((this.hits / this.shots) * 100),
      kps: (this.kills / ROUND_DURATION).toFixed(2),
      bestStreak: this.bestStreak,
      level: this.level
    };
  }

  /* ---------- 目标 ---------- */
  spawn() {
    const t = createTarget(this.scene(), this.app.screen.width, this.app.screen.height, this.side, this.level, this.timeLeft);
    this.target = t;
    this.targetAgent = this.targetStyle === "agent" ? this.agents.random() : null;
    this.targetObj = this.buildTargetObject(t, this.targetAgent);
    this.targetLayer.addChild(this.targetObj);
  }

  buildTargetObject(t, agent) {
    if (this.targetStyle === "agent" && agent) {
      if (!agent.portraitTexture) {
        const src = agent.source;
        const s = Math.min(src.width, src.height);
        const sx = (src.width - s) / 2;
        const tex = this.agents.textureFor(agent);
        if (!tex) return null;
        agent.portraitTexture = new PIXI.Texture(tex.baseTexture, new PIXI.Rectangle(sx, 0, s, s));
      }
      const sp = new PIXI.Sprite(agent.portraitTexture);
      const size = t.r * 2;
      sp.width = size;
      sp.height = size;
      sp.anchor.set(0.5);
      sp.position.set(t.x, t.y);
      return sp;
    }
    // 圆形目标
    const g = new PIXI.Graphics();
    g.circle(0, 0, t.r * 2.2).fill({ color: 0xff4655, alpha: 0.12 });
    g.circle(0, 0, t.r).fill(0xff4655);
    g.circle(-t.r * 0.3, -t.r * 0.3, t.r * 0.5).fill({ color: 0xffffff, alpha: 0.22 });
    g.circle(0, 0, t.r).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
    g.circle(0, 0, 3).fill(0xffffff);
    g.position.set(t.x, t.y);
    return g;
  }

  clearTarget() {
    if (this.targetObj) {
      this.targetObj.destroy({ children: true });
      this.targetObj = null;
    }
    this.target = null;
    this.targetAgent = null;
  }

  clearFx() {
    this.particles = [];
    this.floaters = [];
    this._floaterPool = []; // 池中 Text 随 fxLayer 一起销毁，引用失效需清空
    this.fxLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.particleG = null;
  }

  /* ---------- 射击 ---------- */
  handleShoot(mx, my) {
    if (this.screen !== "playing" || !this.target) return;
    this.shots++;
    this.recoil = 1;
    const t = this.target;

    if (hitTest(t, mx, my)) {
      this.kills++;
      this.hits++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      this.level = Math.floor(this.kills / KILLS_PER_LEVEL) + 1;
      this.spawnParticles(t.x, t.y, 0xff4655);
      this.spawnParticles(t.x, t.y, 0x00e0ff);
      const isHeadshot = Math.hypot(mx - t.x, my - t.y) <= t.r * 0.45;
      this.addFloater(t.x, t.y - 20, isHeadshot ? "HEADSHOT +1" : "+1", isHeadshot ? 0xffd166 : 0x4ade80);
      if (isHeadshot) playHeadshot();
      else if (this.streak >= 2) playMultiKill();
      else playKill();
    } else {
      this.streak = 0;
      this.spawnParticles(mx, my, 0x8b96ad);
      this.addFloater(t.x, t.y - 20, "MISS", 0xff4655);
      playMiss();
    }

    this.side = 1 - this.side; // 对侧刷新（左右严格交替）
    this.clearTarget();
    this.spawn();
    this.pushHUD();
  }

  /* ---------- 特效 ---------- */
  spawnParticles(x, y, color) {
    // 粒子上限：快速连射时粒子池不爆炸，保证每帧 Graphics 重绘开销受控
    for (let i = 0; i < 12; i++) {
      if (this.particles.length >= 240) break;
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: 2.2 + Math.random() * 2.5,
        color,
        size: 2 + Math.random() * 3
      });
    }
  }

  addFloater(x, y, text, color) {
    // 同屏飘字上限：超出丢弃，避免 GC 抖动
    if (this.floaters.length >= 8) return;
    // 从池复用 PIXI.Text，避免每次 new（纹理重建开销大）
    let t = this._floaterPool.pop();
    if (!t) {
      t = new PIXI.Text({ text, style: { fontFamily: "Consolas, monospace", fontSize: 22, fontWeight: "bold", fill: color, align: "center" } });
      t.anchor.set(0.5);
    } else {
      t.text = text;
      t.style.fill = color;
      t.alpha = 1;
      t.visible = true;
    }
    t.position.set(x, y);
    this.fxLayer.addChild(t);
    this.floaters.push({ obj: t, life: 1, decay: 1.4 });
  }

  /* ---------- 主循环 ---------- */
  update(sec) {
    if (this.screen === "playing" && !this.paused) {
      this.timeLeft -= sec;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.pushHUD();
        this.end();
      } else {
        const t = this.timeLeft.toFixed(1);
        if (t !== this._lastHudTimer) {
          this._lastHudTimer = t;
          this.pushHUD();
        }
      }
    }

    this.recoil = Math.max(0, this.recoil - sec * 3);
    this.crosshair.spread = this.recoil;

    this.updateTargetVisual();
    this.updateParticles(sec);
    this.updateFloaters(sec);

    this.crosshair.draw();
  }

  updateTargetVisual() {
    const t = this.target;
    const obj = this.targetObj;
    if (!t || !obj) return;
    const now = performance.now();
    const ghost = now < t.ghostUntil;
    const appear = Math.min((now - t.spawnAt) / 180, 1);
    obj.alpha = ghost ? appear * 0.6 : appear;
    obj.tint = ghost ? 0x00e0ff : 0xffffff;
  }

  updateParticles(sec) {
    const g = this.fxLayer;
    // 粒子用 Graphics 重绘（数量少，性能足够）
    if (!this.particleG) {
      this.particleG = new PIXI.Graphics();
      g.addChild(this.particleG);
    }
    const pg = this.particleG;
    pg.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * sec;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.vy += 220 * sec;
      pg.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        .fill({ color: p.color, alpha: Math.max(p.life, 0) });
    }
  }

  updateFloaters(sec) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= f.decay * sec;
      if (f.life <= 0) {
        f.obj.visible = false;
        f.obj.parent?.removeChild(f.obj);
        // 回池复用（池满则交给 GC）
        if (this._floaterPool.length < 8) this._floaterPool.push(f.obj);
        this.floaters.splice(i, 1);
        continue;
      }
      f.obj.position.y -= 40 * sec;
      f.obj.alpha = Math.max(f.life, 0);
    }
  }

  pushHUD() {
    if (!this.ui) return;
    const elapsed = ROUND_DURATION - this.timeLeft;
    this.ui.updateHUD({
      timeLeft: this.timeLeft,
      kills: this.kills,
      kps: (this.kills / Math.max(elapsed, 0.001)).toFixed(2),
      level: this.level,
      streak: this.streak
    });
  }
}
