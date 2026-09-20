import * as THREE from "three";
import { SCENES, ROUND_DURATION, KILLS_PER_LEVEL } from "../config/scenes.js";
import { crosshairColor } from "../config/crosshair.js";
import { getAimConfig, BASE_SENS } from "../config/aim.js";
import { playKill, playHeadshot, playMultiKill, playMiss, playEnd } from "../audio/Sound.js";
import { getAgentModel } from "./Agent3D.js";

/**
 * 3D 模式（three.js）：真 3D 玩法房间 + billboard 特工立绘 + 射线命中检测。
 * 玩法与 2D 一致（单目标 / 对侧刷新 / 60s / Ghost 预览），仅渲染层换成 WebGL 3D。
 */

const ROOM_DEPTH = 10;
const TARGET_Z = -8.5;
const TARGET_Y = 1.6;
const TARGET_SIZE = 1.9;

export class Game3D {
  constructor(agents) {
    this.agents = agents;
    this.sceneKey = "rush-peek";
    this.targetStyle = "agent";
    this.aim = getAimConfig();
    this.ui = null;

    this.screen = "menu";
    this.paused = false;
    this.timeLeft = 0;
    this.kills = 0; this.shots = 0; this.hits = 0;
    this.streak = 0; this.bestStreak = 0; this.level = 1;
    this.side = 0;
    this.target = null;
    // 模型实例复用池：agentId -> { group, meshes }。
    // 击杀/打空只做「移除 + 复位」，不 clone 几何体、不销毁重传 GPU，
    // 消除 TripoSR 大模型（约 3 万顶点）每次射击的 clone + GPU 上传卡顿。
    this._agentPool = new Map();
    this._euler = new THREE.Euler();
    this.keys = new Set();

    this._initRenderer();
    this._buildRoom();
    this._initCrosshair();
    this._bindEvents();

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._update());
  }

  _initRenderer() {
    this.scene3d = new THREE.Scene();
    this.scene3d.fog = new THREE.Fog(0x070a12, 6, 22);
    this.camera = new THREE.PerspectiveCamera(this.aim.fov, innerWidth / innerHeight, 0.1, 60);
    this.camera.position.set(0, 1.6, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.pointerLocked = false;
    this.hitFlashAt = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    const cv = this.renderer.domElement;
    cv.id = "game";
    cv.style.position = "fixed";
    cv.style.inset = "0";
    cv.style.zIndex = "0";
    cv.style.cursor = "none";
    document.body.appendChild(cv);

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
  }

  _buildRoom() {
    const wall = (c, opt = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.05, ...opt });
    const glow = (c, op = 0.5) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, ROOM_DEPTH * 2), wall(0x0c1322));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -ROOM_DEPTH / 2);
    this.scene3d.add(floor);

    const grid = new THREE.GridHelper(16, 16, 0x2a4a7a, 0x16263f);
    grid.position.set(0, 0.01, -ROOM_DEPTH / 2);
    this.scene3d.add(grid);

    // 后墙 + 发光门洞
    const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), wall(0x141e30));
    back.position.set(0, 2.5, -ROOM_DEPTH);
    this.scene3d.add(back);
    const doorFrame = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), glow(0x1d3a5f, 1));
    doorFrame.position.set(0, 1.7, -ROOM_DEPTH + 0.01);
    this.scene3d.add(doorFrame);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.3), glow(0x0a2540, 1));
    door.position.set(0, 1.7, -ROOM_DEPTH + 0.02);
    this.scene3d.add(door);

    const wallL = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_DEPTH, 5), wall(0x0f1728));
    wallL.rotation.y = Math.PI / 2;
    wallL.position.set(-8, 2.5, -ROOM_DEPTH / 2);
    this.scene3d.add(wallL);
    const wallR = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_DEPTH, 5), wall(0x0f1728));
    wallR.rotation.y = -Math.PI / 2;
    wallR.position.set(8, 2.5, -ROOM_DEPTH / 2);
    this.scene3d.add(wallR);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, ROOM_DEPTH), wall(0x0a0f1b));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 5, -ROOM_DEPTH / 2);
    this.scene3d.add(ceil);
    [-3, -6.5].forEach((z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 0.3), wall(0x1a2a44));
      b.position.set(0, 4.7, z);
      this.scene3d.add(b);
    });

    // 两侧刷新区高亮
    [[-6, 0x00e0ff], [6, 0xff4655]].forEach(([x, color]) => {
      const z = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 3), glow(color, 0.35));
      z.position.set(x, 2.5, -ROOM_DEPTH + 0.05);
      this.scene3d.add(z);
    });

    // 掩体与立柱（含碰撞体）
    this.colliders = [];
    this._addBox(-5.5, 1.1, -3.5, 1.6, 2.2, 1.6, 0x22344f);
    this._addBox(5.5, 1.1, -3.5, 1.6, 2.2, 1.6, 0x22344f);
    this._addBox(-4.6, 0.6, -7.0, 1.2, 1.2, 1.2, 0x1b2b42);
    this._addBox(4.6, 0.6, -7.0, 1.2, 1.2, 1.2, 0x1b2b42);
    this._addBox(-7.3, 2.5, -5.0, 0.5, 5, 0.5, 0x1d2f4a);
    this._addBox(7.3, 2.5, -5.0, 0.5, 5, 0.5, 0x1d2f4a);

    // 光照：环境 + 半球 + 暖主光 + 冷轮廓光
    this.scene3d.add(new THREE.AmbientLight(0x8899bb, 0.55));
    this.scene3d.add(new THREE.HemisphereLight(0x3355aa, 0x0a0f1b, 0.5));
    const keyLight = new THREE.DirectionalLight(0xffe8d0, 1.1);
    keyLight.position.set(2, 4, 3);
    this.scene3d.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x55ccff, 0.8);
    rimLight.position.set(-3, 2, -2);
    this.scene3d.add(rimLight);
  }

  _addBox(x, y, z, w, h, d, color) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1 })
    );
    box.position.set(x, y, z);
    this.scene3d.add(box);
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return box;
  }

  _initCrosshair() {
    const c = document.createElement("canvas");
    c.width = innerWidth; c.height = innerHeight;
    c.style.position = "fixed"; c.style.inset = "0"; c.style.zIndex = "1"; c.style.pointerEvents = "none";
    document.body.appendChild(c);
    this.chCanvas = c;
    this.chCtx = c.getContext("2d");
    this.crosshair = {
      x: innerWidth / 2, y: innerHeight / 2, cfg: null, visible: false,
      move: (x, y) => { this.crosshair.x = x; this.crosshair.y = y; this._drawCrosshair(); },
      setConfig: (cfg) => { this.crosshair.cfg = cfg; this._drawCrosshair(); },
      setVisible: (v) => { this.crosshair.visible = v; this._drawCrosshair(); }
    };
  }

  _drawCrosshair() {
    const c = this.chCtx, w = this.chCanvas.width, h = this.chCanvas.height;
    c.clearRect(0, 0, w, h);
    if (!this.crosshair.visible || !this.crosshair.cfg) return;
    const cfg = this.crosshair.cfg, color = crosshairColor(cfg);
    const x = this.crosshair.x, y = this.crosshair.y;
    const hit = this.hitFlashAt ? Math.max(0, 1 - (performance.now() - this.hitFlashAt) / 140) : 0;
    const lineSet = (lines, op) => {
      if (op <= 0) return;
      const len = lines.length * 2.4, off = lines.offset * 1.8;
      c.strokeStyle = hit > 0 ? "#ffffff" : color;
      c.lineWidth = lines.thickness + hit * 2.5;
      c.globalAlpha = op;
      c.beginPath();
      c.moveTo(x, y - off); c.lineTo(x, y - off - len);
      c.moveTo(x, y + off); c.lineTo(x, y + off + len);
      c.moveTo(x - off, y); c.lineTo(x - off - len, y);
      c.moveTo(x + off, y); c.lineTo(x + off + len, y);
      c.stroke();
    };
    lineSet(cfg.inner, cfg.inner.opacity);
    lineSet(cfg.outer, cfg.outer.opacity);
    if (cfg.centerDot) {
      c.globalAlpha = cfg.centerDotOpacity; c.fillStyle = color;
      c.beginPath(); c.arc(x, y, cfg.centerDotSize * 0.8 + 1, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  _bindEvents() {
    const cv = this.renderer.domElement;

    cv.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || this.screen !== "playing") return;
      if (!this.pointerLocked) {
        this._requestLock(cv);
        return;
      }
      this.handleShoot();
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.pointerLocked || this.screen !== "playing") return;
      const deg = (BASE_SENS * this.aim.sensitivity * Math.PI) / 180;
      const inv = this.aim.invertY ? -1 : 1;
      this.yaw -= e.movementX * deg;
      this.pitch -= e.movementY * inv * deg;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    });

    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === cv;
      // 锁定成功才隐藏光标；失败/解锁时恢复光标，保证用户能再次点击锁定
      document.body.classList.toggle("playing", this.pointerLocked && this.screen === "playing");
    });

    document.addEventListener("pointerlockerror", () => {
      this.pointerLocked = false;
      document.body.classList.remove("playing");
    });

    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.chCanvas.width = innerWidth; this.chCanvas.height = innerHeight;
      this.crosshair.x = innerWidth / 2;
      this.crosshair.y = innerHeight / 2;
      this._drawCrosshair();
    });
  }

  /* ---------- 接口（与 2D Game 对齐） ---------- */
  scene() { return SCENES[this.sceneKey]; }
  setUI(ui) { this.ui = ui; }
  setScene(key) { this.sceneKey = key; }
  setTargetStyle(s) { this.targetStyle = s; }
  setCrosshair(cfg) { this.crosshair.setConfig(cfg); }
  setAim(cfg) {
    this.aim = cfg;
    this.camera.fov = cfg.fov;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.screen = "playing";
    this.paused = false;
    this.timeLeft = ROUND_DURATION;
    this._lastHudTimer = null;
    this.kills = 0; this.shots = 0; this.hits = 0;
    this.streak = 0; this.bestStreak = 0; this.level = 1;
    this.side = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.camera.position.set(0, 1.6, 0);
    this._clearTarget();
    this.crosshair.setVisible(true);
    this._spawn();
    this._pushHUD();
    if (this.ui) this.ui.showScreen("playing");
    this._requestLock(this.renderer.domElement);
  }

  _requestLock(cv) {
    if (!cv.requestPointerLock) return;
    const p = cv.requestPointerLock();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        // 指针锁定被拒：仅标记，不移除 body 的 playing 态（否则系统光标会显示）
        this.pointerLocked = false;
      });
    }
  }

  end() {
    this.screen = "result";
    playEnd();
    this.crosshair.setVisible(false);
    this._clearTarget();
    if (document.exitPointerLock) document.exitPointerLock();
    if (this.ui) this.ui.showResult(this.stats());
  }

  pause() {
    if (this.screen !== "playing" || this.paused) return;
    this.paused = true;
    this.crosshair.setVisible(false);
    if (document.exitPointerLock) document.exitPointerLock();
    if (this.ui) this.ui.showPause();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.crosshair.setVisible(true);
    if (this.ui) this.ui.showScreen("playing");
    this._requestLock(this.renderer.domElement);
  }

  backToMenu() {
    this.screen = "menu";
    this.paused = false;
    this.crosshair.setVisible(false);
    this._clearTarget();
    if (document.exitPointerLock) document.exitPointerLock();
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
  _spawn() {
    const dir = this.side === 0 ? 1 : -1;
    const x = dir * (1.8 + Math.random() * 4);
    const y = TARGET_Y + (Math.random() * 2 - 1) * 0.6;

    const group = new THREE.Group();
    group.position.set(x, y, TARGET_Z);
    this.scene3d.add(group);

    const agent = this.targetStyle === "agent" ? this.agents.random() : null;
    const target = {
      group,
      meshes: [],
      geometries: [],
      ghostUntil: performance.now() + 280,
      spawnAt: performance.now(),
      // 移动目标：横向摆头 + 轻微上下，速度/幅度随等级提升
      vx: (Math.random() < 0.5 ? -1 : 1) * (0.6 + this.level * 0.15),
      vy: (Math.random() < 0.5 ? -1 : 1) * (0.15 + this.level * 0.04),
      minX: x - 1.6, maxX: x + 1.6,
      minY: y - 0.55, maxY: y + 0.55
    };
    this.target = target;

    if (!agent) this._spawnCircle(target);
    else if (agent.custom) this._spawnBillboard(target, agent);
    else this._spawnModel(target, agent);
  }

  _spawnModel(target, agent) {
    getAgentModel(agent.id).then((template) => {
      if (this.target !== target) return;
      if (!template) { this._spawnBillboard(target, agent); return; }

      // 复用池：每个特工只 clone 一次（深拷贝几何体 + 独立材质），之后击杀复用同一实例
      let entry = this._agentPool.get(agent.id);
      if (!entry) {
        const group = template.clone();
        group.scale.multiplyScalar(TARGET_SIZE);
        const meshes = [];
        group.traverse((child) => {
          if (child.isMesh) {
            child.material = child.material.clone();
            child.material.transparent = true;
            meshes.push(child);
          }
        });
        entry = { group, meshes };
        this._agentPool.set(agent.id, entry);
      }

      entry.group.removeFromParent();
      target.group.add(entry.group);
      target.meshes = entry.meshes;
      target.pooled = true;
      target.poolEntry = entry;
    });
  }

  _spawnBillboard(target, agent) {
    const tex = new THREE.CanvasTexture(agent.source);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(TARGET_SIZE, TARGET_SIZE),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    mesh.userData.billboard = true;
    target.group.add(mesh);
    target.meshes.push(mesh);
    target.geometries.push(mesh.geometry);
  }

  _spawnCircle(target) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 32),
      new THREE.MeshBasicMaterial({ color: 0xff4655, transparent: true })
    );
    mesh.userData.baseColor = 0xff4655;
    target.group.add(mesh);
    target.meshes.push(mesh);
    target.geometries.push(mesh.geometry);
  }

  _clearTarget() {
    if (!this.target) return;
    this.scene3d.remove(this.target.group);

    if (this.target.pooled) {
      // 复用实例：解绑放回池，重置 ghost 态残留，保留几何体/材质避免下次重新上传
      const entry = this.target.poolEntry;
      if (entry) {
        entry.group.removeFromParent();
        entry.meshes.forEach((m) => {
          if (m.material) {
            m.material.opacity = 1;
            if (m.material.color) m.material.color.set(0xffffff);
          }
        });
      }
    } else {
      // billboard / circle：体积小，照旧销毁重建
      this.target.geometries.forEach((g) => g.dispose());
      this.target.meshes.forEach((m) => {
        if (m.material) {
          if (m.material.map) m.material.map.dispose();
          m.material.dispose();
        }
      });
    }
    this.target = null;
  }

  /* ---------- 射击 ---------- */
  handleShoot() {
    if (this.screen !== "playing" || !this.target) return;
    this.shots++;

    this.ndc.set(0, 0); // FPS 准星固定屏幕中心
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.target.group, true).length > 0;
    const ghost = performance.now() < this.target.ghostUntil;

    if (hit && !ghost) {
      this.kills++; this.hits++; this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      this.level = Math.floor(this.kills / KILLS_PER_LEVEL) + 1;
      this.hitFlashAt = performance.now();
      this._drawCrosshair();
      if (this.streak >= 2) playMultiKill();
      else playKill();
    } else {
      this.streak = 0;
      playMiss();
    }

    this.side = 1 - this.side;
    this._clearTarget();
    this._spawn();
    this._pushHUD();
  }

  /* ---------- 主循环 ---------- */
  _update() {
    const sec = Math.min(this.clock.getDelta(), 0.1);
    // 性能：非玩法态（菜单/结算/暂停）直接跳过整帧渲染——
    // 画面已被 overlay/菜单遮罩盖住，继续 render 纯属浪费 GPU。
    // 3D 模式菜单页会同时存在 menu-bg 粒子波浪 + 本渲染器两个 WebGL 上下文，
    // 若这里照常满帧渲染会导致明显卡顿。
    if (this.screen !== "playing" || this.paused) return;
    this.timeLeft -= sec;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this._pushHUD(); this.end(); }
    else {
      const t = this.timeLeft.toFixed(1);
      if (t !== this._lastHudTimer) {
        this._lastHudTimer = t;
        this._pushHUD();
      }
    }

    // FPS 视角旋转（yaw / pitch）——复用 Euler 避免每帧 new 产生 GC 压力
    this._euler.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(this._euler);

    this._updatePlayer(sec);
    this._updateTarget(sec);

    // 命中闪光（hitmarker）动画刷新
    if (this.hitFlashAt && performance.now() - this.hitFlashAt < 140) {
      this._drawCrosshair();
    }

    // Ghost 态：半透明 + 青色，出现后淡入；billboard 始终面向相机
    if (this.target) {
      const now = performance.now();
      const ghost = now < this.target.ghostUntil;
      const appear = Math.min((now - this.target.spawnAt) / 180, 1);
      for (const m of this.target.meshes) {
        const mat = m.material;
        if (!mat) continue;
        if (m.userData.billboard) m.quaternion.copy(this.camera.quaternion);
        const base = m.userData.baseColor || 0xffffff;
        mat.opacity = ghost ? appear * 0.55 : appear;
        if (mat.color) mat.color.set(ghost ? 0x00e0ff : base);
      }
    }

    this.renderer.render(this.scene3d, this.camera);
  }

  /* ---------- 玩家移动（WASD + 碰撞） ---------- */
  _updatePlayer(sec) {
    if (this.screen !== "playing" || !this.pointerLocked) return;
    let f = 0, s = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) f += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) f -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) s += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) s -= 1;
    if (f === 0 && s === 0) return;

    const speed = 4.5;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = -sin, fz = -cos;      // 前方向（水平面）
    const rx = cos, rz = -sin;       // 右方向
    const len = Math.hypot(f, s) || 1;
    let nx = this.camera.position.x + (fx * f + rx * s) / len * speed * sec;
    let nz = this.camera.position.z + (fz * f + rz * s) / len * speed * sec;

    const r = 0.4;
    nx = Math.max(-7.6 + r, Math.min(7.6 - r, nx));
    nz = Math.max(-9.6 + r, Math.min(-0.4 - r, nz));

    for (const c of this.colliders) {
      if (nx > c.minX - r && nx < c.maxX + r && nz > c.minZ - r && nz < c.maxZ + r) {
        const dl = nx - (c.minX - r), dr = (c.maxX + r) - nx;
        const db = nz - (c.minZ - r), df = (c.maxZ + r) - nz;
        if (Math.min(dl, dr) < Math.min(db, df)) nx = dl < dr ? c.minX - r : c.maxX + r;
        else nz = db < df ? c.minZ - r : c.maxZ + r;
      }
    }

    this.camera.position.x = nx;
    this.camera.position.z = nz;
    this.camera.position.y = 1.6;
  }

  /* ---------- 目标移动（移动靶） ---------- */
  _updateTarget(sec) {
    const t = this.target;
    if (!t) return;
    if (t.vx !== undefined) {
      t.group.position.x += t.vx * sec;
      if (t.group.position.x > t.maxX) { t.group.position.x = t.maxX; t.vx = -Math.abs(t.vx); }
      else if (t.group.position.x < t.minX) { t.group.position.x = t.minX; t.vx = Math.abs(t.vx); }
    }
    if (t.vy !== undefined) {
      t.group.position.y += t.vy * sec;
      if (t.group.position.y > t.maxY) { t.group.position.y = t.maxY; t.vy = -Math.abs(t.vy); }
      else if (t.group.position.y < t.minY) { t.group.position.y = t.minY; t.vy = Math.abs(t.vy); }
    }
  }

  _pushHUD() {
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
