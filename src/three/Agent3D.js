import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

/**
 * 特工 3D 模型加载器（TripoSR 顶点着色 OBJ）
 * - 模型来自 public/agents_3d/{id}/mesh.obj（顶点色，无 UV / 贴图）
 * - 加载后归一化：居中到原点、最大维度缩放为 1，材质换为可受光的标准材质
 * - 带缓存，重复 spawn 不重复请求
 */

const BASE = import.meta.env.BASE_URL || "./";

const cache = new Map();   // id -> Group（已归一化）
const loading = new Map(); // id -> Promise<Group|null>

/**
 * 获取特工 3D 模型（带缓存）。
 * @param {string} id 特工 id（对应 public/agents_3d/{id}/）
 * @returns {Promise<THREE.Group|null>} 加载失败返回 null
 */
export function getAgentModel(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (loading.has(id)) return loading.get(id);
  const p = loadModel(id).then((group) => {
    if (group) cache.set(id, group);
    return group;
  });
  loading.set(id, p);
  return p;
}

async function loadModel(id) {
  try {
    // 生产构建将 OBJ gzip 压缩为 .obj.gz，显著减小部署体积；开发环境直接读 .obj
    const gz = import.meta.env.PROD;
    const base = `${BASE}agents_3d/${id}/mesh.obj`;
    let url = gz ? base + ".gz" : base;
    let res = await fetch(url);
    if (!res.ok && gz) {
      // .gz 缺失（未跑 compress-obj 的部署）时回退未压缩 .obj
      console.warn(`[Agent3D] ${id} 无 .obj.gz，回退 .obj`);
      url = base;
      res = await fetch(url);
    }
    if (!res.ok) {
      console.warn(`[Agent3D] 模型 ${id} 请求失败 (${res.status})，回退立绘`);
      return null;
    }

    // 若服务器已对 .gz 自动返回 Content-Encoding: gzip（如 vite preview / nginx gzip_static），
    // 浏览器 fetch 会自动解压，直接 res.text() 即可；否则（普通静态服务器）需手动解压。
    const autoDecoded = (res.headers.get("Content-Encoding") || "").includes("gzip");
    let text;
    if (gz && !autoDecoded && typeof DecompressionStream !== "undefined") {
      try {
        const ds = new DecompressionStream("gzip");
        text = await new Response(res.body.pipeThrough(ds)).text();
      } catch (e) {
        // SPA 服务器对 404 会 fallback 成 index.html（200），DecompressionStream 解压 HTML 会抛错
        console.warn(`[Agent3D] ${id} gzip 解压失败（疑似返回非 gzip 内容），回退立绘`);
        return null;
      }
    } else {
      text = await res.text();
    }

    // 内容校验：确为 OBJ 文本而非 HTML/二进制乱码（SPA fallback 或 Content-Type 错配时）
    const head = text.trimStart().slice(0, 200);
    if (!head || !/^(v |o |#|mtllib|usemtl)/.test(head) && !head.includes("\nv ")) {
      console.warn(`[Agent3D] ${id} 返回内容不是有效 OBJ（前 40 字符: ${JSON.stringify(head.slice(0, 40))}），回退立绘`);
      return null;
    }

    const group = normalize(new OBJLoader().parse(text));
    // 空模型（无可渲染网格）视为加载失败，避免目标不可见/无法命中
    if (!group || !hasMesh(group)) {
      console.warn(`[Agent3D] ${id} 解析后无可用网格，回退立绘`);
      return null;
    }
    return group;
  } catch (e) {
    console.warn(`[Agent3D] ${id} 加载失败:`, e);
    return null;
  }
}

/** 是否至少包含一个可渲染网格 */
function hasMesh(group) {
  let found = false;
  group.traverse((c) => {
    if (c.isMesh) found = true;
  });
  return found;
}

/** 归一化：换材质 + 旋转校正 + 居中 + 缩放到单位高度 */
function normalize(obj) {
  // TripoSR 坐标系为 Z-up（z=up 上，脸朝 +x），three.js 为 Y-up 且模型面朝 +Z。
  // 目标映射：(x,y,z) → (y, z, x)，即 Z(上)→Y(上) 直立、脸(+X)→+Z 面向玩家。
  // 注意：rotateX/rotateY 是绕局部轴（四元数右乘），连续调用实际按“先世界 Y 后世界 X”合成，
  // 因此必须先 rotateY 再 rotateX，等价于世界轴“先绕 X -90° 再绕 Y -90°”。
  obj.rotateY(-Math.PI / 2);
  obj.rotateX(-Math.PI / 2);
  obj.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim <= 0) return obj;

  obj.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.05
      });
    }
  });

  const scale = 1 / maxDim;
  obj.scale.setScalar(scale);
  obj.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  return obj;
}
