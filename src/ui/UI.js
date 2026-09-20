import { I18N } from "../config/i18n.js";
import {
  DEFAULT_CROSSHAIR,
  CROSSHAIR_COLORS,
  crosshairColor,
  parseCrosshairCode,
  exportCrosshairCode,
  deepClone,
  loadCrosshair,
  saveCrosshair
} from "../config/crosshair.js";
import {
  getSoundConfig,
  setSoundConfig,
  getCustomSounds,
  setCustomSound,
  previewKill,
  previewMiss
} from "../audio/Sound.js";
import { getAimConfig, setAimConfig } from "../config/aim.js";
import { addScore, loadRanking, clearRanking, rankFor } from "../core/Ranking.js";
import { getIpInfo } from "../core/IpInfo.js";

function getPath(obj, path) { return path.split(".").reduce((o, k) => o[k], obj); }
function setPath(obj, path, val) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = val;
}

const CH_CONTROLS = [
  { type: "toggle", path: "centerDot", label: "中心点" },
  { type: "range", path: "centerDotSize", label: "中心点大小", min: 0, max: 6, step: 1 },
  { type: "range", path: "inner.opacity", label: "内线透明度", min: 0, max: 1, step: 0.1 },
  { type: "range", path: "inner.length", label: "内线长度", min: 0, max: 10, step: 1 },
  { type: "range", path: "inner.offset", label: "内线间距", min: 0, max: 10, step: 1 },
  { type: "range", path: "inner.thickness", label: "内线粗细", min: 1, max: 10, step: 1 },
  { type: "range", path: "outer.opacity", label: "外线透明度", min: 0, max: 1, step: 0.1 },
  { type: "range", path: "outer.length", label: "外线长度", min: 0, max: 10, step: 1 },
  { type: "range", path: "outer.offset", label: "外线间距", min: 0, max: 10, step: 1 },
  { type: "range", path: "outer.thickness", label: "外线粗细", min: 1, max: 10, step: 1 },
  { type: "toggle", path: "outline", label: "轮廓" },
  { type: "range", path: "outlineThickness", label: "轮廓厚度", min: 1, max: 6, step: 1 },
  { type: "toggle", path: "fadeFiringError", label: "射击扩散" }
];

/** 准星预览（原生 Canvas 2D，映射与 Crosshair 类一致） */
function previewCrosshair(canvas, cfg) {
  const c = canvas.getContext("2d");
  const size = canvas.width;
  const cx = size / 2, cy = size / 2;
  c.clearRect(0, 0, size, size);
  const color = crosshairColor(cfg);

  const drawSet = (lines, opacity) => {
    if (opacity <= 0) return;
    const len = lines.length * 2.4;
    const off = lines.offset * 1.8;
    const thick = lines.thickness;
    const stroke = (w, col, a) => {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.globalAlpha = a;
      c.beginPath();
      c.moveTo(cx, cy - off); c.lineTo(cx, cy - off - len);
      c.moveTo(cx, cy + off); c.lineTo(cx, cy + off + len);
      c.moveTo(cx - off, cy); c.lineTo(cx - off - len, cy);
      c.moveTo(cx + off, cy); c.lineTo(cx + off + len, cy);
      c.stroke();
    };
    if (cfg.outline) stroke(thick + cfg.outlineThickness * 2, "#000", cfg.outlineOpacity);
    stroke(thick, color, opacity);
  };

  drawSet(cfg.inner, cfg.inner.opacity);
  drawSet(cfg.outer, cfg.outer.opacity);
  if (cfg.centerDot) {
    const dz = cfg.centerDotSize * 0.8 + 1;
    c.globalAlpha = cfg.centerDotOpacity;
    c.fillStyle = color;
    c.beginPath(); c.arc(cx, cy, dz, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}

/** 内置音效选项 */
const KILL_SOUND_OPTS = [
  { value: "bonk", label: "动漫咚" },
  { value: "ding", label: "清脆叮" },
  { value: "triple", label: "上行连击" }
];
const MISS_SOUND_OPTS = [
  { value: "swoosh", label: "下滑咻" },
  { value: "pop", label: "低闷噗" },
  { value: "buzz", label: "错误蜂鸣" }
];

export class UI {
  constructor(game, agents) {
    this.game = game;
    this.agents = agents;
    this.lang = "zh";
    this.selectedScene = "rush-peek";
    this.crosshairCfg = loadCrosshair() || deepClone(DEFAULT_CROSSHAIR);
    this.soundCfg = getSoundConfig();
    this.aimCfg = getAimConfig();

    this._hudCache = {};   // HUD 渲染缓存，避免每帧重复写 DOM
    this.cacheDom();
    this.bindEvents();
    this.buildColors();
    this.buildControls();
    this.renderAgentGrid();
    this.renderAgentStrip();
    this.buildSoundPicker();
    this.buildAimControls();
    this.refreshCrosshairUI();
    this.applyI18n();

    this.game.setCrosshair(deepClone(this.crosshairCfg));
    this.game.setTargetStyle("agent");
  }

  cacheDom() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      menu: $("menu"), hud: $("hud"), result: $("result"), settings: $("settings"),
      pause: $("pause"), ranking: $("ranking"),
      timer: $("timer"), kills: $("kills"), kps: $("kps"), streak: $("streak"), streakCount: $("streak-count"),
      hudScene: document.querySelector(".hud-scene"), hudLevel: $("hud-level"),
      sceneCards: document.querySelectorAll(".scene-card"),
      agentStrip: $("agent-strip"),
      start: $("start-btn"), retry: $("retry-btn"), menuBtn: $("menu-btn"),
      settingsBtn: $("settings-btn"), settingsClose: $("settings-close"), langBtn: $("lang-btn"),
      rankingBtn: $("ranking-btn"), rankingClose: $("ranking-close"), rankingClear: $("ranking-clear"),
      rankingList: $("ranking-list"), rankingEmpty: $("ranking-empty"),
      resumeBtn: $("resume-btn"), restartBtn: $("restart-btn"),
      pauseExitBtn: $("pause-exit-btn"), pauseConfirm: $("pause-confirm"),
      pauseExitConfirm: $("pause-exit-confirm"), pauseExitCancel: $("pause-exit-cancel"),
      tabs: document.querySelectorAll(".tab"),
      tabCrosshair: $("tab-crosshair"), tabAgent: $("tab-agent"), tabSound: $("tab-sound"), tabAim: $("tab-aim"),
      chColors: $("ch-colors"), chControls: $("ch-controls"),
      chCode: $("ch-code"), chApply: $("ch-apply"), chExport: $("ch-export"), chPreview: $("ch-preview"),
      agentGrid: $("agent-grid"), agentUpload: $("agent-upload"), agentFile: $("agent-file"),
      aimControls: $("aim-controls"),
      soundKillPicker: $("sound-kill-picker"), soundMissPicker: $("sound-miss-picker"),
      soundKillCustom: $("sound-kill-custom"), soundMissCustom: $("sound-miss-custom"),
      soundFile: $("sound-file"), soundUploadBtns: document.querySelectorAll(".sound-upload"),
      soundPreviewBtns: document.querySelectorAll(".sound-preview"),
      soundClearBtns: document.querySelectorAll(".sound-clear"),
      resultScene: $("result-scene"), rKills: $("r-kills"), rAccuracy: $("r-accuracy"),
      rAccuracyFill: $("r-accuracy-fill"), rRank: $("r-rank"),
      rKps: $("r-kps"), rStreak: $("r-streak"), rLevel: $("r-level")
    };
  }

  bindEvents() {
    const el = this.el;
    el.sceneCards.forEach((card) => {
      card.addEventListener("click", () => {
        this.selectedScene = card.dataset.scene;
        el.sceneCards.forEach((c) => c.classList.toggle("active", c === card));
        this.game.setScene(this.selectedScene);
      });
    });

    el.start.addEventListener("click", () => this.game.start());
    el.retry.addEventListener("click", () => this.game.start());
    el.menuBtn.addEventListener("click", () => this.game.backToMenu());

    // 暂停菜单
    el.resumeBtn.addEventListener("click", () => this.game.resume());
    el.restartBtn.addEventListener("click", () => {
      el.pause.classList.add("hidden");
      this.game.start();
    });
    el.pauseExitBtn.addEventListener("click", () => {
      el.pauseConfirm.classList.remove("hidden");
      el.pauseExitBtn.classList.add("hidden");
    });
    el.pauseExitCancel.addEventListener("click", () => {
      el.pauseConfirm.classList.add("hidden");
      el.pauseExitBtn.classList.remove("hidden");
    });
    el.pauseExitConfirm.addEventListener("click", () => {
      el.pauseConfirm.classList.add("hidden");
      el.pauseExitBtn.classList.remove("hidden");
      el.pause.classList.add("hidden");
      this.game.backToMenu();
    });

    // 排行榜
    el.rankingBtn.addEventListener("click", () => this.showRanking());
    el.rankingClose.addEventListener("click", () => { el.ranking.classList.add("hidden"); });
    el.rankingClear.addEventListener("click", async () => {
      // 按当前 IP 清空（避免误删其他玩家记录）
      const info = await getIpInfo();
      clearRanking(info.ip);
      this.renderRanking();
    });

    el.settingsBtn.addEventListener("click", () => { el.settings.classList.remove("hidden"); });
    el.settingsClose.addEventListener("click", () => { el.settings.classList.add("hidden"); });

    el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        el.tabs.forEach((t) => t.classList.toggle("active", t === tab));
        const show = tab.dataset.tab;
        el.tabCrosshair.classList.toggle("hidden", show !== "crosshair");
        el.tabAgent.classList.toggle("hidden", show !== "agent");
        el.tabSound.classList.toggle("hidden", show !== "sound");
        el.tabAim.classList.toggle("hidden", show !== "aim");
      });
    });

    el.chApply.addEventListener("click", () => {
      const code = el.chCode.value.trim();
      if (!code) {
        // 输入框为空：视为「保存当前配置」，避免误把默认准星覆盖掉已调好的设置
        this.commitCrosshair();
        return;
      }
      try {
        const cfg = parseCrosshairCode(code);
        this.crosshairCfg = cfg;
        this.commitCrosshair();
      } catch (e) {}
    });

    el.chExport.addEventListener("click", () => {
      el.chCode.value = exportCrosshairCode(this.crosshairCfg);
    });

    el.agentUpload.addEventListener("click", () => el.agentFile.click());
    el.agentFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const name = file.name.replace(/\.[^.]+$/, "");
          this.agents.addCustom(img, name);
          this.renderAgentGrid();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    });

    el.langBtn.addEventListener("click", () => {
      this.lang = this.lang === "zh" ? "en" : "zh";
      el.langBtn.textContent = this.lang === "zh" ? "中文 / EN" : "EN / 中文";
      this.applyI18n();
    });

    // 音效：上传
    el.soundUploadBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this._soundUploadKey = btn.dataset.soundUpload;
        el.soundFile.click();
      });
    });
    el.soundFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const key = this._soundUploadKey;
      e.target.value = "";
      if (!file || !key) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCustomSound(key, ev.target.result);
        this.refreshSoundUI();
      };
      reader.readAsDataURL(file);
    });

    // 音效：试听
    el.soundPreviewBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.soundPreview;
        if (type === "kill") previewKill(this.soundCfg.kill);
        else previewMiss(this.soundCfg.miss);
      });
    });

    // 音效：清除自定义
    el.soundClearBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        setCustomSound(btn.dataset.soundClear, null);
        this.refreshSoundUI();
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // 玩法中：先暂停（不直接退出）；再按 Esc 恢复
      if (this.game.screen === "playing") {
        if (this.game.paused) this.game.resume();
        else this.game.pause();
      } else if (this.game.screen === "result") {
        this.game.backToMenu();
      }
    });
  }

  /* ---------- 准星 UI ---------- */
  buildColors() {
    const wrap = this.el.chColors;
    CROSSHAIR_COLORS.forEach((hex, i) => {
      const b = document.createElement("button");
      b.className = "ch-color";
      b.style.background = hex;
      b.dataset.index = i + 1;
      b.addEventListener("click", () => {
        this.crosshairCfg.color = i + 1;
        this.commitCrosshair();
      });
      wrap.appendChild(b);
    });
  }

  buildControls() {
    const wrap = this.el.chControls;
    CH_CONTROLS.forEach((ctl) => {
      const div = document.createElement("div");
      div.className = "ch-ctl";
      if (ctl.type === "toggle") {
        div.classList.add("ch-ctl-toggle");
        div.innerHTML = `
          <span class="ch-ctl-label">${ctl.label}</span>
          <label class="switch"><input type="checkbox"><span class="slider"></span></label>`;
        const input = div.querySelector("input");
        input.addEventListener("change", () => {
          setPath(this.crosshairCfg, ctl.path, input.checked);
          this.commitCrosshair();
        });
      } else {
        div.innerHTML = `
          <div class="ch-ctl-label"><span>${ctl.label}</span><span class="val"></span></div>
          <input type="range" min="${ctl.min}" max="${ctl.max}" step="${ctl.step}">`;
        const input = div.querySelector("input[type=range]");
        const valEl = div.querySelector(".val");
        input.addEventListener("input", () => {
          const v = parseFloat(input.value);
          setPath(this.crosshairCfg, ctl.path, v);
          valEl.textContent = v;
          this.preview();
          this.game.setCrosshair(deepClone(this.crosshairCfg));
          // 防抖落盘：即使不松手/直接刷新也不会丢配置
          clearTimeout(this._chSaveTimer);
          this._chSaveTimer = setTimeout(() => this.commitCrosshair(), 300);
        });
        // range 松手时立即落盘保存（避免拖动过程反复写 localStorage）
        input.addEventListener("change", () => { clearTimeout(this._chSaveTimer); this.commitCrosshair(); });
      }
      wrap.appendChild(div);
    });
  }

  /** 应用准星：刷新 UI 预览 + 立即写入游戏 + 持久化保存 */
  commitCrosshair() {
    this.refreshCrosshairUI();
    this.game.setCrosshair(deepClone(this.crosshairCfg));
    saveCrosshair(this.crosshairCfg);
  }

  refreshCrosshairUI() {
    const cfg = this.crosshairCfg;
    // 色块选中态
    const swatches = this.el.chColors.querySelectorAll(".ch-color");
    swatches.forEach((b) => b.classList.toggle("active", parseInt(b.dataset.index, 10) === cfg.color));

    // 控件值回填
    const wrap = this.el.chControls;
    CH_CONTROLS.forEach((ctl, idx) => {
      const div = wrap.children[idx];
      if (!div) return;
      if (ctl.type === "toggle") {
        div.querySelector("input").checked = !!getPath(cfg, ctl.path);
      } else {
        const input = div.querySelector("input[type=range]");
        const valEl = div.querySelector(".val");
        const v = getPath(cfg, ctl.path);
        input.value = v;
        valEl.textContent = v;
      }
    });
    this.preview();
  }

  preview() {
    previewCrosshair(this.el.chPreview, this.crosshairCfg);
  }

  /* ---------- 音效 ---------- */
  buildSoundPicker() {
    const mk = (wrap, opts, type) => {
      opts.forEach((opt) => {
        const b = document.createElement("button");
        b.className = "sound-opt";
        b.textContent = opt.label;
        b.dataset.value = opt.value;
        b.addEventListener("click", () => {
          this.soundCfg[type] = opt.value;
          setSoundConfig(this.soundCfg);
          this.refreshSoundUI();
        });
        wrap.appendChild(b);
      });
    };
    mk(this.el.soundKillPicker, KILL_SOUND_OPTS, "kill");
    mk(this.el.soundMissPicker, MISS_SOUND_OPTS, "miss");
    this.refreshSoundUI();
  }

  refreshSoundUI() {
    // 高亮当前选中
    const sync = (picker, type) => {
      picker.querySelectorAll(".sound-opt").forEach((b) => {
        b.classList.toggle("active", b.dataset.value === this.soundCfg[type]);
      });
    };
    sync(this.el.soundKillPicker, "kill");
    sync(this.el.soundMissPicker, "miss");

    // 自定义音频状态
    const customs = getCustomSounds();
    const kName = customs.kill ? "自定义音频" : "";
    const mName = customs.miss ? "自定义音频" : "";
    this.el.soundKillCustom.textContent = kName;
    this.el.soundMissCustom.textContent = mName;
    this.el.soundClearBtns.forEach((btn) => {
      const key = btn.dataset.soundClear;
      btn.classList.toggle("hidden", !customs[key]);
    });
  }

  /* ---------- 瞄准 ---------- */
  buildAimControls() {
    const wrap = this.el.aimControls;
    if (!wrap) return;
    wrap.innerHTML = "";

    const ctl = (label, key, type, min, max, step) => {
      const div = document.createElement("div");
      div.className = "ch-ctl";
      if (type === "toggle") {
        div.classList.add("ch-ctl-toggle");
        div.innerHTML = `
          <span class="ch-ctl-label">${label}</span>
          <label class="switch"><input type="checkbox"><span class="slider"></span></label>`;
        const input = div.querySelector("input");
        input.checked = !!this.aimCfg[key];
        input.addEventListener("change", () => {
          this.aimCfg[key] = input.checked;
          this.commitAim();
        });
      } else {
        div.innerHTML = `
          <div class="ch-ctl-label"><span>${label}</span><span class="val"></span></div>
          <input type="range" min="${min}" max="${max}" step="${step}">`;
        const input = div.querySelector("input[type=range]");
        const valEl = div.querySelector(".val");
        input.value = this.aimCfg[key];
        valEl.textContent = this.aimCfg[key];
        input.addEventListener("input", () => {
          const v = parseFloat(input.value);
          this.aimCfg[key] = v;
          valEl.textContent = v;
          this.commitAim();
        });
      }
      wrap.appendChild(div);
    };

    ctl("视野 FOV", "fov", "range", 70, 110, 1);
    ctl("灵敏度", "sensitivity", "range", 0.2, 3, 0.1);
    ctl("反转 Y 轴", "invertY", "toggle");
  }

  commitAim() {
    setAimConfig(this.aimCfg);
    this.game.setAim({ ...this.aimCfg });
  }

  /* ---------- 特工头像 ---------- */
  renderAgentGrid() {
    const grid = this.el.agentGrid;
    grid.innerHTML = "";
    this.agents.items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "agent-item";
      const img = document.createElement("img");
      img.src = item.source.toDataURL ? item.source.toDataURL() : item.source.src;
      img.alt = item.name;
      const name = document.createElement("div");
      name.className = "agent-name";
      name.textContent = item.name;
      div.appendChild(img);
      div.appendChild(name);
      if (item.custom) {
        const del = document.createElement("button");
        del.className = "agent-del";
        del.textContent = "×";
        del.addEventListener("click", () => {
          this.agents.remove(item.id);
          this.renderAgentGrid();
        });
        div.appendChild(del);
      }
      grid.appendChild(div);
    });
  }

  renderAgentStrip() {
    const strip = this.el.agentStrip;
    if (!strip) return;
    strip.innerHTML = "";
    this.agents.items.slice(0, 10).forEach((item) => {
      const img = document.createElement("img");
      img.src = item.source.toDataURL ? item.source.toDataURL() : item.source.src;
      img.alt = item.name;
      img.title = item.name;
      strip.appendChild(img);
    });
  }

  /* ---------- 由 Game 调用 ---------- */
  showScreen(screen) {
    const el = this.el;
    el.menu.classList.toggle("hidden", screen !== "menu");
    el.hud.classList.toggle("hidden", screen !== "playing");
    el.result.classList.add("hidden");
    el.settings.classList.add("hidden");
    el.pause.classList.add("hidden");
    el.ranking.classList.add("hidden");
    // 玩法态在 body 上标记，全屏隐藏系统光标（2D/3D 通用）
    document.body.classList.toggle("playing", screen === "playing");
  }

  showPause() {
    const el = this.el;
    el.pause.classList.remove("hidden");
    el.pauseConfirm.classList.add("hidden");
    el.pauseExitBtn.classList.remove("hidden");
    document.body.classList.remove("playing");
  }

  updateHUD(data) {
    const c = this._hudCache;
    // 仅在值真正变化时才写 DOM，避免每帧触发重排/重绘
    const timer = data.timeLeft.toFixed(1);
    if (timer !== c.timer) {
      c.timer = timer;
      this.el.timer.textContent = timer;
    }
    const urgent = data.timeLeft <= 10;
    if (urgent !== c.urgent) {
      c.urgent = urgent;
      this.el.timer.classList.toggle("urgent", urgent);
    }
    if (data.kills !== c.kills) {
      c.kills = data.kills;
      this.el.kills.textContent = data.kills;
    }
    const kps = data.kps;
    if (kps !== c.kps) {
      c.kps = kps;
      this.el.kps.textContent = kps;
    }
    if (data.level !== c.level) {
      c.level = data.level;
      this.el.hudLevel.textContent = "LV." + data.level;
    }
    const streakOn = data.streak >= 2;
    if (streakOn !== c.streakOn || (streakOn && data.streak !== c.streak)) {
      c.streakOn = streakOn;
      c.streak = data.streak;
      this.el.streak.classList.toggle("hidden", !streakOn);
      if (streakOn) this.el.streakCount.textContent = data.streak;
    }
  }

  async showResult(stats) {
    this.el.resultScene.textContent = this.game.scene().name;
    this.el.rKills.textContent = stats.kills;
    this.el.rAccuracy.textContent = stats.accuracy + "%";
    this.el.rKps.textContent = stats.kps;
    this.el.rStreak.textContent = stats.bestStreak;
    this.el.rLevel.textContent = stats.level;

    // 评级 + 命中率进度条
    const rank = rankFor(stats);
    this.el.rRank.textContent = "";
    const rankSpan = document.createElement("span");
    rankSpan.className = "btn-text"; // counter-skew 抵消斜切
    rankSpan.textContent = rank;
    this.el.rRank.appendChild(rankSpan);
    this.el.rRank.dataset.rank = rank;
    this.el.rAccuracyFill.style.width = Math.max(0, Math.min(100, stats.accuracy)) + "%";

    // 写入排行榜（异步取 IP，不阻塞结果面板渲染）
    const mode = new URLSearchParams(location.search).get("mode") === "3d" ? "3D" : "2D";
    this._pendingRanking = getIpInfo()
      .then((info) => {
        addScore({
          mode,
          scene: this.game.scene().name,
          kills: stats.kills,
          accuracy: stats.accuracy,
          kps: stats.kps,
          bestStreak: stats.bestStreak,
          level: stats.level,
          rank,
          ip: info.ip,
          loc: info.loc
        });
      })
      .catch(() => {});

    this.el.hud.classList.add("hidden");
    this.el.result.classList.remove("hidden");
  }

  /* ---------- 排行榜 ---------- */
  showRanking() {
    this.renderRanking();
    this.el.ranking.classList.remove("hidden");
  }

  renderRanking() {
    const list = loadRanking();
    const wrap = this.el.rankingList;
    wrap.innerHTML = "";
    this.el.rankingEmpty.classList.toggle("hidden", list.length > 0);

    list.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "ranking-row";
      const rankCls = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
      const d = new Date(entry.date);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

      row.innerHTML = `
        <span class="rr-rank ${rankCls}">${i + 1}</span>
        <span class="rr-mode">${entry.mode || "2D"}</span>
        <span class="rr-scene">${entry.scene || "-"}</span>
        <span class="rr-loc">${entry.loc || "-"}</span>
        <span class="rr-kills">${entry.kills}</span>
        <span class="rr-acc">${entry.accuracy}%</span>
        <span class="rr-rank2" data-rank="${entry.rank}">${entry.rank}</span>
        <span class="rr-date">${dateStr}</span>`;
      wrap.appendChild(row);
    });
  }

  applyI18n() {
    const dict = I18N[this.lang];
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (dict[k]) el.textContent = dict[k];
    });
    this.el.hudScene.textContent = this.game.scene().name;
    this.el.chCode.placeholder = dict["ch.importPlaceholder"] || "";
  }
}
