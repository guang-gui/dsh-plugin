/**
 * 发版控制台的浏览器页面：单文件 HTML（内嵌样式与脚本），不依赖任何前端构建。
 *
 * 页面通过同源的 /release-ui/api/* 调用宿主服务，全程不经过模型。
 * 注意：本文件是 TypeScript 模板字符串，页面内脚本只能用单引号字符串拼接，
 * 不要出现反引号或 ${ 占位，避免与外层模板冲突。
 */

export const WEB_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>批量发版</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #f6f6f4;
  --card: #ffffff;
  --text: #1f1f1e;
  --muted: #6b6b66;
  --line: #e2e1dc;
  --accent: #185fa5;
  --accent-fg: #ffffff;
  --ok: #0f6e56;
  --warn: #854f0b;
  --bad: #a32d2d;
  --chip: #f1efe8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1b1a;
    --card: #232322;
    --text: #ececea;
    --muted: #a3a39d;
    --line: #37372f;
    --accent: #85b7eb;
    --accent-fg: #0c2338;
    --ok: #5dcaa5;
    --warn: #ef9f27;
    --bad: #f09595;
    --chip: #2c2c2a;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}
header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--line); background: var(--card);
  position: sticky; top: 0; z-index: 5;
}
h1 { font-size: 16px; font-weight: 500; margin: 0; }
#status { color: var(--muted); font-size: 13px; }
main { max-width: 1080px; margin: 0 auto; padding: 20px 24px 64px; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 18px 20px; margin-bottom: 16px;
}
h2 { font-size: 14px; font-weight: 500; margin: 0 0 14px; }
.grid { display: grid; grid-template-columns: 96px 1fr; gap: 10px 14px; align-items: start; }
.grid > label { color: var(--muted); padding-top: 7px; font-size: 13px; }
input[type=text], select, textarea {
  width: 100%; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg); color: var(--text); font: inherit;
}
input[type=text]:focus, select:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
textarea { resize: vertical; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 168px; overflow: auto; padding: 2px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
  border: 1px solid var(--line); border-radius: 999px; background: var(--chip);
  cursor: pointer; font-size: 13px; user-select: none;
}
.chip input { margin: 0; }
.chip.off { opacity: .55; }
.actions { display: flex; gap: 10px; align-items: center; margin-top: 16px; }
button {
  padding: 8px 18px; border-radius: 8px; border: 1px solid transparent;
  background: var(--accent); color: var(--accent-fg); font: inherit; cursor: pointer;
}
button.secondary { background: transparent; color: var(--text); border-color: var(--line); }
button:disabled { opacity: .5; cursor: default; }
.hint { color: var(--muted); font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 400; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
.tag.ok { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }
.tag.warn { background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); }
.tag.bad { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad); }
.tag.plain { background: var(--chip); color: var(--muted); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.summary { display: flex; flex-wrap: wrap; gap: 18px; color: var(--muted); font-size: 13px; margin-bottom: 12px; }
.summary b { color: var(--text); font-weight: 500; }
pre {
  background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
  padding: 10px 12px; font-size: 12px; overflow: auto; white-space: pre-wrap; margin: 0;
}
.toast {
  position: sticky; bottom: 16px; margin: 12px auto 0; width: fit-content;
  background: var(--text); color: var(--bg); padding: 8px 16px; border-radius: 999px;
  font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none;
}
.toast.show { opacity: 1; }
details summary { cursor: pointer; color: var(--muted); font-size: 13px; }
.muted { color: var(--muted); }
details summary h2 { display: inline; }
.browse { margin-top: 8px; border: 1px solid var(--line); border-radius: 8px; max-height: 220px; overflow: auto; }
.browse .row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); font-size: 13px; }
.browse .row:last-child { border-bottom: 0; }
.browse .row .name { flex: 1; cursor: pointer; word-break: break-all; }
.browse .row .name:hover { color: var(--accent); }
.browse .row button { padding: 2px 10px; font-size: 12px; }
.root { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--chip); font-size: 13px; }
.root button { padding: 0 3px; background: transparent; border: 0; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; }
.root button:hover { color: var(--bad); }
.inline { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.inline input[type=text] { flex: 1; }
.inline button { padding: 7px 14px; }
.task { padding: 8px 0; border-bottom: 1px solid var(--line); }
.task:last-child { border-bottom: 0; }
.task > summary { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
.task > summary b { font-weight: 500; }
.task > summary .muted { font-size: 12px; }
.task table { margin-top: 10px; }
.task button { margin-top: 10px; padding: 5px 12px; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>批量发版</h1>
  <div id="status">正在加载…</div>
</header>
<main>
  <div class="card">
    <details id="settingsCard">
      <summary><h2>设置</h2> <span class="hint" id="settingsHint">GitLab 地址、令牌、扫描目录</span></summary>
      <div class="grid" style="margin-top:16px">
        <label>GitLab 地址</label>
        <div>
          <input type="text" id="setBaseUrl" placeholder="https://git.example.com" autocomplete="off">
          <div class="hint">留空则只能「本地合并后推送」，无法创建或合并 MR</div>
        </div>

        <label>令牌</label>
        <div>
          <input type="password" id="setToken" autocomplete="new-password">
          <div class="hint" id="setTokenHint"></div>
        </div>

        <label>扫描目录</label>
        <div>
          <div class="chips" id="rootList"></div>
          <div class="inline">
            <input type="text" id="browsePath" placeholder="输入目录路径后点「浏览」，例如 D:\\xls-code" autocomplete="off">
            <button id="browseBtn" class="secondary" type="button">浏览</button>
            <button id="addRootBtn" class="secondary" type="button">直接添加</button>
          </div>
          <div class="browse" id="browseList" hidden></div>
        </div>

        <label>扫描深度</label>
        <div>
          <select id="setDepth">
            <option value="1">1 层</option>
            <option value="2">2 层</option>
            <option value="3">3 层</option>
            <option value="4">4 层</option>
            <option value="5">5 层</option>
            <option value="6">6 层</option>
            <option value="8">8 层</option>
          </select>
          <div class="hint">目录层级深、仓库多时调大；扫描会变慢</div>
        </div>

        <label>默认目标分支</label>
        <input type="text" id="setTarget" placeholder="master" autocomplete="off">

        <label>并发数</label>
        <div>
          <select id="setConcurrency">
            <option value="2">2</option>
            <option value="4">4</option>
            <option value="6">6</option>
            <option value="8">8（推荐）</option>
            <option value="12">12</option>
            <option value="16">16</option>
          </select>
          <div class="hint">自建 GitLab 上 8 是拐点，再高反而更慢</div>
        </div>

        <label>缓存有效期</label>
        <div>
          <input type="text" id="setTtl" placeholder="300" autocomplete="off">
          <div class="hint">分支 SHA 缓存秒数，0 表示每次重新问远端</div>
        </div>

        <label>合并策略</label>
        <select id="setStrategy">
          <option value="merge">merge（保留合并提交）</option>
          <option value="ff-only">ff-only（只允许快进）</option>
          <option value="no-ff">no-ff（总是生成合并提交）</option>
        </select>

        <label>删除源分支</label>
        <div>
          <label class="chip"><input type="checkbox" id="setDelete"> 合并后删除源分支</label>
        </div>
      </div>
      <div class="actions">
        <button id="saveBtn" type="button">保存设置</button>
        <button id="testBtn" class="secondary" type="button">测试 GitLab 连接</button>
        <span class="hint" id="saveHint"></span>
      </div>
      <div class="hint" id="testHint" style="margin-top:8px"></div>
    </details>
  </div>

  <div class="card">
    <h2>发版参数</h2>
    <div class="grid">
      <label>模式</label>
      <select id="mode">
        <option value="create-mr">只建 MR（合并留给 GitLab）</option>
        <option value="merge-mr">在 GitLab 合并 MR</option>
        <option value="merge-git">本地合并后推送</option>
      </select>
      <label>源分支</label>
      <div>
        <input type="text" id="source" placeholder="例如 release/20261022" autocomplete="off">
        <div class="hint">输入后可点「搜分支」确认哪些仓库有这条分支</div>
      </div>
      <label>目标分支</label>
      <input type="text" id="target" placeholder="留空 = 各仓库默认（通常是 master）" autocomplete="off">
      <label>标题</label>
      <input type="text" id="title" placeholder="MR 标题 / 合并提交信息，留空自动生成" autocomplete="off">
      <label>说明</label>
      <textarea id="desc" rows="2" placeholder="MR 说明 / 合并提交正文（可选）"></textarea>
      <label>仓库</label>
      <div>
        <div class="chips" id="projects"><span class="muted">加载中…</span></div>
        <div class="hint" id="projectsHint"></div>
      </div>
    </div>
    <div class="actions">
      <button id="checkBtn">预检</button>
      <button id="branchBtn" class="secondary">搜分支</button>
      <button id="reloadBtn" class="secondary">重新扫描仓库</button>
      <span class="hint" id="actionHint"></span>
    </div>
  </div>

  <div class="card" id="branchCard" hidden>
    <h2>分支搜索结果</h2>
    <div id="branchBody"></div>
  </div>

  <div class="card" id="planCard" hidden>
    <h2>预检结果</h2>
    <div class="summary" id="planSummary"></div>
    <div style="overflow:auto"><table id="planTable"></table></div>
    <div class="actions">
      <button id="applyBtn">确认执行</button>
      <span class="hint" id="applyHint"></span>
    </div>
  </div>

  <div class="card" id="applyCard" hidden>
    <h2>执行结果</h2>
    <div class="summary" id="applySummary"></div>
    <div style="overflow:auto"><table id="applyTable"></table></div>
  </div>

  <div class="card" id="mrCard" hidden>
    <h2>MR 状态</h2>
    <div class="summary" id="mrSummary"></div>
    <div style="overflow:auto"><table id="mrTable"></table></div>
    <div class="actions"><button id="mrBtn" class="secondary">刷新状态</button></div>
  </div>

  <div class="card" id="taskCard">
    <h2>任务中心 <span class="hint" id="taskHint"></span></h2>
    <div id="taskList"><span class="muted">加载中…</span></div>
    <div class="actions"><button id="taskReloadBtn" class="secondary" type="button">刷新</button></div>
  </div>

  <div class="toast" id="toast"></div>
</main>
<script>
(function () {
  var state = { projects: [], plan: null, selected: {}, busy: false };

  function $(id) { return document.getElementById(id); }

  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function setStatus(text) { $('status').textContent = text; }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function api(path, options) {
    var init = options || {};
    init.headers = { 'content-type': 'application/json' };
    return fetch('/release-ui/api' + path, init).then(function (res) {
      return res.text().then(function (raw) {
        var value = null;
        try { value = raw ? JSON.parse(raw) : null; } catch (e) { value = null; }
        if (!res.ok) {
          throw new Error((value && value.error) || ('请求失败 HTTP ' + res.status));
        }
        return value;
      });
    });
  }

  function busy(on, hint) {
    state.busy = on;
    $('checkBtn').disabled = on;
    $('branchBtn').disabled = on;
    $('reloadBtn').disabled = on;
    $('applyBtn').disabled = on || !state.plan || !state.plan.summary || !state.plan.summary.executable;
    $('mrBtn').disabled = on;
    $('actionHint').textContent = hint || '';
  }

  function renderProjects() {
    var box = $('projects');
    box.innerHTML = '';
    if (!state.projects.length) {
      box.innerHTML = '<span class="muted">没有可用仓库，请检查插件配置的 roots</span>';
      $('projectsHint').textContent = '';
      return;
    }
    state.projects.forEach(function (p) {
      var label = document.createElement('label');
      label.className = 'chip' + (p.enabled ? '' : ' off');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = p.id;
      cb.checked = state.selected[p.id] !== false;
      cb.addEventListener('change', function () {
        state.selected[p.id] = cb.checked;
        label.classList.toggle('off', !cb.checked);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(p.name));
      if (p.defaultTarget) label.title = p.name + ' · 默认目标 ' + p.defaultTarget;
      box.appendChild(label);
    });
    var enabled = state.projects.filter(function (p) { return p.enabled; }).length;
    $('projectsHint').textContent = '共 ' + state.projects.length + ' 个仓库（启用 ' + enabled + ' 个）；不勾选则只处理勾选的';
  }

  function selectedIds() {
    return state.projects.filter(function (p) {
      return p.enabled && state.selected[p.id] !== false;
    }).map(function (p) { return p.id; });
  }

  function loadProjects(refresh) {
    busy(true, refresh ? '正在扫描本地仓库…' : '');
    return api('/projects' + (refresh ? '?refresh=1' : '')).then(function (v) {
      state.projects = v.projects || [];
      renderProjects();
      setStatus('共 ' + v.total + ' 个仓库，启用 ' + v.enabled + ' 个 · 根目录 ' + ((v.roots || []).join('、') || '未配置'));
    }).catch(function (e) {
      setStatus('加载失败：' + e.message);
    }).then(function () { busy(false, ''); });
  }

  /* ---------------- 设置 ---------------- */

  var settings = null;

  function renderRoots() {
    var box = $('rootList');
    box.innerHTML = '';
    var roots = (settings && settings.roots) || [];
    if (!roots.length) {
      var empty = document.createElement('span');
      empty.className = 'muted';
      empty.textContent = '还没有配置扫描目录';
      box.appendChild(empty);
      return;
    }
    roots.forEach(function (root, index) {
      var span = document.createElement('span');
      span.className = 'root';
      span.appendChild(document.createTextNode(root));
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '\u00d7';
      del.title = '移除';
      del.addEventListener('click', function () {
        roots.splice(index, 1);
        renderRoots();
      });
      span.appendChild(del);
      box.appendChild(span);
    });
  }

  function applySettingsToForm(v) {
    settings = v;
    $('setBaseUrl').value = v.gitlabBaseUrl || '';
    $('setToken').value = '';
    $('setToken').placeholder = v.tokenSet
      ? ('已保存 ' + v.tokenHint + '，留空则不修改')
      : '粘贴个人访问令牌（scope: api）';
    $('setTokenHint').textContent = v.tokenSet
      ? (v.tokenSource === 'saved'
          ? '令牌存在 ' + v.dataDir + '/settings.json，仅本机可读；接口不会回传明文'
          : '当前令牌来自配置文件或环境变量 ' + v.tokenEnv + '；在此填写会覆盖它')
      : '建议用个人访问令牌（scope: api）；项目级令牌只能访问单个项目，跨仓库会 404';
    $('setDepth').value = String(v.scanDepth);
    $('setTarget').value = v.defaultTarget || '';
    $('setConcurrency').value = String(v.concurrency);
    $('setTtl').value = String(v.headCacheTtlSec);
    $('setStrategy').value = v.mergeStrategy;
    $('setDelete').checked = !!v.deleteSourceBranch;
    renderRoots();
    $('settingsHint').textContent = (v.gitlabReady ? 'GitLab 已配置' : 'GitLab 未配置完整')
      + ' · 数据目录 ' + v.dataDir;
    if (!v.gitlabReady) $('settingsCard').open = true;
  }

  function loadSettings() {
    return api('/settings').then(applySettingsToForm).catch(function (e) {
      $('settingsHint').textContent = '读取设置失败：' + e.message;
    });
  }

  function collectSettings() {
    var patch = {
      gitlabBaseUrl: $('setBaseUrl').value.trim(),
      roots: (settings && settings.roots) || [],
      scanDepth: Number($('setDepth').value),
      defaultTarget: $('setTarget').value.trim(),
      concurrency: Number($('setConcurrency').value),
      headCacheTtlSec: Number($('setTtl').value),
      mergeStrategy: $('setStrategy').value,
      deleteSourceBranch: $('setDelete').checked
    };
    var token = $('setToken').value.trim();
    // 留空表示「不改动已保存的令牌」，避免用户只改路径时把令牌清掉
    if (token) patch.gitlabToken = token;
    return patch;
  }

  function doTest() {
    var body = { gitlabBaseUrl: $('setBaseUrl').value.trim() };
    var token = $('setToken').value.trim();
    if (token) body.gitlabToken = token;
    $('testHint').textContent = '测试中…';
    api('/settings/test', { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
      $('testHint').textContent = r.ok
        ? ('连接成功 · 账号 ' + r.account + ' · GitLab ' + (r.version || '未知') + ' · ' + r.ms + 'ms' + (r.note ? ' · ' + r.note : ''))
        : ('连接失败：' + (r.error || '未知错误'));
    }).catch(function (e) {
      $('testHint').textContent = '连接失败：' + e.message;
    });
  }

  function doSave() {
    var patch = collectSettings();
    $('saveHint').textContent = '保存中…';
    api('/settings', { method: 'POST', body: JSON.stringify(patch) }).then(function (r) {
      applySettingsToForm(r.settings);
      var msgs = [];
      if (r.rescan) msgs.push('已重新扫描，共 ' + r.rescan.total + ' 个仓库');
      if (r.warnings && r.warnings.length) msgs.push(r.warnings.join('；'));
      $('saveHint').textContent = msgs.join(' · ') || '已保存';
      toast('设置已保存');
      loadProjects(false);
    }).catch(function (e) {
      $('saveHint').textContent = '保存失败：' + e.message;
    });
  }

  function addRoot(path) {
    if (!settings) settings = { roots: [] };
    if (!settings.roots) settings.roots = [];
    if (settings.roots.indexOf(path) < 0) settings.roots.push(path);
    renderRoots();
    toast('已加入列表，点「保存设置」后生效');
  }

  function renderBrowse(listing) {
    var box = $('browseList');
    box.hidden = false;
    box.innerHTML = '';
    $('browsePath').value = listing.path;

    var head = document.createElement('div');
    head.className = 'row';
    var pathSpan = document.createElement('span');
    pathSpan.className = 'name muted';
    pathSpan.textContent = listing.path;
    head.appendChild(pathSpan);
    if (listing.selected) {
      var tag = document.createElement('span');
      tag.className = 'tag ok';
      tag.textContent = '已是扫描目录';
      head.appendChild(tag);
    } else {
      var pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'secondary';
      pick.textContent = '用这个目录';
      pick.addEventListener('click', function () { addRoot(listing.path); });
      head.appendChild(pick);
    }
    box.appendChild(head);

    if (listing.error) {
      var errRow = document.createElement('div');
      errRow.className = 'row';
      var bad = document.createElement('span');
      bad.className = 'tag bad';
      bad.textContent = listing.error;
      errRow.appendChild(bad);
      box.appendChild(errRow);
      return;
    }

    if (listing.parent) {
      var upRow = document.createElement('div');
      upRow.className = 'row';
      var upName = document.createElement('span');
      upName.className = 'name';
      upName.textContent = '.. 上一级';
      upName.addEventListener('click', function () { doBrowse(listing.parent); });
      upRow.appendChild(upName);
      box.appendChild(upRow);
    }

    var entries = listing.entries || [];
    entries.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'row';
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = entry.name + (entry.isRepo ? '（git）' : '');
      name.addEventListener('click', function () { doBrowse(entry.path); });
      row.appendChild(name);
      if (entry.selected) {
        var on = document.createElement('span');
        on.className = 'tag ok';
        on.textContent = '已选';
        row.appendChild(on);
      } else {
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'secondary';
        add.textContent = '添加';
        add.addEventListener('click', function () { addRoot(entry.path); });
        row.appendChild(add);
      }
      box.appendChild(row);
    });

    if (!entries.length) {
      var none = document.createElement('div');
      none.className = 'row';
      none.innerHTML = '<span class="muted">没有子目录</span>';
      box.appendChild(none);
    }
  }

  function doBrowse(path) {
    api('/settings/dirs?path=' + encodeURIComponent(path || '')).then(renderBrowse).catch(function (e) {
      toast('浏览失败：' + e.message);
    });
  }

  /* ---------------- 任务中心 ---------------- */

  var MODE_LABEL = { 'create-mr': '建 MR', 'merge-mr': '合并 MR', 'merge-git': '本地合并' };
  var STATUS_LABEL = {
    success: ['全部成功', 'ok'],
    partial: ['部分失败', 'warn'],
    failed: ['失败', 'bad']
  };

  function fmtTime(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString();
  }

  function fmtDuration(ms) {
    if (!ms && ms !== 0) return '—';
    return ms < 1000 ? (ms + 'ms') : ((ms / 1000).toFixed(1) + 's');
  }

  function renderTasks(view) {
    var box = $('taskList');
    box.innerHTML = '';
    var tasks = view.tasks || [];
    $('taskHint').textContent = tasks.length ? ('最近 ' + tasks.length + ' 次执行') : '';
    if (!tasks.length) {
      var none = document.createElement('span');
      none.className = 'muted';
      none.textContent = '执行过一次发版后，这里会留下记录（含失败的仓库）';
      box.appendChild(none);
      return;
    }

    tasks.forEach(function (t) {
      var det = document.createElement('details');
      det.className = 'task';

      var sum = document.createElement('summary');
      var st = STATUS_LABEL[t.status] || [t.status, 'plain'];
      var tag = document.createElement('span');
      tag.className = 'tag ' + st[1];
      tag.textContent = st[0];
      sum.appendChild(tag);

      var head = document.createElement('b');
      head.textContent = t.sourceBranch + ' → ' + t.targetBranch;
      sum.appendChild(head);

      var meta = document.createElement('span');
      meta.className = 'muted';
      meta.textContent = (MODE_LABEL[t.mode] || t.mode)
        + ' · ' + t.total + ' 个仓库 · 成功 ' + t.succeeded + ' / 失败 ' + t.failed + ' / 跳过 ' + t.skipped
        + ' · ' + fmtDuration(t.durationMs) + ' · ' + fmtTime(t.startedAt);
      sum.appendChild(meta);
      det.appendChild(sum);

      var rows = ['<tr><th>仓库</th><th>结果</th><th>说明</th></tr>'];
      (t.results || []).forEach(function (r) {
        var cls = r.ok ? 'ok' : (r.kind === 'noop' ? 'plain' : 'bad');
        var label = r.ok ? '成功' : (r.kind === 'noop' ? '无变化' : '失败');
        var msg = esc(r.message);
        if (r.url) msg += ' · <a href="' + esc(r.url) + '" target="_blank" rel="noreferrer">打开</a>';
        rows.push('<tr><td>' + esc(r.name) + '</td><td><span class="tag ' + cls + '">' + label + '</span></td><td>' + msg + '</td></tr>');
      });
      var holder = document.createElement('div');
      holder.innerHTML = '<table>' + rows.join('') + '</table>';
      det.appendChild(holder);

      var redo = document.createElement('button');
      redo.type = 'button';
      redo.className = 'secondary';
      redo.textContent = '用这些参数重新预检';
      redo.addEventListener('click', function () {
        $('mode').value = t.mode;
        $('source').value = t.sourceBranch;
        $('target').value = t.targetBranch;
        if (t.title) $('title').value = t.title;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast('参数已回填，点「预检」继续');
      });
      det.appendChild(redo);

      box.appendChild(det);
    });
  }

  function loadTasks() {
    return api('/tasks').then(renderTasks).catch(function (e) {
      $('taskHint').textContent = '读取失败：' + e.message;
    });
  }

  function statusTag(item) {
    if (item.noop) return '<span class="tag plain">无变化</span>';
    if (item.executable) return '<span class="tag ok">可执行</span>';
    return '<span class="tag bad">阻塞</span>';
  }

  function renderPlan(plan) {
    state.plan = plan;
    $('planCard').hidden = false;
    var s = plan.summary || {};
    $('planSummary').innerHTML =
      '<span>仓库 <b>' + esc(s.total) + '</b></span>' +
      '<span>可执行 <b>' + esc(s.executable) + '</b></span>' +
      '<span>无变化 <b>' + esc(s.noop == null ? 0 : s.noop) + '</b></span>' +
      '<span>阻塞 <b>' + esc(s.blocked == null ? (s.total - s.executable) : s.blocked) + '</b></span>' +
      '<span>预检用时 <b>' + esc(plan.checkDurationMs) + 'ms</b></span>' +
      '<span class="muted">计划 ' + esc(plan.id.slice(0, 8)) + '… 有效至 ' + esc(new Date(plan.expiresAt).toLocaleTimeString()) + '</span>';

    var rows = ['<tr><th>仓库</th><th>结果</th><th>提交</th><th>MR</th><th>说明</th></tr>'];
    (plan.items || []).forEach(function (item) {
      var commits = (item.ahead == null ? '?' : item.ahead) + ' ↑ / ' + (item.behind == null ? '?' : item.behind) + ' ↓';
      var mr = item.mr ? '<a href="' + esc(item.mr.url) + '" target="_blank" rel="noreferrer">!' + esc(item.mr.iid) + '</a>' : '<span class="muted">—</span>';
      var notes = [];
      (item.blockers || []).forEach(function (b) { notes.push('<span class="tag bad">' + esc(b) + '</span>'); });
      (item.warnings || []).forEach(function (w) { notes.push('<span class="tag warn">' + esc(w) + '</span>'); });
      (item.checks || []).forEach(function (c) {
        if (c.status === 'fail') notes.push('<span class="tag bad">' + esc(c.label) + (c.detail ? '：' + esc(c.detail) : '') + '</span>');
        else if (c.status === 'warn') notes.push('<span class="tag warn">' + esc(c.label) + (c.detail ? '：' + esc(c.detail) : '') + '</span>');
      });
      rows.push('<tr><td>' + esc(item.name) + '</td><td>' + statusTag(item) + '</td><td>' + esc(commits) + '</td><td>' + mr + '</td><td>' + (notes.join(' ') || '<span class="muted">—</span>') + '</td></tr>');
    });
    $('planTable').innerHTML = rows.join('');
    $('applyHint').textContent = s.executable ? ('将处理 ' + s.executable + ' 个仓库，10 分钟内有效') : '没有可执行的仓库';
    busy(false, '');
  }

  function renderApply(result) {
    $('applyCard').hidden = false;
    $('applySummary').innerHTML =
      '<span>成功 <b>' + esc(result.succeeded) + '</b></span>' +
      '<span>失败 <b>' + esc(result.failed) + '</b></span>' +
      '<span>跳过 <b>' + esc(result.skipped) + '</b></span>' +
      '<span>用时 <b>' + esc(result.durationMs) + 'ms</b></span>';
    var rows = ['<tr><th>仓库</th><th>结果</th><th>说明</th></tr>'];
    (result.results || []).forEach(function (r) {
      var tag = r.ok ? '<span class="tag ok">成功</span>' : '<span class="tag bad">失败</span>';
      var msg = esc(r.message) + (r.url ? ' · <a href="' + esc(r.url) + '" target="_blank" rel="noreferrer">打开</a>' : '');
      rows.push('<tr><td>' + esc(r.name) + '</td><td>' + tag + '</td><td>' + msg + '</td></tr>');
    });
    $('applyTable').innerHTML = rows.join('');
    $('mrCard').hidden = false;
    loadMrs();
    loadTasks();
  }

  function mrLabel(status) {
    var map = {
      mergeable: ['可合并', 'ok'], conflict: ['有冲突', 'bad'], 'not-approved': ['待审批', 'warn'],
      'ci-failed': ['CI 未通过', 'bad'], blocked: ['不可合并', 'bad'],
      checking: ['计算中', 'plain'], unknown: ['未知', 'plain']
    };
    return map[status] || [status, 'plain'];
  }

  function loadMrs() {
    return api('/mrs').then(function (v) {
      $('mrCard').hidden = false;
      $('mrSummary').innerHTML =
        '<span>MR <b>' + esc(v.total) + '</b></span>' +
        '<span>冲突 <b>' + esc(v.conflicts) + '</b></span>' +
        '<span>计算中 <b>' + esc(v.checking) + '</b></span>';
      var rows = ['<tr><th>仓库</th><th>MR</th><th>状态</th><th>流水线</th></tr>'];
      (v.mrs || []).forEach(function (m) {
        var label = mrLabel(m.mr.mergeStatus);
        rows.push('<tr><td>' + esc(m.project) + '</td>' +
          '<td><a href="' + esc(m.mr.url) + '" target="_blank" rel="noreferrer">!' + esc(m.mr.iid) + ' ' + esc(m.mr.title) + '</a></td>' +
          '<td><span class="tag ' + label[1] + '">' + esc(label[0]) + '</span>' + (m.mr.detail ? ' <span class="muted">' + esc(m.mr.detail) + '</span>' : '') + '</td>' +
          '<td>' + esc(m.mr.pipeline) + '</td></tr>');
      });
      $('mrTable').innerHTML = rows.join('');
    }).catch(function (e) {
      $('mrCard').hidden = false;
      $('mrSummary').innerHTML = '<span class="tag warn">' + esc(e.message) + '</span>';
      $('mrTable').innerHTML = '';
    });
  }

  function doCheck() {
    var source = $('source').value.trim();
    if (!source) { toast('请先填源分支'); $('source').focus(); return; }
    busy(true, '预检中，仓库多时需要一点时间…');
    $('planCard').hidden = true;
    $('applyCard').hidden = true;
    var ids = selectedIds();
    api('/check', {
      method: 'POST',
      body: JSON.stringify({
        mode: $('mode').value,
        sourceBranch: source,
        targetBranch: $('target').value.trim() || undefined,
        title: $('title').value.trim() || undefined,
        description: $('desc').value.trim() || undefined,
        projects: ids.length ? ids : undefined
      })
    }).then(function (plan) {
      renderPlan(plan);
      toast('预检完成');
    }).catch(function (e) {
      busy(false, '');
      toast('预检失败：' + e.message);
    });
  }

  function doApply() {
    if (!state.plan) return;
    var plan = state.plan;
    var s = plan.summary || {};
    if (!s.executable) { toast('没有可执行的仓库'); return; }
    if (!confirm('确认对 ' + s.executable + ' 个仓库执行「' + plan.mode + '」？此操作会写远端。')) return;
    busy(true, '执行中…');
    api('/apply', {
      method: 'POST',
      body: JSON.stringify({ planId: plan.id, planHash: plan.hash })
    }).then(function (result) {
      renderApply(result);
      busy(false, '');
      toast('执行完成：成功 ' + result.succeeded + '，失败 ' + result.failed);
    }).catch(function (e) {
      busy(false, '');
      toast('执行失败：' + e.message);
    });
  }

  function doBranches() {
    var keyword = $('source').value.trim();
    busy(true, '搜索分支…');
    api('/branches?keyword=' + encodeURIComponent(keyword)).then(function (v) {
      $('branchCard').hidden = false;
      if (!v.matches || !v.matches.length) {
        $('branchBody').innerHTML = '<span class="muted">没有匹配的分支</span>';
        return;
      }
      var byBranch = {};
      v.matches.forEach(function (m) {
        (byBranch[m.branch] = byBranch[m.branch] || []).push(m.project);
      });
      var rows = ['<tr><th>分支</th><th>仓库</th></tr>'];
      Object.keys(byBranch).sort(function (a, b) { return byBranch[b].length - byBranch[a].length; }).forEach(function (branch) {
        rows.push('<tr><td>' + esc(branch) + '</td><td>' + esc(byBranch[branch].join('、')) + '（' + byBranch[branch].length + '）</td></tr>');
      });
      $('branchBody').innerHTML = '<table>' + rows.join('') + '</table>';
    }).catch(function (e) {
      $('branchCard').hidden = false;
      $('branchBody').innerHTML = '<span class="tag warn">' + esc(e.message) + '</span>';
    }).then(function () { busy(false, ''); });
  }

  $('checkBtn').addEventListener('click', doCheck);
  $('applyBtn').addEventListener('click', doApply);
  $('branchBtn').addEventListener('click', doBranches);
  $('reloadBtn').addEventListener('click', function () { loadProjects(true); });
  $('mrBtn').addEventListener('click', function () { loadMrs().then(function () { toast('MR 状态已刷新'); }); });
  $('source').addEventListener('keydown', function (e) { if (e.key === 'Enter') doCheck(); });

  $('saveBtn').addEventListener('click', doSave);
  $('testBtn').addEventListener('click', doTest);
  $('browseBtn').addEventListener('click', function () { doBrowse($('browsePath').value.trim()); });
  $('addRootBtn').addEventListener('click', function () {
    var p = $('browsePath').value.trim();
    if (!p) { toast('先填目录路径'); return; }
    addRoot(p);
  });
  $('browsePath').addEventListener('keydown', function (e) { if (e.key === 'Enter') doBrowse($('browsePath').value.trim()); });
  $('taskReloadBtn').addEventListener('click', function () { loadTasks().then(function () { toast('任务记录已刷新'); }); });

  loadSettings().then(function () { loadProjects(false); });
  loadTasks();
})();
</script>
</body>
</html>
`;
