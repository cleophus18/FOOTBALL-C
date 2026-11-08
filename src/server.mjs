import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const mime = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(target);
    response.writeHead(200, { "content-type": mime[extname(target)] ?? "application/octet-stream" });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      response.writeHead(404).end("Not found");
      return;
    }
    console.error("Static file request failed:", error);
    response.writeHead(500).end("Server error");
  }
});

const host = process.env.HOST ?? "127.0.0.1";
const requestedPort = Number(process.env.PORT ?? 4173);

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  throw new Error(`Invalid PORT "${process.env.PORT}". Choose a port from 0 to 65535.`);
}

function listen(port, allowFallback = true) {
  const onError = (error) => {
    server.off("listening", onListening);
    if (error.code === "EADDRINUSE" && allowFallback && !process.env.PORT && port === 4173) {
      console.warn("Port 4173 is already in use; trying port 4199.");
      listen(4199, false);
      return;
    }
    console.error(`Could not start the server at http://${host}:${port}: ${error.message}`);
    if (error.code === "EADDRINUSE") {
      console.error("Set PORT to another available port, then run npm start again.");
    }
    process.exitCode = 1;
  };
  const onListening = () => {
    server.off("error", onError);
    const address = server.address();
    console.log(`Football Career Simulator running at http://${host}:${address.port}`);
  };

  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(port, host);
}

listen(requestedPort);
