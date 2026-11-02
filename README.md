# dsh-plugins

DeepSeek Harness（DSH）插件集合。每个插件是 `plugins/` 下的独立包，可单独安装、单独构建。

## 插件列表

| 插件 | 说明 |
|---|---|
| [`release`](plugins/release) | 跨仓库批量发版：预检、创建 MR、合并，带设置页、任务中心、侧边栏面板与对话工具 |

## release 插件能力

浏览器打开 `http://<宿主>/release-ui` 即可用，**全程不经过模型、不消耗 token**：

- **设置**：GitLab 地址、访问令牌、扫描目录（带目录浏览器，可逐级点选）、扫描深度、默认目标分支、并发数、缓存有效期、合并策略。保存后立即生效，不需要重启 dsh。
- **发版参数**：选模式（只建 MR / 在 GitLab 合并 MR / 本地合并后推送）、源分支、目标分支、标题说明、仓库勾选。
- **批量创建分支**：选择项目、输入新分支名，从每个项目 GitLab 当前默认分支创建；已存在的分支跳过，逐项显示结果和链接。
- **模糊分支下拉**：源分支和目标分支输入即匹配，支持键盘/鼠标选择；本地候选先显示，远端异步更新，多个搜索共用缓存。
- **设置入口**：Harness 只注册一个「发版」入口，页面顶部「设置」和页内左侧「发版设置」均可配置 GitLab 地址、账号、令牌和扫描目录。
- **预检**：每次默认核对远端最新提交，逐仓库给出可执行 / 阻塞 / 无变化与原因；存在源分支的优先显示，缺少源分支的放最后。结果带摘要哈希，执行前会再次核对 SHA。下拉缓存不会导致新提交被判为无变化。
- **任务中心**：每次执行都留一条记录（含失败的仓库与原因、MR 链接），可展开看明细，也可一键把参数回填到表单重新预检。
- **对话工具**：同样的能力也注册成了模型可调用的工具，适合「帮我看看这批仓库能不能发」这类对话式操作。

令牌存储：界面保存的令牌写在 `$DSH_HOME/release-plugin/settings.json`（文件权限 0600），接口**只回传末四位**，永不返回明文。不想落盘就把令牌留在环境变量里（默认读 `GITLAB_TOKEN`），设置页留空即可。

## 其他人如何安装

### 1. 准备环境

- 已安装并能正常启动 DeepSeek Harness。
- 有 Node.js/npm，以及 Harness 的 `dsh` 命令。先执行 `node --version`、`npm --version`、`dsh --help` 检查；如果找不到 `dsh`，先按 Harness 的安装说明配置 CLI/PATH。
- 从源码下载时需要 Git；如果拿到别人打包好的 `.tgz`，可以直接跳到下一节的安装命令。

下面以 Windows PowerShell、桌面版 `desktop` profile 为例。使用其他 profile 时替换 `desktop`；`headless` 没有侧边栏和网页。

### 2. 获取插件并安装

**从 npm 安装（推荐，无需下载源码或自己打包）：**

```powershell
dsh plugin --profile desktop add dsh-plugin-release@latest
```

安装完成后，继续下面的启用检查、重启和首次配置。查看 [npm 包页面](https://www.npmjs.com/package/dsh-plugin-release)。

**从 GitHub 下载并打包：**

在自己选择的存放目录执行：

```powershell
git clone https://github.com/guang-gui/dsh-plugin.git
Set-Location ./dsh-plugin/plugins/release
npm pack
dsh plugin --profile desktop add ./dsh-plugin-release-0.1.0.tgz
```

仓库是插件集合，真正的插件在 **`plugins/release`**，不要把仓库根目录直接当作插件安装。仓库已包含 `lib/` 构建产物，普通安装无需安装开发依赖或重新构建。安装包文件名以 `npm pack` 实际输出为准。

也可以在 GitHub 点击 **Code → Download ZIP**，解压后进入 `plugins/release` 执行同样的打包、安装命令。私有仓库需要仓库访问权限；收到 `.tgz` 的人不需要访问源码仓库。

**如果已经拿到 `.tgz` 安装包：**

```powershell
dsh plugin --profile desktop add "C:/Downloads/dsh-plugin-release-0.1.0.tgz"
```

将路径替换成自己的安装包路径。

### 3. 检查插件是否启用

新版 Harness 会自动将声明了 `dsh.bundle` 的插件加入启用列表。安装后检查侧边栏和插件设置；旧版或未自动启用时，再检查该 profile 的 `package.json`：通常是 `~/.dsh/profiles/desktop/package.json`；设置过 `DSH_HOME` 时，在 `$DSH_HOME/profiles/desktop/package.json` 下。以本机 Harness 实际使用的配置目录为准。

确认现有 **`dsh.profile.bundles` 数组**包含以下名称；缺失时才追加一次，不要重复添加：

```json
"dsh-plugin-release"
```

例如，已有的两个 bundle 应保留，修改后该字段可以是：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-plugin-release"
      ]
    }
  }
}
```

以上只展示字段结构，**不要用它覆盖整个文件**：保留已有 `dependencies`、其他 bundle 和配置，保存有效 JSON。建议修改前备份。仅执行 `dsh plugin add` 而没有启用 bundle，插件可能不会加载。

### 4. 重启并完成首次配置

1. 正常退出并重新打开 Harness，侧边栏应出现一个「发版」入口。
2. 打开「发版 → 设置」，添加**自己电脑上**的项目根目录。
3. 填写自己的 GitLab 地址、访问令牌，点击「测试连接」后保存。令牌需有 `api` scope；实际创建分支、MR 或合并还取决于该账号的项目权限与分支保护规则。
4. 返回发版页查看项目列表；现在可以预检发版，或进入「批量创建分支」。

不要使用作者电脑上的目录，也不要复制作者的 GitLab 令牌。无需手工修改插件包内的 `cordis.patch.yml`。保存界面设置即时生效；首次安装或更新插件代码后需要重启 Harness。

**验证安装：**侧边栏只有一个「发版」入口，页内可打开设置、任务中心和批量创建分支。也可用本机实际监听端口访问 `http://127.0.0.1:<端口>/release-ui` 和 `/release-ui/api/projects`。端口以启动日志或本机进程的监听端口为准，不固定为某个值。

### 更新插件

通过 npm 安装的，使用 Harness 插件管理中的更新操作；也可执行 `dsh plugin --profile desktop update dsh-plugin-release`，完成后重启 Harness。已有 bundle 保留一条即可，自己的界面设置无需重新填写。

通过 Git 下载的，在源码目录执行 `git pull`；通过 ZIP 下载的，重新下载并解压最新版。然后进入 `plugins/release` 执行 `npm pack`，再用 `dsh plugin --profile desktop add <新的安装包路径>` 安装并重启 Harness。

### 让 AI 帮你安装（复制下面整段）

把下面内容交给能操作你电脑终端和文件的 AI。可先填写最后三项；不确定的留空，让 AI 检查后询问。

```text
请帮我安装 DeepSeek Harness 的批量发版插件。
仓库：https://github.com/guang-gui/dsh-plugin
插件包名：dsh-plugin-release
首选 npm 安装：dsh plugin --profile <实际profile> add dsh-plugin-release@latest
插件在仓库的 plugins/release 子目录，根目录不是可直接安装的插件包。

请直接完成安装和配置，并遵守以下要求：
1. 先阅读仓库最新 README，检查本机系统、Node/npm、Git、Harness 和 dsh CLI。
   查明实际使用的 profile、DSH_HOME 和配置文件路径，不要假设与作者电脑相同。
   如果缺少 Harness 或找不到 CLI，先说明缺项，按官方说明处理；不要安装同名的无关 npm 包。
2. 优先通过 npm 包名安装，无需下载源码或自己打包。需要源码或安装包方式时才下载仓库：
   将仓库下载到我指定或合适的目录；已有目录先检查，不要覆盖未提交改动。
   在 plugins/release 下执行 npm pack，再使用 dsh plugin --profile <实际profile> add <安装包绝对路径>。
   lib 已随源码提供，普通安装不需要重建；安装包名称以实际输出为准。
3. 新版 Harness 会自动启用 bundle，先检查插件是否已启用。
   仅在未启用时备份并修改 profile/package.json，向 dsh.profile.bundles 数组补充一次
   dsh-plugin-release；保留已有 bundle 和 dependencies，检查 JSON 可解析。
4. 提醒我正常重启 Harness；不要直接终止正在使用的桌面程序。
   进入发版设置，配置我自己的项目目录和 GitLab 地址。令牌由我在界面输入，
   或沿用我明确指定的环境变量；不要索要聊天中的明文令牌，不要读取 Git 保存的密码代登录。
5. 验证插件依赖和 bundle 配置。重启后验证实际宿主的发版入口、/release-ui 和
   /release-ui/api/projects；端口从本机日志或进程监听获取，不要固定端口。
   如果尚未重启或无法访问实际宿主，明确列出待验证项，不要把静态检查当作运行成功。
6. 安装验证只做读取，不要创建真实分支、创建 MR、合并或推送业务项目代码。
   最后告诉我安装目录、profile、改动的文件、验证结果和后续使用入口，清理临时辅助文件。

我的安装目录：（可选）
我的 Harness profile：（可选，桌面版通常为 desktop）
我的本地项目根目录与 GitLab 地址：（可选，不要填写令牌）
```

### 开发时从本地目录安装

需要实时使用本地构建产物时，可以将安装包路径换成插件子目录的绝对路径：

```powershell
dsh plugin --profile desktop add "link:C:/your-path/dsh-plugin/plugins/release"
```

启用 bundle、首次配置与重启步骤仍然相同。

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
