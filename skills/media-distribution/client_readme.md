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
npm install -g @meidada-cn/cli
mdd version --json
mdd skill sync --global
mdd device prepare --json
```

随后使用媒大大 CLI 工具入口生成的单次部署 API Key 完成设备注册。Agent 只向用户索要 Key，不额外索要 API URL：

```bash
mdd config init --api-key "<one-time-deployment-api-key>"
mdd doctor --json
mdd auth whoami --json
```

## 更新 CLI

```bash
mdd update --json
mdd update --yes --json
```

更新或同步完成后，重启 Agent 或新建任务。

## 维护规则

- 只安装官方 npm 包 `@meidada-cn/cli`。
- 不要把 API Key、设备令牌或完整手机号写入公开文件。
- 修改业务规则时，优先更新 `SKILL.md`。
- 修改安装、注册、更新或 Skill 同步流程时，同时检查 `skills/meidada-cli-installer/SKILL.md` 和本文件。
- 暂不创建 `plugin.json`，除非 SkillHub 明确要求其格式。
