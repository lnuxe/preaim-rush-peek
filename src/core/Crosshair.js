import * as PIXI from "pixi.js";
import { crosshairColor } from "../config/crosshair.js";

/**
 * 参数化准星渲染（Graphics）
 * 性能优化：准星形状在原点(0,0)一次性绘制，位置移动用 transform 平移，
 * 仅在配置或开火扩散变化时重绘，避免每帧 clear + stroke。
 */
export class Crosshair {
  constructor(parent) {
    this.g = new PIXI.Graphics();
    this.g.visible = false;
    parent.addChild(this.g);
    this.x = 0;
    this.y = 0;
    this.cfg = null;
    this._spread = 0;
    this._dirty = true;
  }

  setConfig(cfg) { this.cfg = cfg; this._dirty = true; }
  setVisible(v) { this.g.visible = v; }
  move(x, y) {
    this.x = x;
    this.y = y;
    this.g.position.set(x, y);
  }

  set spread(v) {
    if (v !== this._spread) { this._spread = v; this._dirty = true; }
  }
  get spread() { return this._spread; }

  draw() {
    if (!this._dirty) return;
    this._dirty = false;

    const g = this.g;
    g.clear();
    const c = this.cfg;
    if (!c) return;

    const color = crosshairColor(c);
    // 形状统一绘制在原点，实际位置由 g.position 平移
    this.drawLineSet(g, c.inner, c.inner.opacity, color, 0, 0);
    this.drawLineSet(g, c.outer, c.outer.opacity, color, 0, 0);

    if (c.centerDot) {
      const dz = c.centerDotSize * 0.8 + 1;
      g.circle(0, 0, dz).fill({ color, alpha: c.centerDotOpacity });
    }
  }

  drawLineSet(g, lines, opacity, color, x, y) {
    if (opacity <= 0) return;
    const s = this._spread;
    const len = lines.length * 2.4 + (lines.firingError ? s * 22 : 0);
    const off = lines.offset * 1.8 + (lines.firingError ? s * 9 : 0);
    const thick = lines.thickness;

    if (this.cfg.outline && this.cfg.outlineOpacity > 0) {
      const ow = thick + this.cfg.outlineThickness * 2;
      this.strokeCross(g, x, y, off, len, ow, 0x000000, this.cfg.outlineOpacity);
    }
    this.strokeCross(g, x, y, off, len, thick, color, opacity);
  }

  strokeCross(g, x, y, off, len, width, color, alpha) {
    g.moveTo(x, y - off).lineTo(x, y - off - len);
    g.moveTo(x, y + off).lineTo(x, y + off + len);
    g.moveTo(x - off, y).lineTo(x - off - len, y);
    g.moveTo(x + off, y).lineTo(x + off + len, y);
    g.stroke({ width, color, alpha });
  }
}
