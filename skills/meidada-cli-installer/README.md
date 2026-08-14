# 媒大大CLI安装助手

帮助 Agent 安装和初始化媒大大官方 CLI，完成：

- Node.js/npm 环境检查
- 安装 `@meidada-cn/cli`
- 同步正式 `media-distribution` Skill
- 生成设备身份
- 使用单次部署 API Key 注册设备
- 执行 `doctor` 和账号健康检查

## 快速安装

```bash
npm install -g @meidada-cn/cli
mdd version --json
mdd skill sync --global
mdd device prepare --json
```

执行 `mdd device prepare --json` 后，需要从媒大大 CLI 部署页获取单次部署 API Key，再执行：

```bash
mdd config init --api-url "https://<official-console-host>" --api-key "<one-time-deployment-api-key>"
mdd doctor --json
mdd auth whoami --json
```

单次部署 API Key 只能使用一次，通常 15 分钟后过期。不要在聊天、日志或项目文件中保存或回显 API Key。

## 更新

```bash
mdd update --json
mdd update --yes --json
```

更新完成后，重启当前 Agent 或新建任务，使新的 Skill 生效。

## 正式业务 Skill

安装助手只负责安装、注册、更新和同步。稿件、媒体、投放、订单等业务操作由 `media-distribution` Skill 负责。

官方 CLI 包：`@meidada-cn/cli`  
CLI 命令：`mdd`

