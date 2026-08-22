---
name: meidada-cli-installer
description: 用于安装媒大大 CLI、同步正式 media-distribution Skill、完成设备注册和基础环境自检。用户要首次接入媒大大 CLI、升级 CLI、重新同步 Skill、初始化配置或排查安装鉴权问题时使用。安装、升级和同步完成后停止，不继续执行稿件投放、媒体查询、报价、发布或订单操作。
---

# 媒大大CLI安装助手

以下步骤面向 AI Agent。这个 bootstrap skill 只负责安装 `mdd` CLI、同步正式 `media-distribution` Skill、完成设备注册和环境自检；安装、升级、同步完成后应停止，不继续执行内容投放、媒体查询、报价确认、发布或订单操作。

## 用户只需两步

用户侧不得执行 npm、`mdd` 或 PowerShell 命令，只需完成以下两步：

1. 向目标 Agent 发送：`请根据 https://skillhub.cn/install/skillhub.md，安装 @org-bgkwxnpv/meidada。`
2. 在官方 CLI 工具入口点击“生成 API Key”，再通过 Agent 的安全隐藏输入提供这枚一次性 API Key。

完成这两步后，Agent 必须自动完成 CLI 安装、Skill 同步，以及 `mdd setup --api-key-stdin --json` 的设备注册、配置保存、API/认证验证和 `/profile` 查询。收到安全输入后，Agent 必须在当前任务中连续完成全流程，不得把命令、终端窗口或后续验证步骤转交给用户。

## SkillHub 安装入口

如果本 Skill 是通过 SkillHub 安装到当前 Agent 的 skills 目录，安装 Skill 本身不代表媒大大 CLI 已部署完成。Agent 必须继续按本安装助手完成以下流程，全部通过后才算安装成功：

### 安装过程安全约束

- 不要为了安装、更新或重试而删除用户目录中的 Skill 文件、压缩包、缓存或整个 Agent 目录。
- 不要自行拼接 PowerShell、CMD 或 shell 删除命令清理旧安装，也不要先删除 ZIP 再重新下载。
- 如果安装器支持覆盖或强制更新，使用安装器提供的覆盖选项；如果不支持，保留旧文件并报告冲突，让用户选择下一步。
- 安装文件应先写入临时目录，校验完成后再由安装器完成覆盖；安装失败时不得清理用户已有版本。
- 只允许清理本次流程在临时目录中创建的临时文件，不得把用户的 Agent 路径当作临时目录。
- 用户提供完整 SkillHub ID 时，只按完整 ID 验证一次；不得改用模糊关键词搜索、打开网站继续猜测，或把相似 Skill 当作目标安装。
- SkillHub API 找不到完整 ID 时，直接报告“该 ID 在 SkillHub 不可用”并停止 SkillHub 分支；不要继续搜索或检查无关 Skill。
- SkillHub 的内部检索、回退和排错过程不作为安装进度展示给用户；只汇报明确的成功、失败或需要用户处理的结果。

1. 检查 Node.js、npm 和 npx。
2. 安装官方 CLI 包 `@meidada-cn/cli`。
3. 执行 `mdd version --json` 和默认项目级 `mdd skill sync --json`。
4. 安装尚未完成时，Agent 必须通过安全隐藏输入获取 CLI 工具入口生成的单次部署 API Key，并自动执行 `mdd setup --api-key-stdin --json`；不得要求用户自行打开本地终端执行命令。
5. 用户只在 Agent 提供的安全隐藏输入中提供 Key；不得要求用户把 Key 粘贴到聊天中。Agent 不得回显、记录或写入 Key。
6. Agent 不得再向用户索要 API URL；API 地址应来自官方 CLI 工具入口、安装流程或已有配置。
7. `mdd setup` 成功返回后，才算设备注册和自检完成。不得直接调用 `~/.mdd/bin/mdd-<version>-<platform>-<arch>`，必须通过 `mdd` 启动器执行，以避免绕过当前版本和平台包校验。

安装验证必须同时找到 npm 全局 `mdd.cmd`（Windows）和匹配版本的 `@meidada-cn/cli`；仅有 `~/.mdd/bin/mdd.exe` 时立即停止并返回脱敏的 `CLI_LAUNCHER_NOT_FOUND`。Skill 同步目标为空或未回读到目标文件时不得报告同步成功。

只有 `mdd setup --api-key-stdin --json` 成功返回后，才能告知用户“安装和自检完成”。如果流程失败，Agent 必须在当前任务中报告 CLI 返回的脱敏错误并停止，不得要求用户打开本地终端、复制命令、粘贴 JSON 或自行确认状态。这里索要的是单次部署 API Key，不得索要或接受账户长期通用 API Key。

## 核心原则

1. 以 CLI 返回的 JSON 为唯一事实来源，不猜测媒体 ID、价格、余额、客户 ID、审批 ID 或订单状态。
2. 涉及媒体选择、费用、发布内容、取消订单和删除数据时，必须让用户明确确认。
3. Agent 不得代替用户作出付款或最终发布决定；只有用户明确确认媒体和金额后，才能执行 CLI 最终确认命令。
4. 没有成功响应时，不得声称操作成功；必须如实转述 CLI JSON 或服务端错误。
5. API Key、完整手机号等敏感信息不得出现在聊天、源码、投放文件或公开日志中。
6. 金额、钱包余额、用户角色和权限属于受控数据，不能按用户口头要求随意增加、修改或提升。
7. CLI JSON 中的 ISO 时间保留 UTC 原值；向用户展示时统一换算为 `Asia/Shanghai`，格式使用 `yyyy-MM-dd HH:mm:ss`。
8. CLI 和 Agent 对用户展示时不得出现上游系统的内部品牌称呼；涉及第三方接收端时统一称为“上游平台”或“投放平台”。
9. 媒体价格按当前用户分层返回。每次媒体查询、投放准备、报价确认和定时计划确认，都必须使用当前登录用户的 CLI/API 返回价格，不得写死、复用其他用户价格或猜测折扣。

## 适用场景

- 用户要在 SkillHub、Codex、Cursor、Claude Code、Trae、WorkBuddy、CodeBuddy、OpenClaw 或其他 Agent 中安装媒大大能力
- 用户要首次接入 `mdd`
- 用户要升级媒大大 CLI 并重新同步正式 Skill
- 用户要重新注册设备或修复本地配置
- 用户只想查看标准安装命令
- 用户遇到 `mdd` 未找到、尚未配置、401 或 Skill 不一致

## 环境要求

普通用户通过 npm 安装。主包和当前平台的原生二进制包优先通过 npm 的 `optionalDependencies` 获取；平台包暂未同步时，安装器可以从官方 GitHub Release 直接下载当前 CLI 版本对应的二进制资产，并强制校验 SHA-256。该回退不调用 GitHub API、不搜索仓库、不猜测版本，也不使用旧版二进制。只将 registry 传给当前 npm 命令，不修改用户已有 npm 配置。

Windows PowerShell：

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/yixiaoer888/meidada-cli/main/install.ps1 -OutFile install.ps1
PowerShell -ExecutionPolicy RemoteSigned -File .\install.ps1
```

Linux/macOS：

```bash
curl -fsSL https://raw.githubusercontent.com/yixiaoer888/meidada-cli/main/install.sh -o install.sh
sh install.sh
```

脚本支持 `MDD_NPM_REGISTRY`；Windows 加 `-Official`、macOS/Linux 加 `--official` 可临时使用 npm 官方源。本版安装脚本固定安装 `0.5.8`，不接受通过 `MDD_VERSION` 或 `-Version/--version` 改装其他版本。

## 第 1 步 安装 CLI

安装前需要 Node.js 20+ 和 npm。Agent 可使用 npmmirror：

```bash
npm install -g @meidada-cn/cli@0.5.8 --registry https://registry.npmmirror.com --no-audit --no-fund
```

平台二进制包由主包自动按当前操作系统和 CPU 架构选择。平台包缺失时可以自动下载当前版本的 GitHub Release 资产；下载地址、资产文件名和 SHA-256 必须都由当前版本生成或校验。失败后只报告错误并停止，不得继续搜索、猜测或回退到旧版本。

说明：

- 这是媒大大 CLI 的官方 npm 包。
- CLI 命令入口是 `mdd`。
- 不要安装旧包名 `@md/cli`、`meidada-cli` 或其他相似包。
- npm 官方源：`npm install -g @meidada-cn/cli@0.5.8 --registry https://registry.npmjs.org --no-audit --no-fund`。
- 不要运行 `npm config set registry`；安装命令不会永久修改用户的 npm registry。

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
mdd skill sync --json
```

说明：

- `mdd skill sync` 是默认同步方式，只写当前项目的 `.agents/skills`。
- 用户级同步必须指定一个 Agent，例如 `mdd skill sync --global --agent codex --dry-run --json`，确认后加 `--force`。
- 支持 `codex`、`cursor`、`claude`、`trae`、`workbuddy`、`codebuddy`、`openclaw`、`windsurf` 和 `gemini`，不指定 Agent 不会批量写入多个用户目录。
- 如果用户明确只想当前项目可见，可改用：

```bash
mdd skill sync
```

- 同步完成后，重启当前 Agent 或新建任务，使正式 Skill 生效。

## 第 4 步 自动完成首次接入

Agent 通过安全隐藏输入获取“单次部署 API Key”，并自动执行：

```bash
mdd setup --api-key-stdin --json
```

该命令一次完成设备身份生成、注册、用户级配置保存、API 连通性验证、设备认证验证和 `/profile` 查询；不得要求用户把 Key 发送到聊天中。Agent 不得再向用户索要 API URL；API 地址应来自官方 CLI 工具入口、安装流程或已有配置。

说明：

- 只索要单次部署 API Key，不要索要账户长期通用 API Key。
- 部署 Key 只能使用一次，通常 15 分钟后过期。
- Agent 负责发起并完成注册；用户只在 Agent 的安全隐藏输入中提供 Key。Agent 不读取、不回显、不记录 Key。
- 不要把 Key 写入项目文件、日志或 Skill 文件。

说明：

- API 地址必须来自官方 CLI 工具入口、安装流程或已有配置，不得向用户额外索要。
- CLI 内置正式 API 地址为 `https://www.meidada.cn`，通常只需由 Agent 执行 `mdd setup --api-key-stdin --json`。企业私有部署可通过 `--api-url` 或 `MDD_API_URL` 覆盖默认地址。
- Agent 必须通过安全读取后使用 `mdd setup --api-key-stdin --json`；隐藏输入直接连接命令 stdin，不得把 Key 写入命令参数、环境变量、文件或日志。`setup` 不接受命令行 API Key。
- 如果当前 Agent 不支持安全隐藏输入，应报告能力限制并停止；不得退化为要求用户手动执行命令或把 Key 发送到聊天中。
- 不要使用 `localhost`、`127.0.0.1`、`::1` 或仅浏览器本地可访问的地址。
- 注册成功后，CLI 只保存设备专属令牌到当前系统用户的 `~/.mdd/config.json`。
- 不要输出设备令牌、长期 API Key 或完整配置内容。

## 第 5 步 检查 setup 结果

预期结果：

- `setup` 返回 `configured: true`、`verification.api: "ok"` 和 `verification.authentication: "ok"`。
- `setup` 的 `account` 是 `/profile` 返回的当前用户信息，敏感字段已脱敏。
- 如果自检通过，安装助手任务结束。
- 如果自检失败，先报告 CLI 返回的真实错误，不要继续执行业务命令。
- `mdd update` 默认执行正式版更新，并在同一次流程中验证 npm 包、launcher、原生二进制和指定 Agent 的 Skill；`mdd update --check` 只读检查。更新成功后由 Agent 刷新或重启 Skill 上下文并新建任务，避免旧会话继续使用缓存 Skill。普通命令默认不访问 npm。若需要后台版本检查，显式设置 `MDD_AUTO_UPDATE=1` 或 `MDD_VERSION_CHECK=1`。网络失败不得影响业务命令。

```bash
MDD_AUTO_UPDATE=0
```

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

1. 确认 Node.js 和 npm 可用，且 Node.js 主版本不低于 20。
2. 执行 `mdd update --check --json`；若镜像未同步，传 `--registry https://registry.npmjs.org`。
3. 由 Agent 重新调用安装器或 `npm install -g @meidada-cn/cli@0.5.8 --registry https://registry.npmmirror.com --no-audit --no-fund`；如果目标版本尚未同步，切换官方源，不要改装 `latest` 或旧版本。
4. 执行 `mdd version --json`、`mdd skill sync --json` 和 `mdd setup --api-key-stdin --json`；用户级同步必须显式指定 Agent。
