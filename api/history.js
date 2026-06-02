// GET /api/history?limit=20  → { commits: [{sha, message, date, author}] }
// GET /api/history?sha=<commit_sha>  → { state } (restore that version)

const gh = require("./_github.js");

const DATA_FILENAME = "klausur-data.js";

function b64ToUtf8(b64) { return Buffer.from(b64, "base64").toString("utf8"); }

function parseDataFile(text) {
  const m = text.match(/window\.KLAUSUR_DATA\s*=\s*([\s\S]+?);\s*$/);
  if (!m) throw new Error(`${DATA_FILENAME} format unexpected`);
  return JSON.parse(m[1]);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return gh.sendJson(res, 405, { error: "Method not allowed" });
    }

    const url = new URL(req.url, `http://${req.headers.host || "x"}`);
    const sha = url.searchParams.get("sha");

    // Restore mode: return state at a specific commit
    if (sha) {
      if (!/^[0-9a-f]{40}$/i.test(sha)) {
        return gh.sendJson(res, 400, { error: "Invalid SHA" });
      }
      const c = await gh.getContent(DATA_FILENAME, sha);
      if (!c) return gh.sendJson(res, 404, { error: "klausur-data.js nicht in diesem Commit gefunden" });
      const raw = c.content ? c.content : (await gh.getBlob(c.sha)).content;
      const text = b64ToUtf8(raw);
      const state = parseDataFile(text);
      return gh.sendJson(res, 200, { state });
    }

    // List mode: recent commits that touched klausur-data.js
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10), 50);
    const commits = await gh.gh(
      `/repos/${gh.OWNER}/${gh.REPO}/commits?path=${encodeURIComponent(DATA_FILENAME)}&per_page=${limit}&sha=${gh.BRANCH}`
    );

    const result = (commits || []).map(c => ({
      sha: c.sha,
      message: c.commit.message.split("\n")[0],
      date: c.commit.committer.date,
      author: c.commit.author.name
    }));

    res.setHeader("Cache-Control", "no-store");
    return gh.sendJson(res, 200, { commits: result });
  } catch (e) {
    return gh.sendError(res, e);
  }
};
