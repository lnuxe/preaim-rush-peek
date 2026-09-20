import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    host: true,
    open: false,
    // 允许任意访问域名（CloudStudio 预览分配 *.myide.io 动态子域名）
    allowedHosts: true
  },
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: false
  }
});
