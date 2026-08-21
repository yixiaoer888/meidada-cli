# 媒大大CLI安装助手

帮助 Agent 安装和初始化媒大大官方 CLI，完成：

- 通过 npm 安装 `@meidada-cn/cli`
- 同步正式 `media-distribution` Skill
- 生成设备身份
- 使用单次部署 API Key 注册设备
- 执行 `doctor` 和账号健康检查

## 快速安装

如果本 Skill 是通过 SkillHub 安装到当前 Agent 的 skills 目录，Skill 安装完成后仍需继续部署媒大大 CLI。用户发送“请根据 https://skillhub.cn/install/skillhub.md 安装 @org-bgkwxnpv/meidada”后，Agent 必须继续完成 CLI 安装、设备注册和自检；全部命令通过后才算安装成功。

Windows PowerShell 默认使用 npmmirror，不会改动全局 npm registry：

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/yixiaoer888/meidada-cli/main/install.ps1 -OutFile install.ps1
PowerShell -ExecutionPolicy RemoteSigned -File .\install.ps1
```

Linux/macOS：

```bash
curl -fsSL https://raw.githubusercontent.com/yixiaoer888/meidada-cli/main/install.sh -o install.sh
sh install.sh
```

推荐的可审计安装命令（需要 Node.js 20+ 和 npm）：

```bash
npm install --global @meidada-cn/cli@0.5.3 --registry https://registry.npmmirror.com --no-audit --no-fund
```

安装后执行：

```bash
mdd version --json
mdd skill sync --json
mdd device prepare --json
```

默认只写当前项目的 `.agents/skills`。需要用户级 Skill 时必须指定 Agent，并建议先预览：`mdd skill sync --global --agent codex --dry-run --json`，确认后使用 `--force` 写入。支持 Codex、Cursor、Claude Code、Trae、WorkBuddy、CodeBuddy、OpenClaw、Windsurf 和 Gemini；不指定 Agent 不会批量写入多个用户目录。

执行 `mdd device prepare --json` 后，安装尚未完成。请用户在自己的本地终端执行 `mdd config init`，在隐藏提示中输入 CLI 工具入口生成的“单次部署 API Key”。不要要求用户把 Key 粘贴到聊天中；Agent 不得读取、回显、记录或写入 Key。Agent 不得再向用户索要 API URL；API 地址应来自官方 CLI 工具入口、安装流程或已有配置。

```bash
mdd config init
mdd doctor --json
mdd auth whoami --json
```

CLI 默认使用正式 API 地址 `https://www.meidada.cn`，因此通常只需提供一次性部署 API Key。企业私有部署可通过 `--api-url` 或 `MDD_API_URL` 覆盖默认地址。

人工安装推荐执行 `mdd config init`，在隐藏提示中输入 Key。Agent 非交互安装推荐使用安全读取后经 stdin 传递：

```powershell
& {
  $secure = Read-Host -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
} | mdd config init --api-key-stdin
```

不要把真实 Key 写入 `--api-key` 命令参数；该参数仅为兼容旧脚本保留，不推荐使用。

单次部署 API Key 只能使用一次，通常 15 分钟后过期。不要索要或接受账户长期通用 API Key。

## 更新

```bash
mdd update --json
mdd update --yes --json
mdd update --check --json
mdd update --yes --registry https://registry.npmmirror.com --json
```

普通业务命令只检查版本，不会隐式安装。更新 CLI 后按需显式同步指定 Agent 的 Skill，再重启当前 Agent 或新建任务。

npmmirror 可能有短暂同步延迟。新版本找不到时，Windows 使用 `-Official`，macOS/Linux 使用 `--official`，或在 `mdd update` 中传入 `--registry https://registry.npmjs.org`。独立二进制发行包保留给没有 Node.js 或网络受限环境，发布资产附带 SHA-256 校验文件。

## 正式业务 Skill

安装助手只负责安装、注册、更新和同步。稿件、媒体、投放、订单等业务操作由 `media-distribution` Skill 负责。

官方 CLI 包：`@meidada-cn/cli`  
CLI 命令：`mdd`
