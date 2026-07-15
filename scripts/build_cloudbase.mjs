import { copyFileSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/assets", { recursive: true });
mkdirSync("dist/data", { recursive: true });

copyFileSync("index.html", "dist/index.html");

for (const file of ["app.js", "echarts.min.js", "styles.css"]) {
  copyFileSync(`assets/${file}`, `dist/assets/${file}`);
}

for (const file of ["data.js", "sync-meta.js"]) {
  copyFileSync(`data/${file}`, `dist/data/${file}`);
}
