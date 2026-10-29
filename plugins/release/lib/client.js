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
		var import_react4 = require("react");

		// src/client/api.ts
		async function api(path, init) {
		  const response = await fetch(`/release-ui/api${path}`, {
		    ...init,
		    headers: { "content-type": "application/json", ...init?.headers }
		  });
		  const raw = await response.text();
		  let value;
		  try {
		    value = raw ? JSON.parse(raw) : null;
		  } catch {
		    throw new Error(`\u63A5\u53E3\u8FD4\u56DE\u5F02\u5E38\uFF08HTTP ${response.status}\uFF09\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u662F\u5426\u5DF2\u52A0\u8F7D`);
		  }
		  if (!response.ok) throw new Error(value && typeof value === "object" && "error" in value ? String(value.error) : `\u8BF7\u6C42\u5931\u8D25 HTTP ${response.status}`);
		  return value;
		}

		// src/client/BranchInput.tsx
		var import_react = require("react");

		// src/search.ts
		function fuzzyScore(value, query) {
		  const text = value.toLocaleLowerCase();
		  const needle = query.trim().toLocaleLowerCase();
		  if (!needle) return /^(master|main|develop|dev|pre|prod|release)$/.test(text) ? 0 : 10;
		  if (text === needle) return 0;
		  if (text.startsWith(needle)) return 1;
		  const at = text.indexOf(needle);
		  if (at >= 0) return 2 + at / Math.max(1, text.length);
		  const tokens = needle.split(/\s+/);
		  if (tokens.length > 1 && tokens.every((token) => text.includes(token))) return 4;
		  let cursor = 0;
		  let gaps = 0;
		  for (const char of needle.replace(/[\s/_-]/g, "")) {
		    const next = text.indexOf(char, cursor);
		    if (next < 0) return Infinity;
		    gaps += next - cursor;
		    cursor = next + 1;
		  }
		  return 5 + gaps / Math.max(1, cursor) + text.length / 1e4;
		}

		// src/client/BranchInput.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function BranchInput({ label, value, onChange, options, loading, error, onRefresh, placeholder, disabled }) {
		  const id = (0, import_react.useId)();
		  const [open, setOpen] = (0, import_react.useState)(false);
		  const [cursor, setCursor] = (0, import_react.useState)(0);
		  const [composing, setComposing] = (0, import_react.useState)(false);
		  const root = (0, import_react.useRef)(null);
		  const hits = (0, import_react.useMemo)(() => options.map((option) => ({ option, score: fuzzyScore(option.name, value) })).filter((hit) => Number.isFinite(hit.score)).sort((a, b) => a.score - b.score || b.option.projectIds.length - a.option.projectIds.length || a.option.name.localeCompare(b.option.name)).slice(0, 60).map((hit) => hit.option), [options, value]);
		  (0, import_react.useEffect)(() => {
		    setCursor(0);
		  }, [value]);
		  (0, import_react.useEffect)(() => {
		    if (open) document.getElementById(`${id}-${cursor}`)?.scrollIntoView({ block: "nearest" });
		  }, [cursor, open, id]);
		  const choose = (name) => {
		    onChange(name);
		    setOpen(false);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-combo", ref: root, onBlur: (event) => {
		    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
		  }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "input",
		      {
		        className: "rel-input rel-mono",
		        role: "combobox",
		        "aria-label": label,
		        "aria-autocomplete": "list",
		        "aria-expanded": open,
		        "aria-controls": `${id}-list`,
		        "aria-activedescendant": open && hits[cursor] ? `${id}-${cursor}` : void 0,
		        value,
		        placeholder,
		        autoComplete: "off",
		        spellCheck: false,
		        disabled,
		        onFocus: () => setOpen(true),
		        onChange: (e) => {
		          onChange(e.target.value);
		          setCursor(0);
		          setOpen(true);
		        },
		        onCompositionStart: () => setComposing(true),
		        onCompositionEnd: () => setComposing(false),
		        onKeyDown: (e) => {
		          if (composing || e.nativeEvent.isComposing) return;
		          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
		            e.preventDefault();
		            setOpen(true);
		            setCursor((n) => open ? Math.max(0, Math.min(hits.length - 1, n + (e.key === "ArrowDown" ? 1 : -1))) : 0);
		          } else if (e.key === "Enter" && open) {
		            e.preventDefault();
		            const hit = hits[cursor];
		            if (hit) choose(hit.name);
		            else setOpen(false);
		          } else if (e.key === "Escape") {
		            e.preventDefault();
		            setOpen(false);
		          }
		        }
		      }
		    ),
		    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-dropdown", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-dropdown-title", children: [
		        label,
		        "\u5019\u9009 ",
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
		          hits.length,
		          " / ",
		          options.length
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-options", role: "listbox", id: `${id}-list`, "aria-label": `${label}\u5019\u9009`, children: [
		        hits.map((hit, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "button",
		          {
		            type: "button",
		            tabIndex: -1,
		            role: "option",
		            "aria-selected": index === cursor,
		            id: `${id}-${index}`,
		            className: `rel-option${index === cursor ? " active" : ""}`,
		            title: hit.projects.join("\u3001"),
		            onMouseMove: () => setCursor(index),
		            onMouseDown: (e) => e.preventDefault(),
		            onClick: () => choose(hit.name),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rel-mono", children: hit.name }),
		              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
		                hit.projects.length,
		                " \u4E2A\u4ED3\u5E93"
		              ] })
		            ]
		          },
		          hit.name
		        )),
		        !hits.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "rel-empty", children: loading ? "\u6B63\u5728\u8BFB\u53D6\u5206\u652F\uFF0C\u53EF\u7EE7\u7EED\u8F93\u5165\u2026" : "\u6CA1\u6709\u5339\u914D\u5019\u9009\uFF0C\u53EF\u624B\u52A8\u8F93\u5165\u5206\u652F\u540D" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rel-dropdown-foot", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", children: error || (loading ? "\u672C\u5730\u5019\u9009\u53EF\u9009\uFF0C\u6B63\u5728\u66F4\u65B0\u8FDC\u7AEF\u2026" : "\u2191 \u2193 \u9009\u62E9 \xB7 Enter \u786E\u8BA4 \xB7 Esc \u6536\u8D77") }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "rel-text-btn", disabled: loading, onMouseDown: (e) => e.preventDefault(), onClick: onRefresh, children: "\u5237\u65B0\u8FDC\u7AEF" })
		      ] })
		    ] })
		  ] });
		}

		// src/client/SettingsPanel.tsx
		var import_react2 = require("react");
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function SettingsPanel({ onSaved }) {
		  const [form, setForm] = (0, import_react2.useState)(null);
		  const [token, setToken] = (0, import_react2.useState)("");
		  const [clearToken, setClearToken] = (0, import_react2.useState)(false);
		  const [path, setPath] = (0, import_react2.useState)("");
		  const [dirs, setDirs] = (0, import_react2.useState)(null);
		  const [busy, setBusy] = (0, import_react2.useState)(false);
		  const [message, setMessage] = (0, import_react2.useState)("");
		  const [test, setTest] = (0, import_react2.useState)(null);
		  (0, import_react2.useEffect)(() => {
		    const controller = new AbortController();
		    void api("/settings", { signal: controller.signal }).then(setForm).catch((e) => {
		      if (!controller.signal.aborted) setMessage(e.message);
		    });
		    return () => controller.abort();
		  }, []);
		  const change = (key, value) => setForm((prev) => prev ? { ...prev, [key]: value } : prev);
		  const browse = async (next) => {
		    setMessage("");
		    try {
		      const value = await api(`/settings/dirs?path=${encodeURIComponent(next)}`);
		      setDirs(value);
		      setPath(value.path);
		    } catch (e) {
		      setMessage(e.message);
		    }
		  };
		  const addRoot = (next) => {
		    if (form && next.trim()) change("roots", [.../* @__PURE__ */ new Set([...form.roots, next.trim()])]);
		  };
		  const save = async () => {
		    if (!form) return;
		    setBusy(true);
		    setMessage("");
		    const patch = {
		      gitlabBaseUrl: form.gitlabBaseUrl,
		      gitlabAccount: form.gitlabAccount,
		      tokenEnv: form.tokenEnv,
		      roots: form.roots,
		      scanDepth: form.scanDepth,
		      defaultTarget: form.defaultTarget,
		      concurrency: form.concurrency,
		      headCacheTtlSec: form.headCacheTtlSec,
		      mergeStrategy: form.mergeStrategy,
		      deleteSourceBranch: form.deleteSourceBranch,
		      ...clearToken ? { gitlabToken: "" } : token.trim() ? { gitlabToken: token.trim() } : {}
		    };
		    try {
		      const result = await api("/settings", { method: "POST", body: JSON.stringify(patch) });
		      if (!result.ok) {
		        setMessage(result.errors.join("\uFF1B"));
		        return;
		      }
		      setForm(result.settings);
		      setToken("");
		      setClearToken(false);
		      setMessage(`\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u5E76\u751F\u6548${result.rescan ? `\uFF0C\u53D1\u73B0 ${result.rescan.total} \u4E2A\u4ED3\u5E93` : ""}${result.warnings.length ? `\u3002${result.warnings.join("\uFF1B")}` : ""}`);
		      onSaved();
		    } catch (e) {
		      setMessage(e.message);
		    } finally {
		      setBusy(false);
		    }
		  };
		  const testConnection = async () => {
		    if (!form) return;
		    setBusy(true);
		    setTest(null);
		    try {
		      const result = await api("/settings/test", { method: "POST", body: JSON.stringify({
		        gitlabBaseUrl: form.gitlabBaseUrl,
		        ...token.trim() ? { gitlabToken: token.trim() } : {}
		      }) });
		      setTest(result);
		      if (result.ok && result.account) change("gitlabAccount", result.account);
		    } catch (e) {
		      setTest({ ok: false, ms: 0, error: e.message });
		    } finally {
		      setBusy(false);
		    }
		  };
		  if (!form) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rel-card", role: "status", children: message || "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026" });
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { id: "settingsCard", "aria-label": "\u53D1\u7248\u8BBE\u7F6E", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("fieldset", { disabled: busy, className: "rel-settings-fields", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "GitLab \u8FDE\u63A5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "rel-hint", children: "\u914D\u7F6E\u5730\u5740\u548C\u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C\uFF0C\u6D4B\u8BD5\u540E\u81EA\u52A8\u8BC6\u522B\u8D26\u53F7\u3002\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-grid", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-url", children: "GitLab \u5730\u5740" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: "rel-url", className: "rel-input", value: form.gitlabBaseUrl, placeholder: "https://git.example.com", onChange: (e) => change("gitlabBaseUrl", e.target.value) }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-account", children: "\u8D26\u53F7" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: "rel-account", className: "rel-input", value: form.gitlabAccount ?? "", placeholder: "\u8D26\u53F7\u540D\u79F0\uFF0C\u6D4B\u8BD5\u8FDE\u63A5\u540E\u81EA\u52A8\u8BC6\u522B", onChange: (e) => change("gitlabAccount", e.target.value) }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-token", children: "\u8BBF\u95EE\u4EE4\u724C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: "rel-token", className: "rel-input", type: "password", autoComplete: "new-password", value: token, onChange: (e) => {
		              setToken(e.target.value);
		              setClearToken(false);
		            }, placeholder: form.tokenSet ? `\u5DF2\u914D\u7F6E ${form.tokenHint}\uFF0C\u7559\u7A7A\u4FDD\u7559` : "\u586B\u5199 Personal Access Token\uFF08api \u6743\u9650\uFF09" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-hint", children: [
		              form.tokenSource === "env" ? `\u4F7F\u7528\u73AF\u5883\u53D8\u91CF ${form.tokenEnv}` : form.tokenSet ? `\u5DF2\u4FDD\u5B58 ${form.tokenHint}` : "\u5C1A\u672A\u914D\u7F6E\u4EE4\u724C",
		              " \xB7 \u63A5\u53E3\u4E0D\u8FD4\u56DE\u660E\u6587"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "rel-hint", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: clearToken, onChange: (e) => setClearToken(e.target.checked) }),
		              " \u6E05\u9664\u5DF2\u4FDD\u5B58\u4EE4\u724C\uFF0C\u4F7F\u7528\u73AF\u5883\u53D8\u91CF"
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-env", children: "\u73AF\u5883\u53D8\u91CF" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: "rel-env", className: "rel-input", value: form.tokenEnv, onChange: (e) => change("tokenEnv", e.target.value) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-actions", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "rel-btn secondary", disabled: busy || clearToken, onClick: () => void testConnection(), children: "\u6D4B\u8BD5 GitLab \u8FDE\u63A5" }),
		          test && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { role: "status", className: test.ok ? "rel-success" : "rel-error", children: test.ok ? `\u8FDE\u63A5\u6210\u529F \xB7 ${test.account ?? "GitLab"} \xB7 ${test.ms}ms${test.note ? ` \xB7 ${test.note}` : ""}` : test.error })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "\u626B\u63CF\u76EE\u5F55" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "rel-hint", children: "\u6DFB\u52A0\u9879\u76EE\u6240\u5728\u7684\u7236\u76EE\u5F55\u3002\u4FDD\u5B58\u540E\u81EA\u52A8\u91CD\u65B0\u626B\u63CF\uFF0C\u4E5F\u53EF\u4EE5\u9010\u7EA7\u6D4F\u89C8\u76EE\u5F55\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rel-root-list", children: form.roots.map((root) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-root", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: root }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "rel-text-btn", onClick: () => change("roots", form.roots.filter((r) => r !== root)), "aria-label": `\u79FB\u9664 ${root}`, children: "\u79FB\u9664" })
		        ] }, root)) }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-inline", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "rel-input", "aria-label": "\u626B\u63CF\u76EE\u5F55\u8DEF\u5F84", value: path, placeholder: "\u4F8B\u5982 D:\\\\xls-code", onChange: (e) => setPath(e.target.value), onKeyDown: (e) => {
		            if (e.key === "Enter") {
		              e.preventDefault();
		              void browse(path);
		            }
		          } }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "rel-btn secondary", onClick: () => void browse(path), children: "\u6D4F\u89C8\u76EE\u5F55" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "rel-btn secondary", disabled: !path.trim(), onClick: () => addRoot(path), children: "\u6DFB\u52A0\u76EE\u5F55" })
		        ] }),
		        dirs && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-browser", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-inline", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: dirs.path }),
		            dirs.parent && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "rel-text-btn", onClick: () => void browse(dirs.parent), children: "\u4E0A\u4E00\u7EA7" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "rel-text-btn", onClick: () => addRoot(dirs.path), children: "\u6DFB\u52A0\u5F53\u524D\u76EE\u5F55" })
		          ] }),
		          dirs.error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "rel-error", children: dirs.error }),
		          dirs.entries.map((dir) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { className: "rel-dir", onClick: () => void browse(dir.path), children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
		              "\u25B8 ",
		              dir.name
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: dir.isRepo ? "Git \u4ED3\u5E93" : "\u76EE\u5F55" })
		          ] }, dir.path)),
		          !dirs.entries.length && !dirs.error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "rel-hint", children: "\u6CA1\u6709\u5B50\u76EE\u5F55" })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "\u53D1\u7248\u4E0E\u6027\u80FD" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-grid", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-depth", children: "\u626B\u63CF\u6DF1\u5EA6" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: "rel-depth", className: "rel-input", type: "number", min: 1, max: 8, value: form.scanDepth, onChange: (e) => change("scanDepth", Number(e.target.value)) }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-default", children: "\u9ED8\u8BA4\u76EE\u6807\u5206\u652F" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: "rel-default", className: "rel-input", value: form.defaultTarget, onChange: (e) => change("defaultTarget", e.target.value) }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-concurrency", children: "\u5E76\u53D1\u6570" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: "rel-concurrency", className: "rel-input", type: "number", min: 1, max: 16, value: form.concurrency, onChange: (e) => change("concurrency", Number(e.target.value)) }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-ttl", children: "\u7F13\u5B58\u6709\u6548\u671F / \u79D2" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: "rel-ttl", className: "rel-input", type: "number", min: 0, max: 86400, value: form.headCacheTtlSec, onChange: (e) => change("headCacheTtlSec", Number(e.target.value)) }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "rel-strategy", children: "\u5408\u5E76\u7B56\u7565" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { id: "rel-strategy", className: "rel-select", value: form.mergeStrategy, onChange: (e) => change("mergeStrategy", e.target.value), children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "merge", children: "\u666E\u901A\u5408\u5E76" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "ff-only", children: "\u4EC5\u5FEB\u8FDB" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "no-ff", children: "\u603B\u662F\u521B\u5EFA\u5408\u5E76\u63D0\u4EA4" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", {}),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: form.deleteSourceBranch, onChange: (e) => change("deleteSourceBranch", e.target.checked) }),
		            " \u5408\u5E76\u540E\u5220\u9664\u6E90\u5206\u652F"
		          ] })
		        ] })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rel-save", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { id: "saveBtn", className: "rel-btn", disabled: busy, onClick: () => void save(), children: busy ? "\u5904\u7406\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E" }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { role: "status", children: message })
		    ] })
		  ] });
		}

		// src/client/TasksPanel.tsx
		var import_react3 = require("react");
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function TasksPanel({ onReuse }) {
		  const [tasks, setTasks] = (0, import_react3.useState)([]);
		  const [error, setError] = (0, import_react3.useState)("");
		  const [busy, setBusy] = (0, import_react3.useState)(false);
		  const load = async () => {
		    setBusy(true);
		    setError("");
		    try {
		      setTasks((await api("/tasks")).tasks);
		    } catch (e) {
		      setError(e.message);
		    } finally {
		      setBusy(false);
		    }
		  };
		  (0, import_react3.useEffect)(() => {
		    void load();
		  }, []);
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { id: "taskCard", className: "rel-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "rel-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { children: "\u4EFB\u52A1\u4E2D\u5FC3" }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "rel-btn secondary", disabled: busy, onClick: () => void load(), children: "\u5237\u65B0\u8BB0\u5F55" })
		    ] }),
		    error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "rel-error", role: "alert", children: error }),
		    !tasks.length && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "rel-empty", children: busy ? "\u6B63\u5728\u8BFB\u53D6\u4EFB\u52A1\u2026" : "\u6682\u65E0\u6267\u884C\u8BB0\u5F55\u3002\u6267\u884C\u53D1\u7248\u540E\u53EF\u5728\u8FD9\u91CC\u67E5\u770B\u7ED3\u679C\u3002" }),
		    tasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { className: "rel-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("summary", { children: [
		        task.sourceBranch,
		        " \u2192 ",
		        task.targetBranch,
		        " \xB7 \u6210\u529F ",
		        task.succeeded,
		        " / \u5931\u8D25 ",
		        task.failed,
		        " / \u8DF3\u8FC7 ",
		        task.skipped,
		        " ",
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "rel-hint", children: new Date(task.startedAt).toLocaleString() })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "rel-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("table", { className: "rel-table", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { children: "\u4ED3\u5E93" }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { children: "\u7ED3\u679C" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tbody", { children: task.results.map((row) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: row.name }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("td", { children: [
		            row.message,
		            " ",
		            row.url && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("a", { className: "rel-link", href: row.url, target: "_blank", rel: "noreferrer", children: "\u6253\u5F00 MR" })
		          ] })
		        ] }, row.projectId)) })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "rel-btn secondary", onClick: () => onReuse(task), children: "\u56DE\u586B\u53C2\u6570" })
		    ] }, task.id))
		  ] });
		}

		// src/client/ReleasePage.tsx
		var import_jsx_runtime4 = require("react/jsx-runtime");
		function sourceBranchOrder(item) {
		  if (item.sourceSha) return 0;
		  return item.checks.some((check) => check.id === "source-exists" && check.status === "danger") ? 2 : 1;
		}
		var STYLE_ID = "dsh-plugin-release-style";
		var STYLE = `
		.rel-page { height: 100%; overflow: auto; box-sizing: border-box; padding: 24px 28px 64px; font-family: var(--dsw-font-family, 'Segoe UI', 'Microsoft YaHei', sans-serif); color: var(--dsw-alias-label-primary); }
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
		.rel-shell { display: grid; grid-template-columns: 148px minmax(0, 1fr); height: 100%; background: var(--dsw-alias-bg-base); }
		.rel-nav { padding: 24px 12px; border-right: 1px solid var(--dsw-alias-settings-card-stroke); }
		.rel-brand { padding: 4px 12px 22px; font-size: 11px; letter-spacing: .16em; color: var(--dsw-alias-label-tertiary); }
		.rel-nav button { display: block; text-align: left; width: 100%; padding: 10px 12px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; margin-bottom: 5px; }
		.rel-nav button[aria-current=page] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); color: var(--dsw-alias-state-business-primary); font-weight: 600; }
		.rel-content { max-width: 1160px; margin: 0 auto; }
		.rel-head h1 { font-size: 20px; font-weight: 600; }
		.rel-head { align-items: center; }
		.rel-head > .rel-btn { flex: none; white-space: nowrap; }
		.rel-head .rel-status { margin-top: 7px; display: block; line-height: 1.6; }
		.rel-combo { position: relative; }
		.rel-dropdown { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0; background: var(--dsw-alias-bg-module-platform); border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: 10px; box-shadow: 0 10px 30px #0002; overflow: hidden; }
		.rel-dropdown-title, .rel-dropdown-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
		.rel-options { max-height: 270px; overflow-y: auto; }
		.rel-option { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; text-align: left; padding: 9px 12px; border: 0; background: transparent; color: inherit; cursor: pointer; }
		.rel-option.active { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); }
		.rel-option span { overflow-wrap: anywhere; }
		.rel-option small { white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
		.rel-mono, .rel-root code, .rel-browser code { font-family: Consolas, monospace; font-size: 12px; }
		.rel-text-btn { background: transparent; border: 0; color: var(--dsw-alias-link); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
		.rel-text-btn:disabled { opacity: .5; cursor: default; }
		.rel-empty { padding: 14px; color: var(--dsw-alias-label-tertiary); font-size: 13px; }
		.rel-inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
		.rel-inline .rel-input { flex: 1; min-width: 160px; }
		.rel-inline .rel-btn { white-space: nowrap; }
		.rel-root-list { margin-bottom: 14px; }
		.rel-root { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-settings-card-stroke); overflow-wrap: anywhere; }
		.rel-browser { margin-top: 12px; border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: 8px; padding: 12px; max-height: 280px; overflow: auto; }
		.rel-dir { display: flex; justify-content: space-between; width: 100%; border: 0; background: transparent; padding: 9px; color: inherit; cursor: pointer; text-align: left; }
		.rel-dir:hover { background: var(--dsw-alias-bg-base); }
		.rel-save { display: flex; align-items: center; gap: 14px; position: sticky; bottom: 0; background: var(--dsw-alias-bg-module-platform); border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: 10px; padding: 14px; font-size: 13px; }
		.rel-settings-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
		.rel-error { color: var(--dsw-alias-state-error-primary); font-size: 13px; }
		.rel-success { color: var(--dsw-alias-state-success-primary); font-size: 13px; }
		.rel-notice { padding: 12px 16px; border-left: 3px solid var(--dsw-alias-state-business-primary); margin-bottom: 16px; background: var(--dsw-alias-bg-module-platform); font-size: 13px; }
		@media (max-width: 780px) { .rel-shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); } .rel-nav { padding: 8px 12px; display: flex; gap: 6px; border-right: 0; border-bottom: 1px solid var(--dsw-alias-settings-card-stroke); } .rel-brand { display: none; } .rel-nav button { width: auto; margin: 0; } .rel-page { padding: 18px 14px 40px; } .rel-grid { grid-template-columns: 1fr; gap: 6px; } .rel-card { padding: 16px; } .rel-head { align-items: flex-start; } }
		`;
		function Tag({ tone, children }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: `rel-tag ${tone}`, children });
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
		function ReleasePage({ initialTab = "release" } = {}) {
		  const [tab, setTab] = (0, import_react4.useState)(initialTab);
		  const [settings, setSettings] = (0, import_react4.useState)(null);
		  const [catalog, setCatalog] = (0, import_react4.useState)(null);
		  const [catalogError, setCatalogError] = (0, import_react4.useState)("");
		  const [catalogVersion, setCatalogVersion] = (0, import_react4.useState)(0);
		  const forceCatalog = (0, import_react4.useRef)(false);
		  const [projectQuery, setProjectQuery] = (0, import_react4.useState)("");
		  const [projects, setProjects] = (0, import_react4.useState)([]);
		  const [selected, setSelected] = (0, import_react4.useState)({});
		  const [mode, setMode] = (0, import_react4.useState)("create-mr");
		  const [source, setSource] = (0, import_react4.useState)("");
		  const [target, setTarget] = (0, import_react4.useState)("");
		  const [title, setTitle] = (0, import_react4.useState)("");
		  const [description, setDescription] = (0, import_react4.useState)("");
		  const [plan, setPlan] = (0, import_react4.useState)(null);
		  const planItems = (0, import_react4.useMemo)(() => [...plan?.items ?? []].sort((a, b) => sourceBranchOrder(a) - sourceBranchOrder(b)), [plan]);
		  const [applied, setApplied] = (0, import_react4.useState)(null);
		  const [mrs, setMrs] = (0, import_react4.useState)(null);
		  const [loadingProjects, setLoadingProjects] = (0, import_react4.useState)(false);
		  const [checking, setChecking] = (0, import_react4.useState)(false);
		  const [applying, setApplying] = (0, import_react4.useState)(false);
		  const checkRequest = (0, import_react4.useRef)(null);
		  const formLocked = loadingProjects || applying;
		  const busy = formLocked || checking;
		  const [status, setStatus] = (0, import_react4.useState)("\u6B63\u5728\u52A0\u8F7D\u2026");
		  const hint = applying ? "\u6267\u884C\u4E2D\u2026" : loadingProjects ? "\u6B63\u5728\u8BFB\u53D6\u4ED3\u5E93\u2026" : checking ? "\u9884\u68C0\u4E2D\uFF0C\u53EF\u4FEE\u6539\u53C2\u6570\u6216\u53D6\u6D88\u2026" : "";
		  const [toast, setToast] = (0, import_react4.useState)("");
		  const toastTimer = (0, import_react4.useRef)(void 0);
		  const notify = (0, import_react4.useCallback)((text) => {
		    setToast(text);
		    window.clearTimeout(toastTimer.current);
		    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
		  }, []);
		  (0, import_react4.useEffect)(() => {
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
		  const loadProjects = (0, import_react4.useCallback)(async (refresh) => {
		    setLoadingProjects(true);
		    try {
		      const value = await api(
		        `/projects${refresh ? "?refresh=1" : ""}`
		      );
		      setProjects(value.projects);
		      setStatus(`\u5171 ${String(value.total)} \u4E2A\u4ED3\u5E93\uFF0C\u542F\u7528 ${String(value.enabled)} \u4E2A \xB7 \u6839\u76EE\u5F55 ${value.roots.join("\u3001") || "\u672A\u914D\u7F6E"}`);
		    } catch (error) {
		      setStatus(`\u52A0\u8F7D\u5931\u8D25\uFF1A${error.message}`);
		    } finally {
		      setLoadingProjects(false);
		    }
		  }, []);
		  (0, import_react4.useEffect)(() => {
		    void loadProjects(false);
		  }, [loadProjects]);
		  const loadSettings = (0, import_react4.useCallback)(async () => {
		    try {
		      setSettings(await api("/settings"));
		    } catch (e) {
		      notify(`\u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25\uFF1A${e.message}`);
		    }
		  }, [notify]);
		  (0, import_react4.useEffect)(() => {
		    void loadSettings();
		  }, [loadSettings]);
		  (0, import_react4.useEffect)(() => () => {
		    window.clearTimeout(toastTimer.current);
		    const request = checkRequest.current;
		    checkRequest.current = null;
		    if (request) {
		      window.clearTimeout(request.timer);
		      request.controller.abort();
		    }
		  }, []);
		  const projectKey = projects.map((p) => p.id).join(",");
		  (0, import_react4.useEffect)(() => {
		    if (!projectKey) {
		      setCatalog(null);
		      return;
		    }
		    const controller = new AbortController();
		    let timer;
		    const load = async () => {
		      try {
		        const force = forceCatalog.current;
		        forceCatalog.current = false;
		        const value = await api(`/branch-options${force ? "?refresh=1" : ""}`, { signal: controller.signal });
		        if (controller.signal.aborted) return;
		        setCatalog(value);
		        setCatalogError("");
		        if (value.loading) timer = window.setTimeout(() => void load(), 1e3);
		      } catch (e) {
		        if (!controller.signal.aborted) setCatalogError(`\u8BFB\u53D6\u5931\u8D25\uFF1A${e.message}`);
		      }
		    };
		    void load();
		    return () => {
		      controller.abort();
		      window.clearTimeout(timer);
		    };
		  }, [projectKey, catalogVersion]);
		  const selectedIds = (0, import_react4.useMemo)(
		    () => projects.filter((p) => p.enabled && selected[p.id] !== false).map((p) => p.id),
		    [projects, selected]
		  );
		  const options = (0, import_react4.useMemo)(() => {
		    const ids = new Set(selectedIds);
		    return (catalog?.options ?? []).map((o) => ({
		      ...o,
		      projectIds: o.projectIds.filter((id) => ids.has(id)),
		      projects: o.projects.filter((_, index) => ids.has(o.projectIds[index] ?? ""))
		    })).filter((o) => o.projectIds.length);
		  }, [catalog, selectedIds]);
		  const refreshBranches = () => {
		    forceCatalog.current = true;
		    setCatalogVersion((n) => n + 1);
		  };
		  const cancelCheck = (0, import_react4.useCallback)(() => {
		    const request = checkRequest.current;
		    checkRequest.current = null;
		    if (request) {
		      window.clearTimeout(request.timer);
		      request.controller.abort();
		    }
		    setChecking(false);
		  }, []);
		  const invalidatePlan = (0, import_react4.useCallback)(() => {
		    cancelCheck();
		    setPlan(null);
		    setApplied(null);
		    setMrs(null);
		  }, [cancelCheck]);
		  const savedSettings = () => {
		    invalidatePlan();
		    setCatalog(null);
		    void loadSettings();
		    void loadProjects(false);
		    setCatalogVersion((n) => n + 1);
		  };
		  (0, import_react4.useEffect)(invalidatePlan, [invalidatePlan, mode, source, target, title, description, selectedIds]);
		  const doCheck = (0, import_react4.useCallback)(async () => {
		    if (!source.trim()) {
		      notify("\u8BF7\u5148\u586B\u6E90\u5206\u652F");
		      return;
		    }
		    if (!selectedIds.length) {
		      notify("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u4ED3\u5E93");
		      return;
		    }
		    cancelCheck();
		    const request = { controller: new AbortController(), timer: 0 };
		    checkRequest.current = request;
		    request.timer = window.setTimeout(() => {
		      if (checkRequest.current !== request) return;
		      cancelCheck();
		      notify("\u9884\u68C0\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5");
		    }, 12e4);
		    setChecking(true);
		    setPlan(null);
		    setApplied(null);
		    setMrs(null);
		    try {
		      const value = await api("/check", {
		        method: "POST",
		        signal: request.controller.signal,
		        body: JSON.stringify({
		          mode,
		          sourceBranch: source.trim(),
		          targetBranch: target.trim() || void 0,
		          title: title.trim() || void 0,
		          description: description.trim() || void 0,
		          projects: selectedIds,
		          refresh: true
		        })
		      });
		      if (checkRequest.current !== request) return;
		      setPlan(value);
		      notify("\u9884\u68C0\u5B8C\u6210");
		    } catch (error) {
		      if (checkRequest.current === request) notify(`\u9884\u68C0\u5931\u8D25\uFF1A${error.message}`);
		    } finally {
		      window.clearTimeout(request.timer);
		      if (checkRequest.current === request) {
		        checkRequest.current = null;
		        setChecking(false);
		      }
		    }
		  }, [source, mode, target, title, description, selectedIds, notify, cancelCheck]);
		  const doApply = (0, import_react4.useCallback)(async () => {
		    if (plan === null) return;
		    const executable = plan.summary.executable;
		    if (!executable) {
		      notify("\u6CA1\u6709\u53EF\u6267\u884C\u7684\u4ED3\u5E93");
		      return;
		    }
		    if (!window.confirm(`\u786E\u8BA4\u5BF9 ${String(executable)} \u4E2A\u4ED3\u5E93\u6267\u884C\u300C${plan.mode}\u300D\uFF1F\u6B64\u64CD\u4F5C\u4F1A\u5199\u8FDC\u7AEF\u3002`)) return;
		    setApplying(true);
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
		      setApplying(false);
		    }
		  }, [plan, notify]);
		  const loadMrs = (0, import_react4.useCallback)(async () => {
		    try {
		      const value = await api("/mrs");
		      setMrs(value);
		    } catch (error) {
		      setMrs(null);
		      notify(`MR \u72B6\u6001\uFF1A${error.message}`);
		    }
		  }, [notify]);
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-shell", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("nav", { className: "rel-nav", "aria-label": "\u53D1\u7248\u5BFC\u822A", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-brand", children: "RELEASE DESK" }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { "aria-current": tab === "release" ? "page" : void 0, onClick: () => setTab("release"), children: "\u6279\u91CF\u53D1\u7248" }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { "aria-current": tab === "tasks" ? "page" : void 0, onClick: () => setTab("tasks"), children: "\u4EFB\u52A1\u4E2D\u5FC3" }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { "aria-current": tab === "settings" ? "page" : void 0, onClick: () => setTab("settings"), children: "\u53D1\u7248\u8BBE\u7F6E" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-page", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-content", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h1", { children: tab === "settings" ? "\u53D1\u7248\u8BBE\u7F6E" : tab === "tasks" ? "\u4EFB\u52A1\u4E2D\u5FC3" : "\u6279\u91CF\u53D1\u7248" }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rel-status", children: status })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-btn secondary", onClick: () => setTab(tab === "settings" ? "release" : "settings"), children: tab === "settings" ? "\u8FD4\u56DE\u53D1\u7248" : "\u8BBE\u7F6E" })
		      ] }),
		      tab === "settings" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SettingsPanel, { onSaved: savedSettings }),
		      tab === "tasks" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TasksPanel, { onReuse: (task) => {
		        setMode(task.mode);
		        setSource(task.sourceBranch);
		        setTarget(task.targetBranch);
		        setTitle(task.title ?? "");
		        setSelected(Object.fromEntries(projects.map((p) => [p.id, task.results.some((r) => r.projectId === p.id)])));
		        invalidatePlan();
		        setTab("release");
		      } }),
		      tab === "release" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
		        settings && (!settings.gitlabReady || !settings.roots.length) && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-notice", children: [
		          !settings.roots.length ? "\u8BF7\u5148\u6DFB\u52A0\u626B\u63CF\u76EE\u5F55\uFF0C\u53D1\u73B0\u672C\u5730\u4ED3\u5E93\u3002" : "GitLab \u8FDE\u63A5\u5C1A\u672A\u914D\u9F50\uFF0C\u8BF7\u5230\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u5730\u5740\u4E0E\u4EE4\u724C\u3002",
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-text-btn", onClick: () => setTab("settings"), children: "\u6253\u5F00\u8BBE\u7F6E \u2192" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { children: "\u53D1\u7248\u53C2\u6570" }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-grid", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { children: "\u6A21\u5F0F" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { className: "rel-select", "aria-label": "\u6A21\u5F0F", disabled: formLocked, value: mode, onChange: (e) => {
		              invalidatePlan();
		              setMode(e.target.value);
		            }, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "create-mr", children: "\u53EA\u5EFA MR\uFF08\u5408\u5E76\u7559\u7ED9 GitLab\uFF09" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "merge-mr", children: "\u5728 GitLab \u5408\u5E76 MR" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "merge-git", children: "\u672C\u5730\u5408\u5E76\u540E\u63A8\u9001" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { children: "\u6E90\u5206\u652F" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(BranchInput, { label: "\u6E90\u5206\u652F", value: source, onChange: (value) => {
		                invalidatePlan();
		                setSource(value);
		              }, options, loading: projects.length > 0 && (catalog?.loading ?? !catalog), error: catalogError || (catalog?.errors.length ? catalog.errors.length + " \u4E2A\u4ED3\u5E93\u8FDC\u7AEF\u8BFB\u53D6\u5931\u8D25\uFF0C\u4FDD\u7559\u672C\u5730\u5019\u9009" : ""), onRefresh: refreshBranches, placeholder: "\u8F93\u5165\u5173\u952E\u5B57\uFF0C\u6A21\u7CCA\u5339\u914D\u5206\u652F", disabled: formLocked }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-hint", children: "\u5339\u914D\u5206\u652F\u540D\u540E\u9009\u62E9\uFF1B\u5019\u9009\u4EC5\u7528\u4E8E\u8F85\u52A9\uFF0C\u9884\u68C0\u4F1A\u6838\u5B9E\u8FDC\u7AEF\u3002" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { children: "\u76EE\u6807\u5206\u652F" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(BranchInput, { label: "\u76EE\u6807\u5206\u652F", value: target, onChange: (value) => {
		              invalidatePlan();
		              setTarget(value);
		            }, options, loading: projects.length > 0 && (catalog?.loading ?? !catalog), error: catalogError, onRefresh: refreshBranches, placeholder: settings ? "\u7559\u7A7A = \u5404\u4ED3\u5E93\u9ED8\u8BA4\uFF08" + settings.defaultTarget + "\uFF09" : "\u7559\u7A7A = \u5404\u4ED3\u5E93\u9ED8\u8BA4", disabled: formLocked }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { children: "\u6807\u9898" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		              "input",
		              {
		                className: "rel-input",
		                value: title,
		                disabled: formLocked,
		                placeholder: "MR \u6807\u9898 / \u5408\u5E76\u63D0\u4EA4\u4FE1\u606F\uFF0C\u7559\u7A7A\u81EA\u52A8\u751F\u6210",
		                onChange: (e) => {
		                  invalidatePlan();
		                  setTitle(e.target.value);
		                }
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { children: "\u8BF4\u660E" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		              "textarea",
		              {
		                className: "rel-textarea",
		                rows: 2,
		                value: description,
		                disabled: formLocked,
		                placeholder: "MR \u8BF4\u660E / \u5408\u5E76\u63D0\u4EA4\u6B63\u6587\uFF08\u53EF\u9009\uFF09",
		                onChange: (e) => {
		                  invalidatePlan();
		                  setDescription(e.target.value);
		                }
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { children: "\u4ED3\u5E93" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-inline", style: { marginBottom: 10 }, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { className: "rel-input", "aria-label": "\u641C\u7D22\u4ED3\u5E93", placeholder: "\u7B5B\u9009\u4ED3\u5E93\u540D\u79F0\u6216\u8DEF\u5F84", value: projectQuery, onChange: (e) => setProjectQuery(e.target.value) }),
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-text-btn", disabled: formLocked, onClick: () => {
		                  invalidatePlan();
		                  setSelected({});
		                }, children: "\u5168\u9009" }),
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-text-btn", disabled: formLocked, onClick: () => {
		                  invalidatePlan();
		                  setSelected(Object.fromEntries(projects.map((p) => [p.id, false])));
		                }, children: "\u6E05\u7A7A" })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-chips", children: projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rel-muted", children: "\u6CA1\u6709\u53EF\u7528\u4ED3\u5E93\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u6DFB\u52A0\u626B\u63CF\u76EE\u5F55" }) : projects.filter((p) => (p.name + p.gitlabPath).toLowerCase().includes(projectQuery.toLowerCase())).map((project) => {
		                const checked = selected[project.id] !== false;
		                return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: `rel-chip${checked ? "" : " off"}`, title: project.defaultTarget ? `${project.name} \xB7 \u9ED8\u8BA4\u76EE\u6807 ${project.defaultTarget}` : project.name, children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		                    "input",
		                    {
		                      type: "checkbox",
		                      checked: checked && project.enabled,
		                      disabled: formLocked || !project.enabled,
		                      onChange: (e) => {
		                        const checked2 = e.target.checked;
		                        invalidatePlan();
		                        setSelected((prev) => ({ ...prev, [project.id]: checked2 }));
		                      }
		                    }
		                  ),
		                  project.name
		                ] }, project.id);
		              }) }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-hint", children: [
		                "\u5DF2\u9009 ",
		                selectedIds.length,
		                " / ",
		                projects.filter((p) => p.enabled).length,
		                " \u4E2A\u53EF\u7528\u4ED3\u5E93 \xB7 ",
		                options.length,
		                " \u4E2A\u5019\u9009\u5206\u652F",
		                catalog?.loading ? " \xB7 \u8FDC\u7AEF\u66F4\u65B0\u4E2D\u2026" : ""
		              ] })
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-actions", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-btn", disabled: busy || !selectedIds.length || !source.trim(), onClick: () => void doCheck(), children: checking ? "\u9884\u68C0\u4E2D\u2026" : "\u9884\u68C0" }),
		            checking && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-btn secondary", onClick: () => {
		              cancelCheck();
		              notify("\u5DF2\u53D6\u6D88\u9884\u68C0");
		            }, children: "\u53D6\u6D88\u9884\u68C0" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-btn secondary", disabled: catalog?.loading || busy, onClick: refreshBranches, children: "\u5237\u65B0\u5206\u652F" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-btn secondary", disabled: busy, onClick: () => {
		              invalidatePlan();
		              void loadProjects(true).then(() => {
		                setCatalog(null);
		                setCatalogVersion((n) => n + 1);
		              });
		            }, children: "\u91CD\u65B0\u626B\u63CF\u4ED3\u5E93" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rel-hint", children: hint })
		          ] })
		        ] }),
		        plan !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { children: "\u9884\u68C0\u7ED3\u679C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-summary", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u4ED3\u5E93 ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: plan.summary.total })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u53EF\u6267\u884C ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: plan.summary.executable })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u65E0\u53D8\u5316 ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: plan.summary.noop ?? 0 })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u963B\u585E ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: plan.summary.blocked ?? plan.summary.total - plan.summary.executable })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u9884\u68C0\u7528\u65F6 ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("b", { children: [
		                plan.checkDurationMs,
		                "ms"
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "rel-muted", children: [
		              "\u8BA1\u5212 ",
		              plan.id.slice(0, 8),
		              "\u2026 \u6709\u6548\u81F3 ",
		              new Date(plan.expiresAt).toLocaleTimeString()
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("table", { className: "rel-table", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u4ED3\u5E93" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u7ED3\u679C" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u63D0\u4EA4" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "MR" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u8BF4\u660E" })
		            ] }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tbody", { children: planItems.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: item.name }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tag, { tone: planTone(item), children: item.noop ? "\u65E0\u53D8\u5316" : item.executable ? "\u53EF\u6267\u884C" : "\u963B\u585E" }) }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("td", { children: [
		                item.ahead ?? "?",
		                " \u2191 / ",
		                item.behind ?? "?",
		                " \u2193"
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: item.mr === null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rel-muted", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("a", { className: "rel-link", href: item.mr.url, target: "_blank", rel: "noreferrer", children: [
		                "!",
		                item.mr.iid
		              ] }) }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("td", { children: [
		                item.blockers.map((text) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tag, { tone: "bad", children: text }, text)),
		                item.warnings.map((text) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tag, { tone: "warn", children: text }, text)),
		                item.checks.filter((c) => c.status === "danger" || c.status === "unknown").map((c) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Tag, { tone: "bad", children: [
		                  c.label,
		                  c.detail ? `\uFF1A${c.detail}` : ""
		                ] }, c.id)),
		                item.checks.filter((c) => c.status === "warn").map((c) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Tag, { tone: "warn", children: [
		                  c.label,
		                  c.detail ? `\uFF1A${c.detail}` : ""
		                ] }, c.id)),
		                item.blockers.length + item.warnings.length + item.checks.filter((c) => c.status === "danger" || c.status === "unknown" || c.status === "warn").length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rel-muted", children: "\u2014" })
		              ] })
		            ] }, item.projectId)) })
		          ] }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-actions", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-btn", disabled: busy || !plan.summary.executable, onClick: () => void doApply(), children: "\u786E\u8BA4\u6267\u884C" }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rel-hint", children: plan.summary.executable ? `\u5C06\u5904\u7406 ${String(plan.summary.executable)} \u4E2A\u4ED3\u5E93\uFF0C10 \u5206\u949F\u5185\u6709\u6548` : "\u6CA1\u6709\u53EF\u6267\u884C\u7684\u4ED3\u5E93" })
		          ] })
		        ] }),
		        applied !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { children: "\u6267\u884C\u7ED3\u679C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-summary", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u6210\u529F ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: applied.succeeded })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u5931\u8D25 ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: applied.failed })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u8DF3\u8FC7 ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: applied.skipped })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u7528\u65F6 ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("b", { children: [
		                applied.durationMs,
		                "ms"
		              ] })
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("table", { className: "rel-table", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u4ED3\u5E93" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u7ED3\u679C" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u8BF4\u660E" })
		            ] }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tbody", { children: applied.results.map((row) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: row.name }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tag, { tone: row.ok ? "ok" : "bad", children: row.ok ? "\u6210\u529F" : "\u5931\u8D25" }) }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("td", { children: [
		                row.message,
		                row.url ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
		                  " \xB7 ",
		                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("a", { className: "rel-link", href: row.url, target: "_blank", rel: "noreferrer", children: "\u6253\u5F00" })
		                ] }) : null
		              ] })
		            ] }, row.projectId)) })
		          ] }) })
		        ] }),
		        mrs !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { children: "MR \u72B6\u6001" }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rel-summary", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "MR ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: mrs.total })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u51B2\u7A81 ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: mrs.conflicts })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
		              "\u8BA1\u7B97\u4E2D ",
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: mrs.checking })
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("table", { className: "rel-table", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u4ED3\u5E93" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "MR" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u72B6\u6001" }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u6D41\u6C34\u7EBF" })
		            ] }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tbody", { children: mrs.mrs.map((row) => {
		              const label = MR_LABEL[row.mr.mergeStatus] ?? [row.mr.mergeStatus, "plain"];
		              return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: row.project }),
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("a", { className: "rel-link", href: row.mr.url, target: "_blank", rel: "noreferrer", children: [
		                  "!",
		                  row.mr.iid,
		                  " ",
		                  row.mr.title
		                ] }) }),
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("td", { children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Tag, { tone: label[1], children: label[0] }),
		                  row.mr.detail ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rel-muted", children: row.mr.detail }) : null
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: row.mr.pipeline })
		              ] }, row.project);
		            }) })
		          ] }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-actions", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "rel-btn secondary", disabled: busy, onClick: () => void loadMrs(), children: "\u5237\u65B0\u72B6\u6001" }) })
		        ] })
		      ] }),
		      toast !== "" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rel-toast", children: toast })
		    ] }) })
		  ] });
		}

		// src/client/ReleaseIcon.tsx
		var import_jsx_runtime5 = require("react/jsx-runtime");
		function ReleaseIcon({ size, active }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M7 20V9" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "7", cy: "5", r: "2.4" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M7 13c0-2.2 1.8-4 4-4h4.5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "17.5", cy: "9", r: "2.2" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M14 20l3-3.6 3 3.6" })
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
