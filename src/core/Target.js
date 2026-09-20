/**
 * 目标逻辑（纯逻辑，不依赖渲染库）
 * 对应 PRD §4：numTargets=1、对侧刷新、左右严格交替、clickSingle、removeClosestOnMiss
 */

/** 当前目标半径（随等级动态缩放，targetRadiusMultiplier） */
export function currentRadius(scene, level) {
  const scale = Math.pow(0.95, level - 1);
  return Math.max(scene.baseRadius * scale, scene.baseRadius * 0.6);
}

/**
 * 计算对侧刷新区（屏幕坐标）
 * side: 0=右侧, 1=左侧
 */
export function spawnRegion(scene, w, h, side) {
  const cx = w / 2, cy = h / 2;
  const inner = scene.regionInner * w;
  const outer = scene.regionOuter * w;
  const dir = side === 0 ? 1 : -1;
  const x = cx + dir * (inner + Math.random() * (outer - inner));
  const y = cy + (Math.random() * 2 - 1) * h * 0.22;
  return { x, y };
}

/** 生成目标数据对象（位置 + 半径 + 归属侧 + ghost 时长） */
export function createTarget(scene, w, h, side, level, timeLeft) {
  const r = currentRadius(scene, level);
  const { x, y } = spawnRegion(scene, w, h, side);
  const ghostDur = 0.28;
  return {
    x, y, r, side,
    ghostUntil: performance.now() + ghostDur * 1000,
    spawnAt: performance.now()
  };
}

/** 命中检测（圆形碰撞体 + 容差） */
export function hitTest(target, mx, my) {
  if (!target) return false;
  const now = performance.now();
  if (now < target.ghostUntil) return false; // ghost 态不可击杀
  return Math.hypot(mx - target.x, my - target.y) <= target.r + 4;
}
