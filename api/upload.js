// POST /api/upload  body: { path, base64 }  → { path, sha }
// Creates a Git blob with the uploaded file's content.
// The blob is NOT yet committed — it gets referenced in the next /api/data POST.

const gh = require("./_github.js");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return gh.sendJson(res, 405, { error: "Method not allowed" });
    }
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
