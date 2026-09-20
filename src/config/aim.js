/**
 * 瞄准配置：对齐无畏契约（Valorant-accurate）
 * 水平 FOV 103° / 灵敏度 0.07°/count（1:1 手感）/ raw input
 * 参考：github.com/Pratilectron/valotrainer
 */

const STORE_KEY = "preaim.aim.v1";

// 无畏契约基准：鼠标每移动 1 个原始计数，视角转动 0.07°
// 浏览器 Pointer Lock 下 movementX/Y 以像素为单位，此处按 1 像素 ≈ 1 count 近似 1:1
export const BASE_SENS = 0.07;

export const DEFAULT_AIM = {
  sensitivity: 1.0, // 灵敏度倍率（1.0 = 无畏契约 1:1）
  fov: 103,         // 水平 FOV（无畏契约标准 103°）
  invertY: false    // 反转 Y 轴
};

function load() {
  try {
    return { ...DEFAULT_AIM, ...(JSON.parse(localStorage.getItem(STORE_KEY)) || {}) };
  } catch (e) {
    return { ...DEFAULT_AIM };
  }
}

export function getAimConfig() {
  return load();
}

export function setAimConfig(cfg) {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    sensitivity: cfg.sensitivity,
    fov: cfg.fov,
    invertY: cfg.invertY
  }));
}
