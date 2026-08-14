---
name: meidada-cli-installer
description: 用于安装媒大大 CLI、同步正式 media-distribution Skill、完成设备注册和基础环境自检。用户要首次接入媒大大 CLI、升级 CLI、重新同步 Skill、初始化配置或排查安装鉴权问题时使用。安装、升级和同步完成后停止，不继续执行稿件投放、媒体查询、报价、发布或订单操作。
---

# 媒大大CLI安装助手

以下步骤面向 AI Agent。这个 bootstrap skill 只负责安装 `mdd` CLI、同步正式 `media-distribution` Skill、完成设备注册和环境自检；安装、升级、同步完成后应停止，不继续执行内容投放、媒体查询、报价确认、发布或订单操作。

## 适用场景

- 用户要在 SkillHub、Codex、Cursor、Claude Code、Trae 或其他 Agent 中安装媒大大能力
- 用户要首次接入 `mdd`
- 用户要升级媒大大 CLI 并重新同步正式 Skill
- 用户要重新注册设备或修复本地配置
- 用户只想查看标准安装命令
- 用户遇到 `mdd` 未找到、尚未配置、401 或 Skill 不一致

## 环境要求

开始安装前，确认环境中已安装：

- Node.js 20 或更高版本
- npm
- npx

默认优先使用 npm 安装，不引导普通用户从源码构建，也不要安装名称相似的第三方包。

检查命令：

```bash
node --version
npm --version
npx --version
```

如果 Node.js 或 npm 不可用，且用户已经明确要求安装 CLI：

- Windows 使用可信的软件包管理器安装 Node.js LTS：

```powershell
winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
```

- macOS 或 Linux 使用当前系统已有且可信的软件包管理器安装 Node.js LTS。
- 安装完成后重启终端，再重新执行版本检查。
- 安装失败、权限不足或被企业策略拦截时，停止并报告错误，不要改用非官方来源或反复重试。

## 第 1 步 安装 CLI

执行：

```bash
npm install -g @meidada-cn/cli
```

说明：

- 这是媒大大 CLI 的官方 npm 包。
- CLI 命令入口是 `mdd`。
- 不要安装旧包名 `@md/cli`、`meidada-cli` 或其他相似包。
- 如果用户环境不允许全局安装，先说明全局安装是标准方式，再根据用户明确要求处理替代方案。

## 第 2 步 验证 CLI

执行：

```bash
mdd version --json
```

预期结果：

- 命令成功返回版本信息。
- 如果提示找不到 `mdd`，先检查 npm 全局安装是否成功和当前进程的 `PATH` 是否已刷新。
- 启动新的终端进程后再次执行，不要重复安装相同包。

## 第 3 步 同步正式 Skill

执行：

```bash
mdd skill sync --global
```

说明：

- `mdd skill sync --global` 是默认同步方式。
- 它会把内置的正式 `media-distribution` Skill 同步到支持的 Agent 用户级 Skill 目录。
- 如果用户明确只想当前项目可见，可改用：

```bash
mdd skill sync
```

- 同步完成后，重启当前 Agent 或新建任务，使正式 Skill 生效。

## 第 4 步 生成设备身份

执行：

```bash
mdd device prepare --json
```

命令成功后，向用户索要媒大大 CLI 部署页生成的“单次部署 API Key”，然后停止等待。

说明：

- 只索要单次部署 API Key，不要索要账户长期通用 API Key。
- 部署 Key 只能使用一次，通常 15 分钟后过期。
- 用户发送 Key 后，不要在回复中回显。
- 不要把 Key 写入项目文件、日志或 Skill 文件。

## 第 5 步 初始化配置

收到用户提供的单次部署 API Key 后，执行：

```bash
mdd config init --api-url "https://<official-console-host>" --api-key "<one-time-deployment-api-key>"
```

说明：

- `<official-console-host>` 必须来自用户的官方部署页，并且是 Agent 可访问的公网 HTTPS 地址。
- 不要使用 `localhost`、`127.0.0.1`、`::1` 或仅浏览器本地可访问的地址。
- 注册成功后，CLI 只保存设备专属令牌到当前系统用户的 `~/.mdd/config.json`。
- 不要输出设备令牌、长期 API Key 或完整配置内容。

## 第 6 步 环境自检

执行：

```bash
mdd doctor --json
mdd auth whoami --json
```

预期结果：

- `doctor` 返回 API 和认证正常。
- `auth whoami` 能返回当前账号。
- 如果自检通过，安装助手任务结束。
- 如果自检失败，先报告 CLI 返回的真实错误，不要继续执行业务命令。

## 升级流程

检查更新：

```bash
mdd update --json
```

如果返回 `updateAvailable: true`，向用户展示当前版本、目标版本和安装目录，只询问一次是否升级。用户明确同意后执行：

```bash
mdd update --yes --json
```

`mdd update --yes` 会完成正式版升级、内置 Skill 同步和关键命令验证。升级完成后提示用户重启当前 Agent 并新建任务，不要继续使用可能缓存旧 Skill 的会话。

也可以直接重新安装最新版：

```bash
npm install -g @meidada-cn/cli@latest
mdd version --json
mdd skill sync --global
mdd doctor --json
```

正式版 CLI 默认会定期检查 npm `latest` 并自动更新。用户明确不希望自动更新时，可设置：

```bash
MDD_AUTO_UPDATE=0
```

## 旧版迁移流程

如果用户正在使用 `@md/cli`、`meidada-cli` 或网站 tarball：

1. 说明将迁移到官方包 `@meidada-cn/cli`。
2. 只询问一次是否继续。
3. 用户确认后执行：

```bash
npm install -g @meidada-cn/cli
mdd skill sync --global
mdd doctor --json
mdd auth whoami --json
```

迁移成功后，后续统一使用 `mdd update --yes --json`。不要继续创建临时脚本，也不要让用户手动修改 PATH。

## 安装后进入正式能力

安装、注册、同步和自检完成后，引导用户切换到正式 Skill：

- 正式 Skill 名称：`media-distribution`
- 正式 Skill 文件：`skills/media-distribution/SKILL.md`
- 正式 CLI 入口：`mdd`

典型下一步命令：

```bash
mdd config get --json
mdd auth status --json
mdd wallet balance --json
mdd draft list --json
```

只有用户明确提出业务需求后，才切换到 `media-distribution` 正式 Skill。不要在本安装助手中继续执行媒体选择、报价、投放确认、订单取消或其他业务操作。

## 故障排查

如果安装失败，按以下顺序排查：

1. 确认 Node.js、npm、npx 可用，且 Node.js 主版本不低于 20。
2. 重新执行 `npm install -g @meidada-cn/cli`。
3. 执行 `mdd version --json`。
4. 执行 `mdd skill sync --global`。
5. 执行 `mdd doctor --json`。

### `mdd` 命令不存在

确认 npm 安装成功，刷新当前终端的 `PATH`，启动新的终端进程后再次执行 `mdd version --json`。不要安装同名或相似的第三方包。

### CLI 尚未配置

先执行：

```bash
mdd device prepare --json
```

然后等待用户提供单次部署 API Key，再执行 `mdd config init`。不要直接执行稿件、媒体或投放命令。

### 返回 401

立即停止所有业务操作，不要反复重试。让用户重新打开官方 CLI 部署页生成新的单次部署 API Key，并重新执行设备注册流程。已注册设备则让用户在设备列表确认是否已被停用。

### Skill 不一致

优先执行：

```bash
mdd skill sync --global
mdd doctor --json
```

完成后重启 Agent 或新建任务。

### 本地代理连接失败

如果错误包含 `ECONNREFUSED 127.0.0.1:<port>`，并提到 `HTTP_PROXY`、`HTTPS_PROXY` 或 `ALL_PROXY`，先确认当前 Agent 环境是否真的需要该代理。

PowerShell 中不需要代理时执行：

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

不要反复重试已经停止的本地代理。
