/** Shared React application, also registered as the Harness main panel. */
export const WEB_PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>批量发版</title><style>
:root {
 color-scheme: light dark;
 --dsw-font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
 --dsw-alias-bg-base: #f5f6f8; --dsw-alias-bg-module-platform: #fff;
 --dsw-alias-label-primary: #202b36; --dsw-alias-label-tertiary: #637182;
 --dsw-alias-settings-card-stroke: #dce2e9; --dsw-alias-state-business-primary: #2466a6;
 --dsw-alias-button-primary-fill: #2466a6; --dsw-alias-label-primary-foreground: #fff;
 --dsw-alias-state-success-primary: #187257; --dsw-alias-state-warn-primary: #a26418;
 --dsw-alias-state-warn-label: #8b5c1d; --dsw-alias-state-error-primary: #b83a3a;
 --dsw-alias-link: #2466a6; --dsw-radius-lg: 12px; --dsw-radius-md: 7px;
}
@media(prefers-color-scheme:dark) { :root {
 --dsw-alias-bg-base: #171b20; --dsw-alias-bg-module-platform: #20262d;
 --dsw-alias-label-primary: #e3e8ef; --dsw-alias-label-tertiary: #a2adbc;
 --dsw-alias-settings-card-stroke: #35404d; --dsw-alias-state-business-primary: #83b8ee;
 --dsw-alias-link: #83b8ee; --dsw-alias-state-success-primary: #72cfac;
 --dsw-alias-state-error-primary: #f18b8b;
} }
html,body,#app { margin:0; height:100%; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-base); }
button,input,select,textarea { font-family:inherit; } button:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px; }
</style></head><body><div id="app"></div><noscript>请启用 JavaScript 后使用发版控制台。</noscript>
<script src="/release-ui/app.js"></script></body></html>`;
