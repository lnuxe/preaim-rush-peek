import * as THREE from "three";

/**
 * 菜单 3D 粒子波浪背景（鼠标跟随互动）
 * 玩法参考抖音/GitHub 爆火的「粒子波浪 + 鼠标涟漪」效果（Vanta WAVE / particle-wave 同类）：
 *  - GPU 点云斜 45° 俯视，红色信号色点阵波浪起伏
 *  - 鼠标移动：点阵产生涟漪隆起 + 相机轻微视差跟随
 *  - 骨白 → 信号红渐变着色，贴合 VALORANT 设计语言
 */

const BG_COLOR = 0x0f1923; // blacksite 画布色

export class MenuBg {
  constructor() {
    this.mouse = { x: 0, y: 0 };      // 归一化鼠标（-1 ~ 1）
    this.smooth = { x: 0, y: 0 };     // 平滑后相机视差
    this.pointer = { x: 0, y: 0 };    // 平滑后的涟漪源
    this.targetPointer = { x: 0, y: 0 };

    this._init();
    this._bind();
    this._loop();
  }

  _init() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.id = "menu-bg";
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = null;

    // 斜 45° 俯视相机
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 7.5, 9);
    this.camera.lookAt(0, 0, 0);

    // ---- 粒子波浪网格 ----
    // 性能：100×56=5600 点（原 120×68=8160，-31%）。每帧 CPU 重算全部顶点高度，
    // 点距 0.34 仍远小于粒子尺寸 0.045*衰减，视觉密度几乎无感。
    const COLS = 100, ROWS = 56;
    const W = 34, D = 20;
    const count = COLS * ROWS;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);

    this.base = new Float32Array(count * 2); // 基础 xz 坐标
    let i = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c / (COLS - 1) - 0.5) * W;
        const z = (r / (ROWS - 1) - 0.5) * D;
        positions[i * 3] = x;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = z;
        // 骨白→信号红按深度渐变
        const t = (z / D + 0.5);
        const cR = 0.93 + (1.0 - 0.93) * t;   // #ece8e1 → #ff4655
        const cG = 0.91 + (0.275 - 0.91) * t;
        const cB = 0.88 + (0.33 - 0.88) * t;
        colors[i * 3] = cR;
        colors[i * 3 + 1] = cG;
        colors[i * 3 + 2] = cB;
        seeds[i] = Math.random() * Math.PI * 2;
        this.base[i * 2] = x;
        this.base[i * 2 + 1] = z;
        i++;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.045,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scene.add(this.points);
  }

  _bind() {
    window.addEventListener("pointermove", (e) => {
      const nx = (e.clientX / innerWidth) * 2 - 1;
      const ny = (e.clientY / innerHeight) * 2 - 1;
      this.mouse.x = nx;
      this.mouse.y = ny;
      // 涟漪源：把屏幕坐标反投影到波浪平面
      this.targetPointer.x = nx * (17 * 0.5);  // 半宽 17
      this.targetPointer.y = ny * (12 * 0.5) + 2; // 半深 12，中心偏前
    });
    window.addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  _loop() {
    // 使用 performance.now 计时（THREE.Clock 已废弃警告）
    if (!this._t0) this._t0 = performance.now();
    const pos = this.points.geometry.attributes.position;
    const arr = pos.array;

    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const t = (performance.now() - this._t0) / 1000;

      // 平滑鼠标（视差 + 涟漪）
      this.smooth.x += (this.mouse.x - this.smooth.x) * 0.05;
      this.smooth.y += (this.mouse.y - this.smooth.y) * 0.05;
      this.pointer.x += (this.targetPointer.x - this.pointer.x) * 0.08;
      this.pointer.y += (this.targetPointer.y - this.pointer.y) * 0.08;

      // CPU 更新顶点（120×68≈8k 点，性能可控）
      for (let i = 0; i < arr.length / 3; i++) {
        const x = this.base[i * 2];
        const z = this.base[i * 2 + 1];

        // 基础波浪：多层正弦叠加
        let y =
          Math.sin(x * 0.45 + t * 1.1) * 0.28 +
          Math.sin(z * 0.6 + t * 0.8) * 0.22 +
          Math.sin((x + z) * 0.3 + t * 0.5) * 0.16;

        // 鼠标涟漪：高斯衰减隆起
        const dx = x - this.pointer.x;
        const dz = z - this.pointer.y;
        const d2 = dx * dx + dz * dz;
        y += Math.exp(-d2 * 0.09) * 1.5;

        arr[i * 3 + 1] = y;
      }
      pos.needsUpdate = true;

      // 相机视差跟随（微幅）
      this.camera.position.x = this.smooth.x * 0.9;
      this.camera.position.y = 7.5 - this.smooth.y * 0.5;
      this.camera.lookAt(0, 0, 0);

      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  /** 暂停渲染（进入玩法时释放 GPU 压力） */
  pause() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this.renderer.domElement.classList.add("paused");
  }

  resume() {
    this.renderer.domElement.classList.remove("paused");
    if (!this._raf) this._loop();
  }

  dispose() {
    this.pause();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
