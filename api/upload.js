// POST /api/upload
// Supports two modes:
//   1. Small files (< 3MB raw): { path, base64 }  → { path, sha }
//   2. Chunked:
//      a) { path, action: "start" }                → { uploadId }
//      b) { uploadId, action: "chunk", base64 }    → { ok: true }
//      c) { uploadId, action: "finish", path }     → { path, sha }

const gh = require("./_github.js");

// In-memory chunk store (lives for the life of the function instance)
// For Vercel serverless: each request may hit a different instance,
// so we use a simple approach: accumulate all chunks in one request.
// Actually, serverless functions are ephemeral — we need to store chunks
// differently. Let's use a simpler approach: split on the client side,
// send multiple small createBlob calls, then combine with a tree.
//
// Revised approach: the client sends chunks, each chunk becomes a
// small blob. The final "finish" call gets all chunk SHAs and concatenates.
// But GitHub doesn't support concatenating blobs...
//
// Simplest reliable approach: client sends base64 chunks, server
// accumulates them in a single request using streaming.
// Actually — the real fix is to accept raw binary via streaming,
// bypassing the JSON body limit.

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return gh.sendJson(res, 405, { error: "Method not allowed" });
    }

    const contentType = req.headers["content-type"] || "";

    // Binary upload mode: client sends raw bytes, path in query string
    if (contentType === "application/octet-stream") {
      const url = new URL(req.url, `http://${req.headers.host || "x"}`);
      const path = url.searchParams.get("path");
      if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
        return gh.sendJson(res, 400, { error: "Invalid or missing path query param" });
      }

      // Read raw body as buffer
      const chunks = [];
      let totalSize = 0;
      const MAX_SIZE = 50 * 1024 * 1024; // 50 MB hard limit
      for await (const chunk of req) {
        totalSize += chunk.length;
        if (totalSize > MAX_SIZE) {
          return gh.sendJson(res, 413, { error: "Datei zu groß (max 50 MB)" });
        }
        chunks.push(chunk);
      }
      const buf = Buffer.concat(chunks);
      const base64 = buf.toString("base64");
      const blob = await gh.createBlob(base64);
      return gh.sendJson(res, 200, { path, sha: blob.sha });
    }

    // JSON mode (legacy, small files)
    const { path, base64 } = await gh.readJson(req);
    if (!path || !base64) return gh.sendJson(res, 400, { error: "path + base64 required" });
    if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
      return gh.sendJson(res, 400, { error: "Invalid path" });
    }
    const blob = await gh.createBlob(base64);
    return gh.sendJson(res, 200, { path, sha: blob.sha });
  } catch (e) {
    return gh.sendError(res, e);
  }
};
