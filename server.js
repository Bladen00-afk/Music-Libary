const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const SHARED_TRACKS_DIR = process.env.SHARED_TRACKS_DIR || path.join(ROOT_DIR, "uploads");
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const MAX_SHARED_TRACK_SIZE = 25 * 1024 * 1024;
const configuredStorageLimit = Number(process.env.MAX_SHARED_STORAGE_BYTES);
const MAX_SHARED_STORAGE_BYTES = Number.isSafeInteger(configuredStorageLimit) && configuredStorageLimit > 0
  ? configuredStorageLimit
  : 1024 * 1024 * 1024;
const MAX_SHARED_UPLOADS_PER_HOUR = 5;
const sharedUploadAttempts = new Map();
let reservedSharedBytes = 0;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function setApiCorsHeaders(req, res) {
  if (!ALLOWED_ORIGIN || req.headers.origin !== ALLOWED_ORIGIN) return false;
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
  return true;
}

function sanitizeFileName(value) {
  if (typeof value !== "string") return null;
  const fileName = path.basename(value.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  return fileName && fileName.toLowerCase().endsWith(".mp3") && fileName.toLowerCase() !== ".mp3" ? fileName : null;
}

function hasMp3Signature(header) {
  if (header.subarray(0, 3).toString("ascii") === "ID3") return true;
  if (header[0] !== 0xff || (header[1] & 0xe0) !== 0xe0) return false;
  const version = (header[1] >> 3) & 0x03;
  const layer = (header[1] >> 1) & 0x03;
  return version !== 0x01 && layer !== 0;
}

async function getSharedTracks() {
  await fs.promises.mkdir(SHARED_TRACKS_DIR, { recursive: true });
  const entries = await fs.promises.readdir(SHARED_TRACKS_DIR, { withFileTypes: true });
  const tracks = [];
  for (const entry of entries) {
    const match = entry.name.match(/^([0-9a-f-]{36})--(.+\.mp3)$/i);
    if (!entry.isFile() || !match) continue;
    const stats = await fs.promises.stat(path.join(SHARED_TRACKS_DIR, entry.name));
    tracks.push({ id: match[1], name: match[2].replace(/\.mp3$/i, ""), fileName: match[2], size: stats.size, uploadedAt: stats.mtimeMs });
  }
  return tracks.sort((first, second) => second.uploadedAt - first.uploadedAt);
}

async function getStorageUsage() {
  await fs.promises.mkdir(SHARED_TRACKS_DIR, { recursive: true });
  const entries = await fs.promises.readdir(SHARED_TRACKS_DIR, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (entry.isFile() && /^[0-9a-f-]{36}--.+\.mp3$/i.test(entry.name)) {
      total += (await fs.promises.stat(path.join(SHARED_TRACKS_DIR, entry.name))).size;
    }
  }
  return total;
}

function allowUpload(address) {
  const now = Date.now();
  const record = sharedUploadAttempts.get(address);
  if (!record || record.resetAt <= now) {
    sharedUploadAttempts.set(address, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (record.count >= MAX_SHARED_UPLOADS_PER_HOUR) return false;
  record.count += 1;
  return true;
}

async function writeUpload(req, filePath) {
  let fileHandle;
  let size = 0;
  const header = Buffer.alloc(4);
  let headerSize = 0;
  try {
    fileHandle = await fs.promises.open(filePath, "wx");
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_SHARED_TRACK_SIZE) {
        req.resume();
        const error = new Error("MP3 files must be 25 MB or smaller.");
        error.statusCode = 413;
        throw error;
      }
      const headerBytes = Math.min(header.length - headerSize, chunk.length);
      if (headerBytes > 0) {
        chunk.copy(header, headerSize, 0, headerBytes);
        headerSize += headerBytes;
      }
      await fileHandle.write(chunk);
    }
    await fileHandle.close();
    fileHandle = null;
    if (!size) throw new Error("The uploaded file is empty.");
    if (!hasMp3Signature(header.subarray(0, headerSize))) {
      const error = new Error("The uploaded file does not appear to be an MP3.");
      error.statusCode = 415;
      throw error;
    }
    return size;
  } catch (error) {
    await fileHandle?.close().catch(() => {});
    await fs.promises.rm(filePath, { force: true });
    throw error;
  }
}

async function handleUpload(req, res, url) {
  const fileName = sanitizeFileName(url.searchParams.get("name"));
  if (!fileName) {
    req.resume();
    sendJson(res, 400, { error: "Choose an MP3 file." });
    return;
  }
  const contentLength = Number(req.headers["content-length"]);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    req.resume();
    sendJson(res, 411, { error: "A non-empty file upload is required." });
    return;
  }
  if (contentLength > MAX_SHARED_TRACK_SIZE) {
    req.resume();
    sendJson(res, 413, { error: "MP3 files must be 25 MB or smaller." });
    return;
  }
  if (!allowUpload(req.socket.remoteAddress || "unknown")) {
    req.resume();
    sendJson(res, 429, { error: "Upload limit reached. Try again in an hour." });
    return;
  }

  const id = crypto.randomUUID();
  const filePath = path.join(SHARED_TRACKS_DIR, `${id}--${fileName}`);
  let reserved = false;
  try {
    await fs.promises.mkdir(SHARED_TRACKS_DIR, { recursive: true });
    if (await getStorageUsage() + reservedSharedBytes + contentLength > MAX_SHARED_STORAGE_BYTES) {
      req.resume();
      sendJson(res, 507, { error: "The shared MP3 storage is full." });
      return;
    }
    reservedSharedBytes += contentLength;
    reserved = true;
    const size = await writeUpload(req, filePath);
    sendJson(res, 201, { id, name: fileName.replace(/\.mp3$/i, ""), fileName, size });
  } catch (error) {
    if (!res.headersSent && !res.destroyed) sendJson(res, error.statusCode || 400, { error: error.message || "Upload failed." });
  } finally {
    if (reserved) reservedSharedBytes -= contentLength;
  }
}

async function handleDownload(res, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    sendJson(res, 404, { error: "Track not found." });
    return;
  }
  try {
    const entries = await fs.promises.readdir(SHARED_TRACKS_DIR, { withFileTypes: true });
    const storedName = entries.find((entry) => entry.isFile()
      && entry.name.startsWith(`${id}--`)
      && entry.name.toLowerCase().endsWith(".mp3"))?.name;
    if (!storedName) {
      sendJson(res, 404, { error: "Track not found." });
      return;
    }
    const filePath = path.join(SHARED_TRACKS_DIR, storedName);
    const stats = await fs.promises.stat(filePath);
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": stats.size,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(storedName.slice(38))}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Track not found." });
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    sendJson(res, 400, { error: "Invalid request URL." });
    return;
  }
  const isSharedApi = url.pathname === "/api/shared-tracks" || /^\/api\/shared-tracks\/[^/]+\/download$/.test(url.pathname);
  if (isSharedApi) {
    const corsAllowed = setApiCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      if (!corsAllowed) {
        sendJson(res, 403, { error: "This site is not allowed to access the shared MP3 API." });
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }
    if (ALLOWED_ORIGIN && req.headers.origin && !corsAllowed) {
      sendJson(res, 403, { error: "This site is not allowed to access the shared MP3 API." });
      return;
    }
  }
  if (url.pathname === "/api/shared-tracks") {
    if (req.method === "GET") {
      getSharedTracks().then((tracks) => sendJson(res, 200, tracks)).catch(() => sendJson(res, 500, { error: "Could not load shared tracks." }));
    } else if (req.method === "POST") {
      handleUpload(req, res, url);
    } else {
      res.setHeader("Allow", "GET, POST");
      sendJson(res, 405, { error: "Method not allowed." });
    }
    return;
  }
  const downloadMatch = url.pathname.match(/^\/api\/shared-tracks\/([^/]+)\/download$/);
  if (downloadMatch && req.method === "GET") {
    handleDownload(res, downloadMatch[1]);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.writeHead(405);
    res.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end("Invalid path");
    return;
  }
  const filePath = path.resolve(ROOT_DIR, pathname === "/" ? "index.html" : pathname.slice(1));
  if (filePath !== ROOT_DIR && !filePath.startsWith(`${ROOT_DIR}${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.promises.stat(filePath).then((stats) => {
    if (!stats.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stats.size
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(filePath).pipe(res);
  }).catch(() => {
    res.writeHead(404);
    res.end("Not found");
  });
});

server.listen(PORT, () => {
  console.log(`Music Library running at http://localhost:${PORT}`);
});