// GET /api/files  → { files: ["Skript1.pdf", "notes/foo.pdf", ...] }

const gh = require("./_github.js");

const HIDE = new Set([
  "index.html",
  "klausur-data.js",
  "package.json",
  "package-lock.json",
  "vercel.json",
  "CLAUDE.MD",
  "CLAUDE.md",
  ".gitignore"
]);

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return gh.sendJson(res, 405, { error: "Method not allowed" });
    }
    const tree = await gh.getTree();
    const files = (tree.tree || [])
      .filter(e => e.type === "blob"
        && !e.path.startsWith(".")
        && !e.path.startsWith("api/")
        && !HIDE.has(e.path))
      .map(e => e.path)
      .sort((a, b) => a.localeCompare(b));
    res.setHeader("Cache-Control", "no-store");
    return gh.sendJson(res, 200, { files });
  } catch (e) {
    return gh.sendError(res, e);
  }
};
