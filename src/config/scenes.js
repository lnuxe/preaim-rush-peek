/**
 * 场景配置（对应 PRD §5 场景变体）
 * 数据驱动：房间尺寸、甩枪幅度、目标半径均由 JSON 描述
 */
export const SCENES = {
  "rush-peek": {
    key: "rush-peek",
    name: "Rush Peek",
    // 目标区相对屏幕中心的比例（左右甩枪幅度）
    regionInner: 0.08,
    regionOuter: 0.34,
    baseRadius: 26,
    wide: false
  },
  "rush-peek-wide": {
    key: "rush-peek-wide",
    name: "Rush Peek Wide",
    regionInner: 0.12,
    regionOuter: 0.40,
    baseRadius: 22,
    wide: true
  }
};

export const ROUND_DURATION = 60; // 单局时长（秒）
export const KILLS_PER_LEVEL = 5; // 每 5 击杀升 1 级
