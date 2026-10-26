window.__ModuleLoader__.load({
	id: "dsh-plugin-release",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.ts
		var index_exports = {};
		__export(index_exports, {
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/ReleasePage.tsx
		var import_react = require("react");
		var import_jsx_runtime = require("react/jsx-runtime");
		var STYLE_ID = "dsh-plugin-release-style";
		var STYLE = `
		.rel-page { height: 100%; overflow: auto; padding: 24px 28px 64px; font-family: var(--dsw-font-family); color: var(--dsw-alias-label-primary); }
		.rel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
		.rel-head h1 { font-size: 16px; font-weight: 500; margin: 0; }
		.rel-status { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
		.rel-card { background: var(--dsw-alias-bg-module-platform); border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: var(--dsw-radius-lg); padding: 18px 20px; margin-bottom: 16px; }
		.rel-card h2 { font-size: 14px; font-weight: 500; margin: 0 0 14px; }
		.rel-grid { display: grid; grid-template-columns: 88px 1fr; gap: 10px 14px; align-items: start; }
		.rel-grid > label { color: var(--dsw-alias-label-tertiary); font-size: 13px; padding-top: 7px; }
		.rel-input, .rel-select, .rel-textarea { width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
		.rel-input:focus, .rel-select:focus, .rel-textarea:focus { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -1px; }
		.rel-textarea { resize: vertical; }
		.rel-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 4px; }
		.rel-chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 160px; overflow: auto; padding: 2px; }
		.rel-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: 999px; background: var(--dsw-alias-bg-base); cursor: pointer; font-size: 13px; user-select: none; }
		.rel-chip.off { opacity: .5; }
		.rel-chip input { margin: 0; }
		.rel-actions { display: flex; gap: 10px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
		.rel-btn { padding: 7px 18px; border-radius: var(--dsw-radius-md); border: 1px solid transparent; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 13px; cursor: pointer; }
		.rel-btn.secondary { background: transparent; color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-settings-card-stroke); }
		.rel-btn:disabled { opacity: .5; cursor: default; }
		.rel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
		.rel-table th, .rel-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-settings-card-stroke); vertical-align: top; }
		.rel-table th { color: var(--dsw-alias-label-tertiary); font-weight: 400; white-space: nowrap; }
		.rel-table tr:last-child td { border-bottom: 0; }
		.rel-tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; margin-right: 4px; }
		.rel-tag.ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); color: var(--dsw-alias-state-success-primary); }
		.rel-tag.warn { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent); color: var(--dsw-alias-state-warn-label); }
		.rel-tag.bad { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); color: var(--dsw-alias-state-error-primary); }
		.rel-tag.plain { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-tertiary); }
		.rel-summary { display: flex; flex-wrap: wrap; gap: 18px; color: var(--dsw-alias-label-tertiary); font-size: 13px; margin-bottom: 12px; }
		.rel-summary b { color: var(--dsw-alias-label-primary); font-weight: 500; }
		.rel-muted { color: var(--dsw-alias-label-tertiary); }
		.rel-link { color: var(--dsw-alias-link); text-decoration: none; }
		.rel-link:hover { text-decoration: underline; }
		.rel-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); padding: 8px 18px; border-radius: 999px; font-size: 13px; z-index: 50; }
		.rel-scroll { overflow: auto; }
		`;
		async function api(path, init) {
		  const response = await fetch(`/release-ui/api${path}`, {
		    ...init,
		    headers: { "content-type": "application/json" }
		  });
		  const raw = await response.text();
		  const value = raw ? JSON.parse(raw) : null;
		  if (!response.ok) {
		    const message = value !== null && typeof value === "object" && "error" in value ? String(value.error) : `\u8BF7\u6C42\u5931\u8D25 HTTP ${String(response.status)}`;
		    throw new Error(message);
		  }
		  return value;
		}
		function Tag({ tone, children }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `rel-tag ${tone}`, children });
		}
		function planTone(item) {
		  if (item.noop) return "plain";
		  return item.executable ? "ok" : "bad";
		}
		var MR_LABEL = {
		  mergeable: ["\u53EF\u5408\u5E76", "ok"],
		  conflict: ["\u6709\u51B2\u7A81", "bad"],
		  "not-approved": ["\u5F85\u5BA1\u6279", "warn"],
		  "ci-failed": ["CI \u672A\u901A\u8FC7", "bad"],
		  blocked: ["\u4E0D\u53EF\u5408\u5E76", "bad"],
		  checking: ["\u8BA1\u7B97\u4E2D", "plain"],
		  unknown: ["\u672A\u77E5", "plain"]
		};
		function ReleasePage() {
		  const [projects, setProjects] = (0, import_react.useState)([]);
		  const [selected, setSelected] = (0, import_react.useState)({});
		  const [mode, setMode] = (0, import_react.useState)("create-mr");
		  const [source, setSource] = (0, import_react.useState)("");
		  const [target, setTarget] = (0, import_react.useState)("");
		  const [title, setTitle] = (0, import_react.useState)("");
		  const [description, setDescription] = (0, import_react.useState)("");
		  const [plan, setPlan] = (0, import_react.useState)(null);
		  const [applied, setApplied] = (0, import_react.useState)(null);
		  const [mrs, setMrs] = (0, import_react.useState)(null);
		  const [branchHits, setBranchHits] = (0, import_react.useState)(null);
		  const [busy, setBusy] = (0, import_react.useState)(false);
		  const [status, setStatus] = (0, import_react.useState)("\u6B63\u5728\u52A0\u8F7D\u2026");
		  const [hint, setHint] = (0, import_react.useState)("");
		  const [toast, setToast] = (0, import_react.useState)("");
		  const toastTimer = (0, import_react.useRef)(void 0);
		  const notify = (0, import_react.useCallback)((text) => {
		    setToast(text);
		    window.clearTimeout(toastTimer.current);
		    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
		  }, []);
		  (0, import_react.useEffect)(() => {
		    if (document.getElementById(STYLE_ID) !== null) return;
		    const style = document.createElement("style");
		    style.id = STYLE_ID;
		    style.dataset.plugin = "dsh-plugin-release";
		    style.textContent = STYLE;
		    document.head.appendChild(style);
		    return () => {
		      style.remove();
		    };
		  }, []);
		  const loadProjects = (0, import_react.useCallback)(async (refresh) => {
		    setBusy(true);
		    setHint(refresh ? "\u6B63\u5728\u626B\u63CF\u672C\u5730\u4ED3\u5E93\u2026" : "");
		    try {
		      const value = await api(
		        `/projects${refresh ? "?refresh=1" : ""}`
		      );
		      setProjects(value.projects);
		      setStatus(`\u5171 ${String(value.total)} \u4E2A\u4ED3\u5E93\uFF0C\u542F\u7528 ${String(value.enabled)} \u4E2A \xB7 \u6839\u76EE\u5F55 ${value.roots.join("\u3001") || "\u672A\u914D\u7F6E"}`);
		    } catch (error) {
		      setStatus(`\u52A0\u8F7D\u5931\u8D25\uFF1A${error.message}`);
		    } finally {
		      setBusy(false);
		      setHint("");
		    }
		  }, []);
		  (0, import_react.useEffect)(() => {
		    void loadProjects(false);
		  }, [loadProjects]);
		  const selectedIds = (0, import_react.useMemo)(
		    () => projects.filter((p) => p.enabled && selected[p.id] !== false).map((p) => p.id),
		    [projects, selected]
		  );
		  const doCheck = (0, import_react.useCallback)(async () => {
		    if (!source.trim()) {
		      notify("\u8BF7\u5148\u586B\u6E90\u5206\u652F");
		      return;
		    }
		    setBusy(true);
		    setHint("\u9884\u68C0\u4E2D\uFF0C\u4ED3\u5E93\u591A\u65F6\u9700\u8981\u4E00\u70B9\u65F6\u95F4\u2026");
		    setPlan(null);
		    setApplied(null);
		    try {
		      const value = await api("/check", {
		        method: "POST",
		        body: JSON.stringify({
		          mode,
		          sourceBranch: source.trim(),
		          targetBranch: target.trim() || void 0,
		          title: title.trim() || void 0,
		          description: description.trim() || void 0,
		          projects: selectedIds.length ? selectedIds : void 0
		        })
		      });
		      setPlan(value);
		      notify("\u9884\u68C0\u5B8C\u6210");
		    } catch (error) {
		      notify(`\u9884\u68C0\u5931\u8D25\uFF1A${error.message}`);
		    } finally {
		      setBusy(false);
		      setHint("");
		    }
		  }, [source, mode, target, title, description, selectedIds, notify]);
		  const doApply = (0, import_react.useCallback)(async () => {
		    if (plan === null) return;
		    const executable = plan.summary.executable;
		    if (!executable) {
		      notify("\u6CA1\u6709\u53EF\u6267\u884C\u7684\u4ED3\u5E93");
		      return;
		    }
		    if (!window.confirm(`\u786E\u8BA4\u5BF9 ${String(executable)} \u4E2A\u4ED3\u5E93\u6267\u884C\u300C${plan.mode}\u300D\uFF1F\u6B64\u64CD\u4F5C\u4F1A\u5199\u8FDC\u7AEF\u3002`)) return;
		    setBusy(true);
		    setHint("\u6267\u884C\u4E2D\u2026");
		    try {
		      const value = await api("/apply", {
		        method: "POST",
		        body: JSON.stringify({ planId: plan.id, planHash: plan.hash })
		      });
		      setApplied(value);
		      notify(`\u6267\u884C\u5B8C\u6210\uFF1A\u6210\u529F ${String(value.succeeded)}\uFF0C\u5931\u8D25 ${String(value.failed)}`);
		      void loadMrs();
		    } catch (error) {
		      notify(`\u6267\u884C\u5931\u8D25\uFF1A${error.message}`);
		    } finally {
		      setBusy(false);
		      setHint("");
		    }
		  }, [plan, notify]);
		  const loadMrs = (0, import_react.useCallback)(async () => {
		    try {
		      const value = await api("/mrs");
		      setMrs(value);
		    } catch (error) {
		      setMrs(null);
		      notify(`MR \u72B6\u6001\uFF1A${error.message}`);
		    }
		  }, [notify]);
		  const doBranches = (0, import_react.useCallback)(async () => {
		    setBusy(true);
		    setHint("\u641C\u7D22\u5206\u652F\u2026");
		    try {
		      const value = await api(`/branches?keyword=${encodeURIComponent(source.trim())}`);
		      setBranchHits(value.matches);
		      if (!value.matches.length) notify("\u6CA1\u6709\u5339\u914D\u7684\u5206\u652F");
		    } catch (error) {
		      setBranchHits([]);
		      notify(`\u641C\u7D22\u5931\u8D25\uFF1A${error.message}`);
		    } finally {
		      setBusy(false);
		      setHint("");
		    }
		  }, [source, notify]);
		  const branchGroups = (0, import_react.useMemo)(() => {
		    if (branchHits === null) return null;
		    const groups = /* @__PURE__ */ new Map();
		    for (const hit of branchHits) {
		      const list = groups.get(hit.branch) ?? [];
		      list.push(hit.project);
		      groups.set(hit.branch, list);
		    }
		    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
		  }, [branchHits]);
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-page", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "\u6279\u91CF\u53D1\u7248" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-status", children: status })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u53D1\u7248\u53C2\u6570" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-grid", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: "\u6A21\u5F0F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { className: "rel-select", value: mode, onChange: (e) => setMode(e.target.value), children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "create-mr", children: "\u53EA\u5EFA MR\uFF08\u5408\u5E76\u7559\u7ED9 GitLab\uFF09" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "merge-mr", children: "\u5728 GitLab \u5408\u5E76 MR" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "merge-git", children: "\u672C\u5730\u5408\u5E76\u540E\u63A8\u9001" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: "\u6E90\u5206\u652F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "input",
		            {
		              className: "rel-input",
		              value: source,
		              placeholder: "\u4F8B\u5982 release/20261022",
		              onChange: (e) => setSource(e.target.value),
		              onKeyDown: (e) => {
		                if (e.key === "Enter") void doCheck();
		              }
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rel-hint", children: "\u8F93\u5165\u540E\u53EF\u70B9\u300C\u641C\u5206\u652F\u300D\u786E\u8BA4\u54EA\u4E9B\u4ED3\u5E93\u6709\u8FD9\u6761\u5206\u652F" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: "\u76EE\u6807\u5206\u652F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "input",
		          {
		            className: "rel-input",
		            value: target,
		            placeholder: "\u7559\u7A7A = \u5404\u4ED3\u5E93\u9ED8\u8BA4\uFF08\u901A\u5E38\u662F master\uFF09",
		            onChange: (e) => setTarget(e.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: "\u6807\u9898" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "input",
		          {
		            className: "rel-input",
		            value: title,
		            placeholder: "MR \u6807\u9898 / \u5408\u5E76\u63D0\u4EA4\u4FE1\u606F\uFF0C\u7559\u7A7A\u81EA\u52A8\u751F\u6210",
		            onChange: (e) => setTitle(e.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: "\u8BF4\u660E" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "textarea",
		          {
		            className: "rel-textarea",
		            rows: 2,
		            value: description,
		            placeholder: "MR \u8BF4\u660E / \u5408\u5E76\u63D0\u4EA4\u6B63\u6587\uFF08\u53EF\u9009\uFF09",
		            onChange: (e) => setDescription(e.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: "\u4ED3\u5E93" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rel-chips", children: projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-muted", children: "\u6CA1\u6709\u53EF\u7528\u4ED3\u5E93\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u914D\u7F6E\u7684 roots" }) : projects.map((project) => {
		            const checked = selected[project.id] !== false;
		            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: `rel-chip${checked ? "" : " off"}`, title: project.defaultTarget ? `${project.name} \xB7 \u9ED8\u8BA4\u76EE\u6807 ${project.defaultTarget}` : project.name, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		                "input",
		                {
		                  type: "checkbox",
		                  checked,
		                  onChange: (e) => setSelected((prev) => ({ ...prev, [project.id]: e.target.checked }))
		                }
		              ),
		              project.name
		            ] }, project.id);
		          }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-hint", children: [
		            "\u5171 ",
		            projects.length,
		            " \u4E2A\u4ED3\u5E93\uFF08\u542F\u7528 ",
		            projects.filter((p) => p.enabled).length,
		            " \u4E2A\uFF09\uFF1B\u4E0D\u52FE\u9009\u5219\u53EA\u5904\u7406\u52FE\u9009\u7684"
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-actions", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "rel-btn", disabled: busy, onClick: () => void doCheck(), children: "\u9884\u68C0" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "rel-btn secondary", disabled: busy, onClick: () => void doBranches(), children: "\u641C\u5206\u652F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "rel-btn secondary", disabled: busy, onClick: () => void loadProjects(true), children: "\u91CD\u65B0\u626B\u63CF\u4ED3\u5E93" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-hint", children: hint })
		      ] })
		    ] }),
		    branchGroups !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u5206\u652F\u641C\u7D22\u7ED3\u679C" }),
		      branchGroups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-muted", children: "\u6CA1\u6709\u5339\u914D\u7684\u5206\u652F" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rel-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "rel-table", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u5206\u652F" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u4ED3\u5E93" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: branchGroups.map(([branch, names]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: branch }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
		            names.join("\u3001"),
		            "\uFF08",
		            names.length,
		            "\uFF09"
		          ] })
		        ] }, branch)) })
		      ] }) })
		    ] }),
		    plan !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u9884\u68C0\u7ED3\u679C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-summary", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u4ED3\u5E93 ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: plan.summary.total })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u53EF\u6267\u884C ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: plan.summary.executable })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u65E0\u53D8\u5316 ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: plan.summary.noop ?? 0 })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u963B\u585E ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: plan.summary.blocked ?? plan.summary.total - plan.summary.executable })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u9884\u68C0\u7528\u65F6 ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
		            plan.checkDurationMs,
		            "ms"
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "rel-muted", children: [
		          "\u8BA1\u5212 ",
		          plan.id.slice(0, 8),
		          "\u2026 \u6709\u6548\u81F3 ",
		          new Date(plan.expiresAt).toLocaleTimeString()
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rel-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "rel-table", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u4ED3\u5E93" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u7ED3\u679C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u63D0\u4EA4" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "MR" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8BF4\u660E" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: plan.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: item.name }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { tone: planTone(item), children: item.noop ? "\u65E0\u53D8\u5316" : item.executable ? "\u53EF\u6267\u884C" : "\u963B\u585E" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
		            item.ahead ?? "?",
		            " \u2191 / ",
		            item.behind ?? "?",
		            " \u2193"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: item.mr === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-muted", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", { className: "rel-link", href: item.mr.url, target: "_blank", rel: "noreferrer", children: [
		            "!",
		            item.mr.iid
		          ] }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
		            item.blockers.map((text) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { tone: "bad", children: text }, text)),
		            item.warnings.map((text) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { tone: "warn", children: text }, text)),
		            item.checks.filter((c) => c.status === "fail").map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tag, { tone: "bad", children: [
		              c.label,
		              c.detail ? `\uFF1A${c.detail}` : ""
		            ] }, c.id)),
		            item.checks.filter((c) => c.status === "warn").map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tag, { tone: "warn", children: [
		              c.label,
		              c.detail ? `\uFF1A${c.detail}` : ""
		            ] }, c.id)),
		            item.blockers.length + item.warnings.length + item.checks.filter((c) => c.status === "fail" || c.status === "warn").length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-muted", children: "\u2014" })
		          ] })
		        ] }, item.projectId)) })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-actions", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "rel-btn", disabled: busy || !plan.summary.executable, onClick: () => void doApply(), children: "\u786E\u8BA4\u6267\u884C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-hint", children: plan.summary.executable ? `\u5C06\u5904\u7406 ${String(plan.summary.executable)} \u4E2A\u4ED3\u5E93\uFF0C10 \u5206\u949F\u5185\u6709\u6548` : "\u6CA1\u6709\u53EF\u6267\u884C\u7684\u4ED3\u5E93" })
		      ] })
		    ] }),
		    applied !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u6267\u884C\u7ED3\u679C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-summary", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u6210\u529F ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: applied.succeeded })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u5931\u8D25 ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: applied.failed })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u8DF3\u8FC7 ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: applied.skipped })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u7528\u65F6 ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
		            applied.durationMs,
		            "ms"
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rel-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "rel-table", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u4ED3\u5E93" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u7ED3\u679C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8BF4\u660E" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: applied.results.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: row.project }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { tone: row.ok ? "ok" : "bad", children: row.ok ? "\u6210\u529F" : "\u5931\u8D25" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
		            row.message,
		            row.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		              " \xB7 ",
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { className: "rel-link", href: row.url, target: "_blank", rel: "noreferrer", children: "\u6253\u5F00" })
		            ] }) : null
		          ] })
		        ] }, row.project)) })
		      ] }) })
		    ] }),
		    mrs !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "MR \u72B6\u6001" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-summary", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "MR ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: mrs.total })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u51B2\u7A81 ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: mrs.conflicts })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          "\u8BA1\u7B97\u4E2D ",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: mrs.checking })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rel-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "rel-table", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u4ED3\u5E93" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "MR" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u72B6\u6001" }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u6D41\u6C34\u7EBF" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: mrs.mrs.map((row) => {
		          const label = MR_LABEL[row.mr.mergeStatus] ?? [row.mr.mergeStatus, "plain"];
		          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: row.project }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", { className: "rel-link", href: row.mr.url, target: "_blank", rel: "noreferrer", children: [
		              "!",
		              row.mr.iid,
		              " ",
		              row.mr.title
		            ] }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { tone: label[1], children: label[0] }),
		              row.mr.detail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-muted", children: row.mr.detail }) : null
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: row.mr.pipeline })
		          ] }, row.project);
		        }) })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rel-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "rel-btn secondary", disabled: busy, onClick: () => void loadMrs(), children: "\u5237\u65B0\u72B6\u6001" }) })
		    ] }),
		    toast !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rel-toast", children: toast })
		  ] });
		}

		// src/client/ReleaseIcon.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function ReleaseIcon({ size, active }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		    "svg",
		    {
		      width: size,
		      height: size,
		      viewBox: "0 0 24 24",
		      fill: "none",
		      stroke: "currentColor",
		      strokeWidth: active ? 1.9 : 1.6,
		      strokeLinecap: "round",
		      strokeLinejoin: "round",
		      "aria-hidden": "true",
		      style: { opacity: active ? 1 : 0.72 },
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M7 20V9" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "7", cy: "5", r: "2.4" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M7 13c0-2.2 1.8-4 4-4h4.5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "17.5", cy: "9", r: "2.2" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M14 20l3-3.6 3 3.6" })
		      ]
		    }
		  );
		}

		// src/client/index.ts
		var PANEL_ID = "release";
		var inject = ["slots"];
		function apply(ctx) {
		  ctx.effect(() => {
		    ctx.slots.inject(
		      "main",
		      () => ctx.slots.register({ name: "main", key: PANEL_ID }, ReleasePage)
		    );
		  }, "release: main panel");
		  ctx.effect(() => {
		    ctx.slots.inject(
		      "sidebar.panellist",
		      () => ctx.slots.register(
		        { name: "sidebar.panellist", id: PANEL_ID, order: 10, label: "\u53D1\u7248" },
		        ReleaseIcon
		      )
		    );
		  }, "release: sidebar entry");
		}
		return module.exports;
	}
});
