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
</style>
</head>
<body>
<header>
  <h1>批量发版</h1>
  <div id="status">正在加载…</div>
</header>
<main>
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

  loadProjects(false);
})();
</script>
</body>
</html>
`;
//# sourceMappingURL=web-page.js.map