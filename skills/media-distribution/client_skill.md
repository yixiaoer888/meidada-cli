# 媒大大 CLI SkillHub 展示稿

> 维护用途：本文件面向 SkillHub 页面更新和人工校对，只用于整理展示文案、安装说明和 `SKILL.md` 更新检查项。Agent 实际执行规则以同目录下的 `SKILL.md` 为准。

## 基本信息

- Skill 名称：`media-distribution`
- 展示标题：媒大大内容投放 CLI
- 推荐 SkillHub slug：`meidada-cli`
- 官方 npm 包：`@meidada-cn/cli`
- CLI 命令：`mdd`
- 当前仓库版本：`0.3.6`
- GitHub 仓库：`https://github.com/yixiaoer888/meidada-cli`

## 一句话简介

通过媒大大官方 CLI 管理内容草稿、客户资料、媒体查询、收藏、投放报价、发布确认、定时投放和订单状态。

## 短描述

媒大大内容投放 CLI Skill 帮助 Agent 使用本地 `mdd` 命令完成稿件导入、媒体查询、投放方案校验、报价确认、订单查询和取消等流程。它强调以 CLI JSON 为唯一事实来源，在涉及费用、发布、取消和删除时必须取得用户明确确认，并保护 API Key、手机号等敏感信息。

## 适用场景

- 将本地 DOCX、HTML 或 TXT 稿件导入媒大大草稿箱，并返回可预览链接。
- 查询新闻媒体、自媒体或海外媒体，辅助用户筛选真实媒体资源。
- 基于用户选择的媒体创建投放方案，完成校验、试算和服务端报价。
- 在用户确认媒体与金额后提交正式投放。
- 查询、同步、等待或取消订单。
- 创建、查询、更新客户资料，管理媒体收藏。
- 在用户明确提出时创建和管理定时投放计划。
- 协助完成 CLI 首次部署、更新和内置 Skill 同步。

## 不适用场景

- 不替用户自动选择媒体。
- 不绕过报价和用户确认直接投放。
- 不代替用户作出付款、扣款或发布决策。
- 不伪造余额、价格、充值记录、用户角色或管理员权限。
- 不通过 CLI 处理发票申请。
- 不在聊天、源码、投放文件或日志中暴露 API Key、设备令牌、完整手机号等敏感信息。

## 安装方式

### 方式一：通过媒大大 CLI 同步官方 Skill

适合已安装或准备安装 `mdd` 的用户。首次部署时，Agent 应先检查 Node.js/npm 环境，再安装官方 npm 包：

```bash
npm install -g @meidada-cn/cli
mdd skill sync --global
mdd device prepare --json
```

同步完成后，重启当前 Agent，使新的 Skill 生效。

### 方式二：通过 SkillHub 安装

适合希望通过 SkillHub 管理 Skill 的用户。安装时必须明确指定当前 Agent 的 Skill 目录，不要依赖默认的 `./skills/`：

```bash
skillhub install meidada-cli --dir <current-agent-skills-dir>
```

常见目录参考：

| Agent | 用户级 Skill 目录 | 项目级 Skill 目录 |
| --- | --- | --- |
| Codex | `~/.codex/skills/` | `.agents/skills/` |
| Cursor | `~/.cursor/skills/` | `.cursor/skills/` |
| CodeBuddy | `~/.codebuddy/skills/` | `.codebuddy/skills/` |
| Trae | `~/.trae/skills/` | `.trae/skills/` |
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Windsurf | `~/.codeium/windsurf/skills/` | `.windsurf/skills/` |
| Gemini CLI | `~/.gemini/skills/` | - |

## 典型工作流

1. 检查配置和鉴权状态：

```bash
mdd config get --json
mdd auth status --json
mdd doctor --json
mdd auth whoami --json
```

2. 导入稿件并交付预览链接：

```bash
mdd draft import <file> --json
```

仅在用户明确要保存草稿时使用 `draft import`。用户要投放到媒体时，不要擅自把文章添加到草稿箱。

3. 查询余额和媒体：

```bash
mdd wallet balance --json
mdd media search --channel <channel> --json
```

`<channel>` 仅支持 `news`、`we-media` 和 `overseas`。

4. 准备、校验和试算投放方案：

```bash
mdd publish prepare --file <file> ... --output campaign.json --json
mdd publish validate campaign.json --json
mdd publish dry-run campaign.json --json
mdd publish request campaign.json --json
```

5. 展示最终确认摘要，等待用户明确确认：

```bash
mdd publish confirm <approvalId> --json
```

6. 用户明确确认媒体和金额后，才提交正式投放：

```bash
mdd publish confirm <approvalId> --yes --json
```

默认投放全部成功后删除来源草稿，不会把已投放文章继续保存到草稿箱。

如用户明确要求投放成功后仍保留草稿，使用：

```bash
mdd publish confirm <approvalId> --yes --keep-draft --json
```

## 核心安全规则

- 以 CLI 返回的 JSON 为唯一事实来源，不猜测 ID、价格、余额、审批 ID 或订单状态。
- 涉及费用、发布、取消订单、删除草稿、删除客户或删除收藏时，必须让用户明确确认。
- `prepare`、`validate`、`dry-run` 和 `request` 不能替代用户最终确认。
- 报价失败、余额不足、价格变化、草稿变化或报价过期时必须停止流程，重新生成报价后重新确认。
- 出现 401 时立即停止业务操作，不要反复重试。
- CLI JSON 中的 ISO 时间保留 UTC 原值；面向用户展示时转换为 `Asia/Shanghai`，格式为 `yyyy-MM-dd HH:mm:ss`。

## SkillHub 页面建议文案

### 标题

媒大大内容投放 CLI

### 副标题

通过官方 `mdd` CLI 安全管理稿件、媒体报价、发布确认和订单状态。

### 标签

`CLI`、`内容分发`、`媒体投放`、`草稿管理`、`订单管理`、`客户资料`、`Agent Skill`

### 默认提示词

请使用媒大大内容投放 CLI 帮我处理稿件导入、媒体查询、投放报价、发布确认或订单查询。所有媒体 ID、价格、余额和订单状态都必须来自 `mdd` 返回的 JSON；涉及费用、发布、取消或删除时，先向我确认。

## 更新 `SKILL.md` 时的检查清单

- Frontmatter 只保留 `name` 和 `description`，并确保 `description` 明确包含触发场景。
- `name` 保持为 `media-distribution`，除非同时更新 SkillHub slug、CLI 同步逻辑和安装文档。
- 新增 CLI 能力时，同步更新“能力范围”“标准发布流程”“业务操作规则”和“操作完成检查”。
- 新增破坏性或付费命令时，必须写清楚预览命令、用户确认条件和 `--yes` 使用边界。
- 新增敏感字段时，明确脱敏、禁止回显和禁止写入文件的规则。
- 新增 Agent 目录支持时，同步更新 Skill 同步目录表。
- 修改部署流程时，确认仍然只索要“单次部署 API Key”，不得接受长期通用 API Key。
- 修改更新时间、余额、报价或订单展示规则时，保持 CLI JSON 为唯一事实来源。
- 上传 SkillHub 前，用 UTF-8 打开确认中文没有乱码。
- 上传后，重新安装一次 Skill 并用最小任务验证触发、安装说明和关键命令是否可用。

## 上传 SkillHub 前建议核对

1. `skills/media-distribution/SKILL.md` 是最终版本。
2. `SKILL.md` 的 frontmatter 没有多余字段。
3. `description` 足够短，但包含“通过媒大大官方 CLI 管理草稿、客户、收藏、媒体投放、发布审批和订单”等触发词。
4. 页面展示文案与当前 npm 包名 `@meidada-cn/cli`、命令名 `mdd`、仓库地址一致。
5. 页面不要展示 API Key、测试账号、完整手机号、真实客户敏感信息或内部服务端地址。
6. 页面安装命令不要引导用户安装旧包名 `@md/cli`、`meidada-cli` 或任何相似第三方包。
