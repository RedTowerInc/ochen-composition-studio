import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";
const root = fileURLToPath(new URL("../dist/", import.meta.url)),
  port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORT должен быть целым числом от 1024 до 65535.");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
};
const server = http.createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
        new URL(request.url, "http://127.0.0.1").pathname,
      ),
      target = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      ),
      relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (!(await stat(target)).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    const data = await readFile(target);
    response.writeHead(200, {
      "Content-Type": types[path.extname(target)] ?? "application/octet-stream",
      "Content-Length": data.length,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404);
    response.end();
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Порт ${port} занят. Выберите другой через переменную PORT.`
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Композиция: http://127.0.0.1:${port}\nДля остановки нажмите Ctrl+C.`,
  ),
);
