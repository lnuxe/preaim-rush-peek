/**
 * 音效模块
 * 三级优先级：
 *   1. 用户上传的自定义音频（localStorage 持久化，dataURL）
 *   2. public/sounds/*.mp3 真实音效（AudioBuffer 预加载）
 *   3. 内置合成音效（动漫 / 抖音搞怪风，可选多款）
 *
 * 文件约定（见 DEVELOPMENT.md §4.2）：
 *   sounds/kill.mp3      普通击杀
 *   sounds/headshot.mp3  爆头
 *   sounds/multikill.mp3 连杀 ≥2
 *   sounds/miss.mp3      打空
 *   sounds/end.mp3       单局结束
 */

let actx = null;
const buffers = {}; // key -> AudioBuffer（public/sounds/*.mp3）
const customBuffers = {}; // key -> AudioBuffer（用户上传）

const FILES = {
  kill: "sounds/kill.mp3",
  headshot: "sounds/headshot.mp3",
  multikill: "sounds/multikill.mp3",
  miss: "sounds/miss.mp3",
  end: "sounds/end.mp3"
};

/* ---------- 持久化（localStorage） ---------- */
const STORE_KEY = "preaim.sound.v1";

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function getSoundConfig() {
  const s = loadStore();
  return {
    kill: s.kill || "bonk",
    miss: s.miss || "swoosh"
  };
}

export function setSoundConfig(cfg) {
  const s = loadStore();
  s.kill = cfg.kill;
  s.miss = cfg.miss;
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

/* 用户上传的自定义音频 dataURL 存取 */
export function getCustomSounds() {
  return loadStore().custom || {};
}

export function setCustomSound(key, dataURL) {
  const s = loadStore();
  if (!s.custom) s.custom = {};
  if (dataURL) s.custom[key] = dataURL;
  else delete s.custom[key];
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

function ctx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  return actx;
}

/** 预加载所有可选 MP3 + 用户上传的音频 */
export async function initAudio() {
  const base = import.meta.env.BASE_URL || "./";
  await Promise.all([
    // public/sounds/*.mp3
    ...Object.entries(FILES).map(async ([key, path]) => {
      try {
        const resp = await fetch(base + path);
        if (!resp.ok) return;
        const ab = await resp.arrayBuffer();
        buffers[key] = await ctx().decodeAudioData(ab);
      } catch (e) {
        /* 无文件则回退合成 */
      }
    }),
    // 用户上传的 dataURL
    ...Object.entries(getCustomSounds()).map(async ([key, dataURL]) => {
      try {
        const ab = await (await fetch(dataURL)).arrayBuffer();
        customBuffers[key] = await ctx().decodeAudioData(ab);
      } catch (e) {
        /* 忽略损坏数据 */
      }
    })
  ]);
}

/** 尝试播放已缓存音频；返回是否成功 */
function playBuffer(map, key) {
  if (!map[key]) return false;
  try {
    const a = ctx();
    const src = a.createBufferSource();
    src.buffer = map[key];
    src.connect(a.destination);
    // 播放完立即断开，避免快速射击时 AudioNode 无限堆积（卡顿/内存泄漏）
    src.onended = () => src.disconnect();
    src.start();
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- 合成兜底（动漫 / 抖音搞怪风） ---------- */
let noiseBuf = null;

/** 白噪声缓冲（复用） */
function noise() {
  const a = ctx();
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 1, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** 基础包络振荡器 */
function synth(freqStart, freqEnd, dur, type, gain, delay = 0) {
  const a = ctx();
  const o = a.createOscillator();
  const g = a.createGain();
  const t = a.currentTime + delay;
  o.type = type;
  o.connect(g);
  g.connect(a.destination);
  o.frequency.setValueAtTime(freqStart, t);
  o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  // 播放完断开节点，释放音频图资源
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** 清脆"叮"：高频正弦快速衰减 */
function ding(freq, gain, delay = 0) {
  synth(freq, freq * 1.05, 0.12, "sine", gain, delay);
}

/** 动漫"咚"：方波快速上滑 + 短噪声尾 */
function bonk(gain = 0.4) {
  const a = ctx();
  const t = a.currentTime;

  const o = a.createOscillator();
  o.type = "square";
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 2400;
  o.connect(f);
  f.connect(g);
  g.connect(a.destination);
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(420, t + 0.07);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  // 播放完断开整条链，避免连发时 AudioNode 堆积
  o.onended = () => { o.disconnect(); f.disconnect(); g.disconnect(); };
  o.start(t);
  o.stop(t + 0.12);

  const src = a.createBufferSource();
  src.buffer = noise();
  const hp = a.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1200;
  const ng = a.createGain();
  ng.gain.setValueAtTime(gain * 0.4, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  src.connect(hp);
  hp.connect(ng);
  ng.connect(a.destination);
  src.onended = () => { src.disconnect(); hp.disconnect(); ng.disconnect(); };
  src.start(t);
  src.stop(t + 0.04);
}

/** 爆头"叮咚"：咚 + 清脆叮 */
function bonkDing() {
  bonk(0.36);
  ding(2200, 0.16, 0.02);
}

/** 连杀上行三连音（抖音连击感） */
function tripleUp() {
  ding(660, 0.14, 0);
  ding(880, 0.14, 0.08);
  ding(1320, 0.16, 0.16);
}

/** 下滑"咻~"：失败音 */
function swoosh() {
  synth(900, 300, 0.22, "sawtooth", 0.1);
}

/** 低闷"噗"：打空 */
function pop() {
  synth(120, 70, 0.1, "square", 0.12);
}

/** 局末"叮咚" */
function endChime() {
  ding(880, 0.16, 0);
  ding(1320, 0.16, 0.16);
}

/* 内置音效注册表 */
const KILL_SYNTHS = {
  bonk: { label: "动漫咚", fn: () => bonk(0.42) },
  ding: { label: "清脆叮", fn: () => ding(1800, 0.18) },
  triple: { label: "上行连击", fn: () => tripleUp() }
};

const MISS_SYNTHS = {
  swoosh: { label: "下滑咻", fn: () => swoosh() },
  pop: { label: "低闷噗", fn: () => pop() },
  buzz: { label: "错误蜂鸣", fn: () => { synth(200, 160, 0.18, "square", 0.12); synth(150, 120, 0.18, "square", 0.1, 0.2); } }
};

/* ---------- 对外接口 ---------- */
function playEvent(key, synthMap, selKey) {
  // 1. 用户自定义
  if (playBuffer(customBuffers, key)) return;
  // 2. public/sounds/*.mp3
  if (playBuffer(buffers, key)) return;
  // 3. 内置合成
  const entry = synthMap[selKey] || synthMap[Object.keys(synthMap)[0]];
  entry.fn();
}

export function playKill() {
  playEvent("kill", KILL_SYNTHS, getSoundConfig().kill);
}

export function playHeadshot() {
  playEvent("headshot", KILL_SYNTHS, getSoundConfig().kill);
}

export function playMultiKill() {
  playEvent("multikill", KILL_SYNTHS, getSoundConfig().kill);
}

export function playMiss() {
  playEvent("miss", MISS_SYNTHS, getSoundConfig().miss);
}

export function playEnd() {
  playEvent("end", { end: { label: "叮咚", fn: () => endChime() } }, "end");
}

/* ---------- 预览：供 UI 试听 ---------- */
export function previewKill(selKey) {
  (KILL_SYNTHS[selKey] || KILL_SYNTHS.bonk).fn();
}

export function previewMiss(selKey) {
  (MISS_SYNTHS[selKey] || MISS_SYNTHS.swoosh).fn();
}
