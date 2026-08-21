param(
  [string]$Registry = $(if ($env:MDD_NPM_REGISTRY) { $env:MDD_NPM_REGISTRY } else { 'https://registry.npmmirror.com/' }),
  [switch]$Official,
  [string]$Version = $(if ($env:MDD_VERSION) { $env:MDD_VERSION } else { '0.5.3' })
)

$ErrorActionPreference = 'Stop'
if ($Official) { $Registry = 'https://registry.npmjs.org/' }
if ($Registry -notmatch '^https://') { throw 'Registry 必须使用 HTTPS 地址。' }
try { $requestedVersion = [version]$Version; $minimumVersion = [version]'0.5.3' } catch { throw 'Version 必须是已验证的具体版本号，不能使用 latest。' }
if ($requestedVersion -lt $minimumVersion) { throw "不允许安装低于 $minimumVersion 的 CLI，避免回退到旧版 $Version。" }

try {
  $node = Get-Command node -ErrorAction Stop
  $npm = Get-Command npm -ErrorAction Stop
} catch {
  Write-Error "未检测到 Node.js 或 npm。请先安装 Node.js 20+：https://nodejs.org/"
  exit 1
}

$nodeVersion = & $node.Source --version
if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 20) {
  Write-Error "当前 Node.js 版本为 $nodeVersion，需要 20 或更高版本。"
  exit 1
}

$package = "@meidada-cn/cli@$Version"
try {
  $npmPrefix = (& $npm.Source prefix --global).Trim()
  Write-Host "即将安装: $package"
  Write-Host "使用 npm registry: $Registry"
  Write-Host "npm 安装目录: $npmPrefix"
  Write-Host '网络访问: 当前 npm registry。主包会自动安装当前平台的二进制 npm 包。'
  Write-Host '正常安装不访问 GitHub；平台包缺失时才会尝试 GitHub Release 兼容回退，并校验 SHA-256。'
  & $npm.Source install --global $package --registry $Registry --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install 退出码 $LASTEXITCODE" }
  $mdd = Join-Path $npmPrefix 'mdd.cmd'
  if (-not (Test-Path -LiteralPath $mdd)) { throw "安装后未找到 CLI：$mdd" }
  & $mdd version --json
  if ($LASTEXITCODE -ne 0) { throw 'mdd 安装后验证失败，请重新打开终端后重试。' }
  Write-Host '安装完成。未修改你的全局 npm registry 配置。若当前终端找不到 mdd，请重新打开终端。'
} catch {
  Write-Error "安装失败：$($_.Exception.Message)"
  Write-Host '若 Agent 无权写入上述目录，请在普通用户终端执行：'
  Write-Host "npm install --global $package --registry $Registry --no-audit --no-fund"
  Write-Host '若 npmmirror 尚未同步最新版本，可使用 -Official 切换官方源。'
  exit 1
}
