# 媒大大 CLI Skill 维护说明

本目录包含正式业务 Skill：

- `SKILL.md`：媒大大内容投放的正式业务 Skill。

安装助手已独立放在：

- `../meidada-cli-installer/SKILL.md`

## 正式业务 Skill

`media-distribution` 用于通过官方 `mdd` CLI 管理：

- 草稿和本地文章导入
- 客户资料
- 媒体查询和收藏
- 投放方案、报价和发布确认
- 定时投放
- 订单查询、等待和取消

涉及费用、发布、取消或删除时，必须遵循 `SKILL.md` 中的用户确认规则。详细安全边界、鉴权处理和业务流程只维护在正式 `SKILL.md` 中。

## 安装媒大大 CLI

```bash
npm install -g @meidada-cn/cli@0.5.3
mdd version --json
mdd skill sync --json
mdd device prepare --json
```

随后请用户在自己的本地终端使用媒大大 CLI 工具入口生成的单次部署 API Key 完成设备注册。不要要求用户把 Key 粘贴到聊天中，也不额外索要 API URL：

```bash
mdd config init
mdd doctor --json
mdd auth whoami --json
```

人工安装在隐藏提示中输入一次性部署 API Key；Agent 非交互安装使用安全读取后通过 `mdd config init --api-key-stdin` 传入。`--api-key` 仅为兼容保留，不推荐使用。

## 更新 CLI

```bash
mdd update --json
mdd update --yes --json
mdd update --check --json
```

`mdd update` 默认执行更新，`--check` 只读检查；普通命令不会隐式安装更新。用户级 Skill 同步必须明确指定当前 Agent，例如先执行 `mdd skill sync --global --agent codex --dry-run --json`，确认后加 `--force` 执行；不要批量写入多个 Agent 目录。

更新或同步完成后，重启 Agent 或新建任务。

## 维护规则

- 只安装官方 npm 包 `@meidada-cn/cli`。
- 不要把 API Key、设备令牌或完整手机号写入公开文件。
- 修改业务规则时，优先更新 `SKILL.md`。
- 修改安装、注册、更新或 Skill 同步流程时，同时检查 `skills/meidada-cli-installer/SKILL.md` 和本文件。
- 暂不创建 `plugin.json`，除非 SkillHub 明确要求其格式。
