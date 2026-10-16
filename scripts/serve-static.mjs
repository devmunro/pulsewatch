import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const outputRoot = resolve(process.cwd(), "out");
const portIndex = process.argv.indexOf("--port");
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 5193);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

await stat(resolve(outputRoot, "index.html"));

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    const target = resolve(outputRoot, `.${pathname}`);
    if (target !== outputRoot && !target.startsWith(`${outputRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }

    let file = target;
    try {
      if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    } catch {
      // CloudFront's SPA rewrite serves the app shell for client-side paths.
      file = resolve(outputRoot, "index.html");
    }

    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": contentTypes[extname(file)] || "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch {
    response.writeHead(400).end();
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`PulseWatch static preview listening on http://127.0.0.1:${port}\n`);
});
