#!/usr/bin/env node
/**
 * 把当前分支推送到 GitHub，全程走 REST API，不访问 github.com 主站。
 *
 * 背景：本机 github.com（HTTPS / SSH 22/443）不可达，只有 api.github.com 可通，
 * 因此不能用 `git push`。这里改用 Git Data API：blob → tree → commit → ref。
 *
 * 两种模式自动判断：
 *   - 远端分支已存在 → 增量更新（父提交接远端 head，可正确表达删除）
 *   - 远端分支不存在 → 首次推送（parents: []）
 *
 * 用法：
 *   node scripts/push.mjs [branch]
 *
 * 令牌来源（按优先级）：环境变量 GH_TOKEN → ~/.gh-token 文件
 * 令牌不会打印到任何输出里。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.github.com';
const BRANCH = process.argv[2] || 'main';

// 从 git remote 解析 owner/repo，避免脚本里硬编码
function remoteSlug() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const m = url.match(/github\.com[:/]+([^/]+)\/([^/\s]+?)(?:\.git)?$/);
    if (m) return { owner: m[1], repo: m[2] };
  } catch { /* 没有 origin */ }
  return null;
}

function readToken() {
  const file = join(homedir(), '.gh-token');
  const t = (process.env.GH_TOKEN || '').trim() ||
    (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');
  if (!t) {
    console.error('ERR 缺少令牌：请把 PAT 写入 ~/.gh-token，或设置 GH_TOKEN 环境变量');
    process.exit(2);
  }
  return t;
}

const TOKEN = readToken();
const slug = remoteSlug();
if (!slug) {
  console.error('ERR 找不到 origin，或不是 github.com 地址。请先：git remote add origin https://github.com/<owner>/<repo>.git');
  process.exit(2);
}
const { owner, repo: REPO } = slug;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dsh-plugins-push',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
  }
  if (!res.ok) {
    const e = new Error(`${res.status} ${method} ${path} :: ${json?.message || text}`);
    e.status = res.status;
    e.body = json;
    throw e;
  }
  return json;
}

function git(args) {
  return execFileSync('git', args, { maxBuffer: 512 * 1024 * 1024 });
}

// ── 1. 校验令牌 + 定位仓库 ─────────────────────────────────────
const me = await api('/user');
const repo = await api(`/repos/${owner}/${REPO}`);
console.log(`[1/6] 已认证：${me.login} → ${repo.full_name}`);

// ── 2. 取远端 head 作为父提交（不存在则为首次推送）────────────
let parentSha = null;
try {
  const ref = await api(`/repos/${owner}/${REPO}/git/ref/heads/${BRANCH}`);
  parentSha = ref.object.sha;
  console.log(`[2/6] 远端 ${BRANCH} head：${parentSha.slice(0, 7)}（增量更新）`);
} catch (e) {
  if (e.status !== 404) throw e;
  console.log(`[2/6] 远端无 ${BRANCH} 分支（首次推送）`);
}

// ── 3. 枚举本地对象 ────────────────────────────────────────────
const listing = git(['ls-tree', '-r', '-z', 'HEAD']).toString('utf8');
const entries = listing.split('\0').filter(Boolean).map((line) => {
  const tab = line.indexOf('\t');
  const [mode, type, sha] = line.slice(0, tab).split(' ');
  return { mode, type, sha, path: line.slice(tab + 1) };
});

const submodules = entries.filter((e) => e.mode === '160000');
if (submodules.length) {
  console.error(`ERR 存在子模块，本脚本不支持：${submodules.map((s) => s.path).join(', ')}`);
  process.exit(4);
}
console.log(`[3/6] 本地 HEAD 共 ${entries.length} 个文件`);

// ── 4. 上传 blob（并发）────────────────────────────────────────
const CONCURRENCY = 8;
const blobs = new Array(entries.length);
let cursor = 0;
let done = 0;
let failed = null;

async function worker() {
  while (cursor < entries.length && !failed) {
    const i = cursor++;
    const e = entries[i];
    try {
      const content = git(['cat-file', 'blob', e.sha]);
      const b = await api(`/repos/${owner}/${REPO}/git/blobs`, {
        method: 'POST',
        body: { content: content.toString('base64'), encoding: 'base64' },
      });
      const mode = e.mode === '100755' ? '100755' : e.mode === '120000' ? '120000' : '100644';
      blobs[i] = { path: e.path, mode, type: 'blob', sha: b.sha };
      done++;
      if (done % 10 === 0 || done === entries.length) {
        process.stdout.write(`    ${done}/${entries.length}\r`);
      }
    } catch (err) {
      failed = failed || err;
      return;
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
if (failed) throw failed;
console.log(`[4/6] 已上传 ${done} 个 blob`);

// ── 5. tree + commit ──────────────────────────────────────────
// 不传 base_tree：整棵树由本地重建，本地删掉的文件在远端也会消失。
const tree = await api(`/repos/${owner}/${REPO}/git/trees`, { method: 'POST', body: { tree: blobs } });
const message = git(['log', '-1', '--format=%B', 'HEAD']).toString('utf8').trim();
const commit = await api(`/repos/${owner}/${REPO}/git/commits`, {
  method: 'POST',
  body: { message, tree: tree.sha, parents: parentSha ? [parentSha] : [] },
});
console.log(`[5/6] 已创建提交 ${commit.sha.slice(0, 7)}（tree ${tree.sha.slice(0, 7)}）`);

// ── 6. 移动分支引用 ────────────────────────────────────────────
if (parentSha) {
  await api(`/repos/${owner}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });
  console.log(`[6/6] 已更新 ${BRANCH} → ${commit.sha.slice(0, 7)}`);
} else {
  await api(`/repos/${owner}/${REPO}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${BRANCH}`, sha: commit.sha },
  });
  await api(`/repos/${owner}/${REPO}`, { method: 'PATCH', body: { default_branch: BRANCH } });
  console.log(`[6/6] 已创建 ${BRANCH} 并设为默认`);
}

console.log(`\n完成 → ${repo.html_url}`);
