import * as PIXI from "pixi.js";

/**
 * 几何房间渲染（伪 3D 第一人称视角）
 * 地板 / 天花板 / 左右墙 / 后墙 + 透视网格 + 左右刷新区高亮
 */
export class Room {
  constructor(parent) {
    this.g = new PIXI.Graphics();
    parent.addChild(this.g);
  }

  build(w, h, scene) {
    const g = this.g;
    g.clear();
    const cx = w / 2;
    const backL = w * 0.18, backR = w * 0.82;
    const backT = h * 0.20, backB = h * 0.80;

    // 地板
    g.moveTo(0, h).lineTo(backL, backB).lineTo(backR, backB).lineTo(w, h).closePath()
      .fill("#0b1220");
    // 天花板
    g.moveTo(0, 0).lineTo(backL, backT).lineTo(backR, backT).lineTo(w, 0).closePath()
      .fill("#0a0f1b");
    // 左墙
    g.moveTo(0, 0).lineTo(backL, backT).lineTo(backL, backB).lineTo(0, h).closePath()
      .fill("#0e1526");
    // 右墙
    g.moveTo(w, 0).lineTo(backR, backT).lineTo(backR, backB).lineTo(w, h).closePath()
      .fill("#0e1526");
    // 后墙
    g.rect(backL, backT, backR - backL, backB - backT).fill("#101828");

    // 后墙描边 + 中线
    g.rect(backL, backT, backR - backL, backB - backT)
      .stroke({ width: 1, color: 0x00e0ff, alpha: 0.18 });
    g.moveTo(cx, backT).lineTo(cx, backB).stroke({ width: 1, color: 0x00e0ff, alpha: 0.1 });

    // 地板透视网格
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = backL + (backR - backL) * t;
      g.moveTo(x, backB).lineTo(cx + (x - cx) * 3.2, h)
        .stroke({ width: 1, color: 0x5a82c8, alpha: 0.12 });
    }
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const y = backB + (h - backB) * t;
      g.moveTo(backL, y).lineTo(backR, y)
        .stroke({ width: 1, color: 0x5a82c8, alpha: 0.12 });
    }

    // 左右刷新区高亮
    const zoneY = backT + (backB - backT) * 0.5;
    const zh = backB - backT;
    this.drawZone(g, cx - (cx - backL) * 0.72, zoneY, (cx - backL) * 0.5, zh, 0xff4655);
    this.drawZone(g, cx + (backR - cx) * 0.72, zoneY, (backR - cx) * 0.5, zh, 0x00e0ff);
  }

  drawZone(g, cx, cy, halfW, h, color) {
    g.rect(cx - halfW / 2, cy - h / 2, halfW, h).fill({ color, alpha: 0.04 });
    g.rect(cx - halfW / 2, cy - h / 2, halfW, h)
      .stroke({ width: 1, color, alpha: 0.2 });
  }
}
