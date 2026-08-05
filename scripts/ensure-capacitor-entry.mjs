import { mkdir, readFile, writeFile } from "node:fs/promises";

const fallback = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Master</title>
  </head>
  <body>
    <p>Master 正在连接，请保持网络连接后重试。</p>
  </body>
</html>
`;

await mkdir("dist", { recursive: true });
try {
  await readFile("dist/index.html");
} catch {
  await writeFile("dist/index.html", fallback, "utf8");
}
