# dsh-plugins

DeepSeek Harness（DSH）插件集合。每个插件是 `plugins/` 下的独立包，可单独安装、单独构建。

## 插件列表

| 插件 | 说明 |
|---|---|
| [`release`](plugins/release) | 跨仓库批量发版：预检、创建 MR、合并，带侧边栏面板与对话工具 |

## 安装某个插件

以 `release` 为例，装到桌面版（profile 名 `desktop`）：

```sh
# 1. 装依赖（等价于在 profile 目录里跑 pnpm add）
dsh plugin --profile desktop add link:C:/Users/DSL/dsh-plugins/plugins/release
```

**关键：`dsh plugin add` 只写 `dependencies` 和 `node_modules`，不会写 `bundles`，插件不会被加载。** 必须手动补上 `~/.dsh/profiles/desktop/package.json`：

```json
{
  "dependencies": { "dsh-plugin-release": "link:C:/Users/DSL/dsh-plugins/plugins/release" },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-plugin-release"      // ← 少这一行插件就不生效
      ]
    }
  }
}
```

**2. 配插件参数。** 插件自带的 `cordis.patch.yml` 只是默认值（`roots: ['D:\code']`），实际路径要写进 profile 的 `cordis.patch.yml`。注意 patch 语义是**替换整个 config**，不是逐键合并，所以要重述每个键：

```yaml
- id: release
  config:
    roots:
      - 'D:\xls-code'
    scanDepth: 2
    defaultTarget: master
    gitlab:
      baseUrl: 'https://git.example.com'
      tokenEnv: GITLAB_TOKEN      # 令牌走环境变量，别写进文件
    concurrency: 8
    headCacheTtlSec: 300
    mergeStrategy: merge
    deleteSourceBranch: false
```

**3. 生效。** 桌面版会**热加载** profile，改完 `package.json` / `cordis.patch.yml` 等几秒就生效，不用重启应用。验证：

```sh
curl http://127.0.0.1:<桌面版端口>/release-ui          # 200 + HTML
curl http://127.0.0.1:<桌面版端口>/release-ui/api/projects
```

端口在 `Get-NetTCPConnection` 里找 `DeepSeek Harness` 进程的监听端口（当前是 19387）。侧边栏应出现「发版」按钮。

其他 profile（`web` / `headless`）同理，把 `--profile desktop` 换掉即可。CLI 版的 profile 可以用 `dsh --profile web --dump-config | grep release` 校验组合结果；**`desktop` profile 由 Electron 独占，`--dump-config` 会拒绝执行**，只能靠上面的 HTTP 探测。

### 从 tarball 安装

```sh
cd plugins/release && pnpm pack
dsh plugin --profile desktop add ./dsh-plugin-release-0.1.0.tgz
```

`bundles` 那一步同样不能省。

## 开发

```sh
npm install          # 装所有插件的依赖（workspaces）
npm run build        # 构建所有插件
npm run typecheck    # 类型检查所有插件
npm test             # 跑所有插件的测试
```

单个插件：

```sh
npm run build -w dsh-plugin-release
npm test -w dsh-plugin-release
```

## 推送

本机 `github.com` 主站不可达（HTTPS / SSH 全部超时），只有 `api.github.com` 可通，因此**不能用 `git push`**。改用仓库自带的脚本走 Git Data API：

```sh
npm run push            # 等价于 node scripts/push.mjs main
```

脚本会自动判断：远端分支已存在则增量更新（父提交接远端 head，能正确表达文件删除），不存在则首次推送。`owner/repo` 从 `git remote get-url origin` 解析，令牌读 `~/.gh-token` 或 `GH_TOKEN`。

> `origin` 仍然保留着，只是仅作地址记录；直接 `git push` 会卡住。

## 新增插件

1. 在 `plugins/` 下新建目录，例如 `plugins/foo`
2. 写 `package.json`，`name` 用 `dsh-plugin-foo`，并在 `dsh` 字段声明 `bundle.patch`（宿主半）或 `client`（浏览器半）
3. 根目录 `npm install` 会自动纳入 workspace
4. 在 README 的插件列表里补一行

## 插件结构约定

```
plugins/<name>/
├── package.json        # name: dsh-plugin-<name>；dsh.bundle / dsh.client 声明
├── cordis.patch.yml    # 组合包补丁层（插入插件行与默认配置）
├── src/
│   ├── index.ts        # 宿主半：注册工具 / 服务 / Web 路由
│   └── client/         # 浏览器半（可选）：React 页面 + slot 注册
├── scripts/            # 构建脚本（浏览器半用 esbuild 打成 closure factory）
├── lib/                # 构建产物（随仓库分发，不忽略）
└── tests/
```

浏览器半的产物必须是 `window.__ModuleLoader__.load({ id, factory })` 形式，参考 `plugins/release/scripts/build-client.mjs`。

## 许可

MIT
