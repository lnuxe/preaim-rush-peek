/**
 * 构建后处理：将 dist/agents_3d 下的 OBJ 模型 gzip 压缩为 .obj.gz，
 * 并删除运行时不需要的 input.png，显著减小部署体积。
 * （前端 Agent3D.js 在生产环境会读取 .obj.gz 并用 DecompressionStream 解压）
 */
import { gzipSync } from "node:zlib";
import { readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../dist/agents_3d/", import.meta.url).pathname;

try {
  const agents = await readdir(ROOT, { withFileTypes: true });
  let objCount = 0;
  let savedTotal = 0;

  for (const entry of agents) {
    if (!entry.isDirectory()) continue;
    const dir = join(ROOT, entry.name);
    const files = await readdir(dir);

    for (const f of files) {
      const filePath = join(dir, f);

      // 删除运行时不需要的输入图
      if (f === "input.png") {
        await unlink(filePath).catch(() => {});
        continue;
      }

      if (f === "mesh.obj") {
        const raw = await readFile(filePath);
        const gz = gzipSync(raw, { level: 9 });
        await writeFile(filePath + ".gz", gz);
        await unlink(filePath).catch(() => {});
        objCount++;
        savedTotal += raw.length - gz.length;
      }
    }
  }

  console.log(
    `[compress-obj] 压缩 ${objCount} 个 OBJ，节省 ${(savedTotal / 1024 / 1024).toFixed(1)} MB`
  );
} catch (e) {
  console.error("[compress-obj] 处理失败：", e.message);
  process.exit(1);
}
