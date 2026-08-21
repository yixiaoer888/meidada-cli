---
name: meidada-cli-installer
description: 用于安装媒大大 CLI、同步正式 media-distribution Skill、完成设备注册和基础环境自检。用户要首次接入媒大大 CLI、升级 CLI、重新同步 Skill、初始化配置或排查安装鉴权问题时使用。安装、升级和同步完成后停止，不继续执行稿件投放、媒体查询、报价、发布或订单操作。
---

# 媒大大CLI安装助手

以下步骤面向 AI Agent。这个 bootstrap skill 只负责安装 `mdd` CLI、同步正式 `media-distribution` Skill、完成设备注册和环境自检；安装、升级、同步完成后应停止，不继续执行内容投放、媒体查询、报价确认、发布或订单操作。

## SkillHub 安装入口

如果本 Skill 是通过 SkillHub 安装到当前 Agent 的 skills 目录，安装 Skill 本身不代表媒大大 CLI 已部署完成。Agent 必须继续按本安装助手完成以下流程，全部通过后才算安装成功：

1. 检查 Node.js、npm 和 npx。
2. 安装官方 CLI 包 `@meidada-cn/cli`。
3. 执行 `mdd version --json`、默认项目级 `mdd skill sync --json` 和 `mdd device prepare --json`。
4. 安装尚未完成；请用户在自己的本地终端执行 `mdd config init`，在隐藏提示中输入 CLI 工具入口生成的单次部署 API Key。
5. 不要要求用户把 Key 粘贴到聊天中；Agent 不得读取、回显、记录或写入 Key。
6. Agent 不得再向用户索要 API URL；API 地址应来自官方 CLI 工具入口、安装流程或已有配置。
7. 用户完成本地注册后，再执行 `mdd doctor --json` 和 `mdd auth whoami --json`。

只有 `doctor` 和 `auth whoami` 都成功返回后，才能告知用户安装完成。这里索要的是单次部署 API Key，不得索要或接受账户长期通用 API Key。

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

普通用户通过 npm 安装。主包和当前平台的原生二进制包通过 npm 的 `optionalDependencies` 获取，脚本默认使用国内 npmmirror，不需要访问 GitHub；只将 registry 传给当前 npm 命令，不修改用户已有 npm 配置。npmmirror 可能比 npm 官方源有短暂同步延迟；平台包或新版本暂未同步时切换官方源。

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

脚本支持 `MDD_VERSION` 和 `MDD_NPM_REGISTRY`。Windows 加 `-Official`、macOS/Linux 加 `--official` 可临时使用 npm 官方源。

## 第 1 步 安装 CLI

安装前需要 Node.js 20+ 和 npm。手动使用 npmmirror：

```bash
npm install -g @meidada-cn/cli@0.5.3 --registry https://registry.npmmirror.com --no-audit --no-fund
```

平台二进制包由主包自动按当前操作系统和 CPU 架构选择。GitHub Release 仅作为平台包缺失时的兼容回退。

说明：

- 这是媒大大 CLI 的官方 npm 包。
- CLI 命令入口是 `mdd`。
- 不要安装旧包名 `@md/cli`、`meidada-cli` 或其他相似包。
- npm 官方源：`npm install -g @meidada-cn/cli@0.5.3 --registry https://registry.npmjs.org --no-audit --no-fund`。
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

## 第 4 步 生成设备身份

执行：

```bash
mdd device prepare --json
```

命令成功后，安装尚未完成。请用户在自己的本地终端执行 `mdd config init`，在隐藏提示中输入 CLI 工具入口生成的“单次部署 API Key”；不要要求用户把 Key 发送到聊天中。Agent 不得再向用户索要 API URL；API 地址应来自官方 CLI 工具入口、安装流程或已有配置。

说明：

- 只索要单次部署 API Key，不要索要账户长期通用 API Key。
- 部署 Key 只能使用一次，通常 15 分钟后过期。
- Agent 不读取、不回显、不记录 Key；注册由用户在本地隐藏提示中完成。
- 不要把 Key 写入项目文件、日志或 Skill 文件。

## 第 5 步 初始化配置

用户在本地完成单次部署 API Key 输入后，执行：

```bash
mdd config init
```

说明：

- API 地址必须来自官方 CLI 工具入口、安装流程或已有配置，不得向用户额外索要。
- CLI 内置正式 API 地址为 `https://www.meidada.cn`，通常只需执行 `mdd config init`。企业私有部署可通过 `--api-url` 或 `MDD_API_URL` 覆盖默认地址。
- Agent 非交互安装应通过安全读取后使用 `mdd config init --api-key-stdin`；`--api-key` 仅为兼容保留，不推荐使用。
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
- `mdd update` 默认执行正式版更新，`mdd update --check` 只读检查；普通命令默认不访问 npm。若需要后台版本检查，显式设置 `MDD_AUTO_UPDATE=1` 或 `MDD_VERSION_CHECK=1`。网络失败不得影响业务命令。

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
3. 重新执行脚本或 `npm install -g @meidada-cn/cli@0.5.3 --registry https://registry.npmmirror.com --no-audit --no-fund`；如果目标版本尚未同步，不要改装 `latest`。
4. 执行 `mdd version --json`、`mdd skill sync --json` 和 `mdd doctor --json`；用户级同步必须显式指定 Agent。
