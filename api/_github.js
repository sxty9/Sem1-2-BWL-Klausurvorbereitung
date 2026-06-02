// Shared GitHub API helpers for the serverless functions.

const TOKEN  = process.env.GITHUB_TOKEN;
const OWNER  = process.env.GITHUB_OWNER  || "sxty9";
const REPO   = process.env.GITHUB_REPO   || "Sem1-2-BWL-Klausurvorbereitung";
const BRANCH = process.env.GITHUB_BRANCH || "main";

function assertToken() {
  if (!TOKEN) {
    const e = new Error("GITHUB_TOKEN env variable missing on the server");
    e.status = 500; throw e;
  }
}

async function gh(path, opts = {}) {
  assertToken();
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "bwl-klausur-app",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); if (j.message) msg += `: ${j.message}`; } catch (e) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

const repoBase = () => `/repos/${OWNER}/${REPO}`;
const branch   = () => BRANCH;

async function getRefSha()   { return (await gh(`${repoBase()}/git/refs/heads/${BRANCH}`)).object.sha; }
async function getCommit(sha){ return gh(`${repoBase()}/git/commits/${sha}`); }
async function getContent(p, ref) {
  const r = ref || BRANCH;
  try { return await gh(`${repoBase()}/contents/${encodeURI(p)}?ref=${encodeURIComponent(r)}`); }
  catch (e) { if (e.status === 404) return null; throw e; }
}
async function getTree()     { return gh(`${repoBase()}/git/trees/${BRANCH}?recursive=1`); }
async function getBlob(sha)  { return gh(`${repoBase()}/git/blobs/${sha}`); }
async function createBlob(content) {
  return gh(`${repoBase()}/git/blobs`, { method: "POST", body: JSON.stringify({ content, encoding: "base64" }) });
}
async function createTree(baseTree, entries) {
  return gh(`${repoBase()}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree: entries }) });
}
async function createCommit(message, tree, parent) {
  return gh(`${repoBase()}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree, parents: [parent] }) });
}
async function updateRef(sha) {
  return gh(`${repoBase()}/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha, force: false }) });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ""; req.setEncoding("utf8");
    req.on("data", c => { raw += c; if (raw.length > 9 * 1024 * 1024) reject(new Error("payload too large")); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
function sendError(res, e) {
  const status = e.status || 500;
  sendJson(res, status, { error: e.message || String(e) });
}

module.exports = {
  OWNER, REPO, BRANCH,
  gh, getRefSha, getCommit, getContent, getTree, getBlob,
  createBlob, createTree, createCommit, updateRef,
  readJson, sendJson, sendError, branch, repoBase
};

