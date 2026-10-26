# dsh-plugin-release

把「跨仓库批量发版」做成 DeepSeek Harness 插件：预检哪些仓库能合、创建 MR、合并。有三种用法，共用同一套服务：

- **侧边栏面板**（推荐）：DSH 侧边栏点「发版」，整页操作，**不经过模型、不消耗 token**
- **独立网页**：`http://127.0.0.1:3080/release-ui`，同一个页面的无壳版本
- **对话工具**：在对话里说需求，由模型调用 `release_*` 工具

这是 `personal-assistant` 里那套 Electron 发版工具的 **Harness 版本**——核心逻辑（Git 操作、GitLab REST、冲突预演、计划摘要、分支 SHA 缓存）原样搬过来。

## 界面

### 侧边栏面板（原生）

插件带浏览器半（`lib/client.js`），安装后在侧边栏出现「发版」入口，点击打开整页：

- 组件通过 `sidebar.panellist` + `main` 两个 slot 注册，面板 id 与 main 的 key 都是 `release`
- 样式使用 DSH 的设计变量（`--dsw-alias-*`），自动跟随浅色/深色主题
- 页面数据来自宿主接口 `/release-ui/api/*`，与对话工具调用同一份 `ReleaseService`

### 独立网页（主力界面）

```
http://127.0.0.1:<宿主端口>/release-ui
```

- 单文件 HTML（内嵌样式与脚本），不依赖前端构建
- 命名路由优先于静态资源鉴权，页面不需要 DSH token，但只接受本机（loopback）访问
- 自带**设置页**与**任务中心**，日常发版完全不用碰 YAML
- headless 模式下没有 web 服务，页面与面板都不可用，工具照常工作

端口怎么找：桌面版看 `Get-NetTCPConnection` 里 `DeepSeek Harness` 进程的监听端口；CLI 版启动时会直接打印 URL。

### 设置页

| 设置项 | 说明 |
|---|---|
| GitLab 地址 | 留空则只能本地合并，不能建 MR |
| 令牌 | 留空 = 沿用已保存的 / 环境变量；接口只回传末四位 |
| 扫描目录 | 可逐级浏览点选，标出哪些是 Git 仓库、哪些已选 |
| 扫描深度 / 默认目标分支 / 并发数 / 缓存有效期 / 合并策略 / 删除源分支 | 同 YAML 里的字段 |

保存后立刻 `service.reconfigure()` 生效，扫描参数变了会自动重扫；**不需要重启 dsh**。
设置落在 `$DSH_HOME/release-plugin/settings.json`，优先级高于 `cordis.patch.yml`。

### 任务中心

每次「确认执行」都会留一条记录（保留最近 50 条，`tasks.json`）：

- 状态汇总：全部成功 / 部分失败 / 失败
- 逐仓库明细：成功、无变化、失败原因、MR 链接
- 「用这些参数重新预检」一键回填

预检不记录——它是只读的，数量多且没有留存价值。

### 能力对照

| 页面操作 | 接口 | 工具 |
|---|---|---|
| 读/存设置 | `GET` `POST /release-ui/api/settings` | — |
| 测试 GitLab 连接 | `POST /release-ui/api/settings/test` | — |
| 浏览目录 | `GET /release-ui/api/settings/dirs?path=` | — |
| 加载/重新扫描仓库 | `GET /release-ui/api/projects` | `release_projects` |
| 搜分支 | `GET /release-ui/api/branches` | `release_branches` |
| 预检 | `POST /release-ui/api/check` | `release_check` |
| 确认执行 | `POST /release-ui/api/apply` | `release_apply` |
| MR 状态 | `GET /release-ui/api/mrs` | `release_mrs` |
| 执行记录 | `GET /release-ui/api/tasks` | — |

## 它解决什么问题

一次发版往往要动十几个仓库：同一个 `release/20261022` 分支，要合到各自的 `master`。手工点一遍要半小时，还容易漏。

插件提供的能力：

- **预检**：每个仓库比一次源分支和目标分支，算出待合并提交数、有没有冲突、有没有已存在的 MR、有没有 API 权限，并把不能执行的原因直接说出来
- **执行**：按预检结果建 MR 或合并，执行前重新核对远端 SHA，分支变了就要求重新预检
- **安全边界**：预检只读；执行必须带上预检产出的 `planId` + `planHash`，计划 10 分钟过期

## 安装

### 从本地目录（开发时用）

```sh
dsh plugin --profile web add ./dsh-plugin
dsh --profile web --dump-config   # 应该能看到 "# == dsh-plugin-release" 这一层
dsh --profile web
```

### 从 tarball

```sh
pnpm pack            # 在 dsh-plugin 目录里执行，产出 dsh-plugin-release-0.1.0.tgz
dsh plugin --profile web add ./dsh-plugin-release-0.1.0.tgz
```

### 从 GitHub

```sh
dsh plugin --profile web add github:<你>/personal-assistant#<commit>
```

`lib/` 已经随仓库提交，所以 git 安装不需要跑构建脚本。想自己改源码再构建：

```sh
cd dsh-plugin
npm run build        # tsc -> lib/
```

## 配置

插件配置在 `cordis.patch.yml` 里给了一份默认值。要改的话**不要改包里的文件**，改你自己 profile 的 `cordis.patch.yml`（`$DSH_HOME/profiles/<name>/cordis.patch.yml`）：

```yaml
- id: release
  config:
    roots:
      - 'D:\code'
    scanDepth: 2
    defaultTarget: master
    gitlab:
      baseUrl: 'https://git.example.com'
      tokenEnv: GITLAB_TOKEN
    concurrency: 8
    headCacheTtlSec: 300
```

注意 patch 是**替换整行 config**，不是逐键合并，所以要写全你要用的键。

| 键 | 默认 | 说明 |
|---|---|---|
| `roots` | `[]` | 本地仓库根目录，递归扫描识别 Git 仓库与 worktree |
| `scanDepth` | `3` | 扫描深度 |
| `defaultTarget` | `master` | 默认目标分支 |
| `gitlab.baseUrl` | `''` | 实例地址，例如 `https://git.example.com` |
| `gitlab.token` | `''` | 个人访问令牌（scope `api`）。**不建议写这里** |
| `gitlab.tokenEnv` | `GITLAB_TOKEN` | 从哪个环境变量读令牌 |
| `projects` | `[]` | 显式补充扫描不到的项目，或覆盖默认目标分支/启用状态 |
| `concurrency` | `8` | 预检并发；自建 GitLab 上 8 是拐点，再高反而更慢 |
| `headCacheTtlSec` | `300` | 分支 SHA 缓存有效期，0 表示每次重新问远端 |
| `mergeStrategy` | `merge` | `merge` / `ff-only` / `no-ff`，只影响 Git 直接合并 |
| `deleteSourceBranch` | `false` | 合并后是否删源分支 |
| `dataDir` | `$DSH_HOME/release-plugin` | 缓存、计划、bare 仓库的存放位置 |

### 令牌

用**个人访问令牌**（用户设置 → Access Tokens，scope 勾 `api`），不要用项目访问令牌。

项目级令牌在 GitLab 里会变成一个 `project_<id>_bot_*` 机器人账号，只能看见被授权的那一个项目，其他项目一律 404 —— 现象就是「预检一片绿灯，执行时全部失败」。插件会把这种情况翻译成：

```
无 group/subgroup/api-service 的访问权限（404）
当前令牌是 user-service 的项目级令牌，只能操作该项目；跨项目建 MR 请改用个人访问令牌（scope: api）
```

令牌只从环境变量读，不要写进 YAML：

```sh
export GITLAB_TOKEN=glpat-xxxx        # Linux/macOS
setx GITLAB_TOKEN "glpat-xxxx"        # Windows，重开终端生效
```

## 五个工具

| 工具 | 作用 | 写远端 |
|---|---|---|
| `release_projects` | 列出仓库（id、GitLab 路径、默认目标分支、启用状态） | 否 |
| `release_branches` | 跨仓库按关键词搜分支，确认分支到底在哪些仓库里 | 否 |
| `release_check` | 预检：待合并提交数、冲突、已有 MR、API 权限、阻塞原因 | 否 |
| `release_apply` | 按 `planId` + `planHash` 执行 | **是** |
| `release_mrs` | 重新查询 MR 的可合并状态 | 否 |

### 典型对话

```
你：看看 PROJ-123 这条分支在哪些仓库里
模型：release_branches { keyword: "PROJ-123" }
     → feature/PROJ-123_账单模块调整 → api-service（1 个仓库）

你：在 api-service 上建个 MR，标题写 feat: 账单模块调整
模型：release_check { mode: "create-mr", sourceBranch: "...", projects: ["api-service"],
                     title: "feat: 账单模块调整" }
     → 可执行 1，待合并 3 个提交
     → planId=plan_xxx, planHash=abc123

你：确认
模型：release_apply { planId: "plan_xxx", planHash: "abc123" }
     → ✓ api-service：已创建 MR !42
```

三种模式：

| 模式 | 做什么 | 需要 GitLab 令牌 |
|---|---|---|
| `create-mr` | 只创建 MR，不拉代码、不动目标分支，合并留给网页 | 是 |
| `merge-mr` | 在 GitLab 上合并 MR | 是 |
| `merge-git` | 本地合并后直接推送目标分支（走 bare 缓存 + 临时工作树，不碰你的工作区） | 否 |

## 性能

21 个仓库，自建 GitLab：

| 场景 | 耗时 |
|---|---|
| 首次扫描目录 | 0.9 秒（读 `.git/config`，不是逐个子进程） |
| 首次预检（21 个仓库都问一次远端） | 33 秒 |
| 5 分钟内重复预检（分支 SHA 缓存命中） | 5.8 秒 |
| 只预检 1 个仓库 | 7.5 秒 |

预检的瓶颈是 `ls-remote`：自建 GitLab 单次 4–8 秒，且没有批量接口（GraphQL 该版本不支持按分支查询）。所以：

- **先用 `release_branches` 找到分支在哪几个仓库**，再用 `projects` 只预检这几个 —— 这是最快的路径
- 分支 SHA 落盘缓存，重启后仍然有效（`headCacheTtlSec` 控制有效期）
- `create-mr` 完全不下载代码，也不做冲突预演

## 与旧版 Electron 应用的关系

| | Electron 应用 | 本插件 |
|---|---|---|
| 界面 | 自绘 Vue 页面 | Harness 对话 |
| 状态存储 | SQLite | JSON（`dataDir`） |
| 触发方式 | 点按钮 | 模型调工具 |
| 核心逻辑 | `modules/release/src` | `src/`（同源移植） |

两边可以并存：Electron 版适合看表格、批量勾选；插件版适合在写代码的过程中顺手发版。

## 开发

```sh
npm run typecheck    # tsc --noEmit
npm test             # vitest（领域规则单测）
npm run build        # 产出 lib/
```

`src/dsh.d.ts` 是本地类型声明：宿主提供的 `@deepseek-ai/*` 包在这里不安装，用最小声明保证能编译；运行时用的是 dsh 安装里的那一份。

目录：

```
src/
├── index.ts      插件入口：Config schema + apply()
├── tools.ts      五个工具的注册与渲染
├── service.ts    预检 / 执行 / MR 状态
├── domain.ts     纯函数：计划摘要、分支分类、合并提交信息
├── git.ts        Git 命令封装（参数数组，不拼 shell）
├── gitlab.ts     GitLab REST 适配器
├── scanner.ts    仓库发现（读 .git/config，worktree 回落到 git）
├── head-cache.ts 分支 SHA 持久缓存
├── store.ts      项目与计划的 JSON 持久化
├── process.ts    子进程（超时/取消杀进程树）
└── http.ts       极简 HTTP JSON 客户端
```
