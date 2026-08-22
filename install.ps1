param(
  [string]$Registry = $(if ($env:MDD_NPM_REGISTRY) { $env:MDD_NPM_REGISTRY } else { 'https://registry.npmmirror.com/' }),
  [switch]$Official,
  [string]$Version = $(if ($env:MDD_VERSION) { $env:MDD_VERSION } else { '0.5.8' })
)

$ErrorActionPreference = 'Stop'
$expectedVersion = '0.5.8'
if ($Official) { $Registry = 'https://registry.npmjs.org/' }
if ($Registry -notmatch '^https://') { throw 'Registry 必须使用 HTTPS 地址。' }
if ($Version -ne $expectedVersion) { throw "本安装脚本固定安装 CLI $expectedVersion，不接受 $Version。" }

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
  Write-Host '正常安装优先使用 npm 平台包；平台包不可用时仅下载当前版本官方二进制并校验 SHA-256。'
  & $npm.Source install --global $package --registry $Registry --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install 退出码 $LASTEXITCODE" }
  $mdd = Join-Path $npmPrefix 'mdd.cmd'
  if (-not (Test-Path -LiteralPath $mdd)) { throw "安装后未找到 CLI：$mdd" }
  $packageRoot = Join-Path $npmPrefix 'node_modules\@meidada-cn\cli'
  $packageJsonPath = Join-Path $packageRoot 'package.json'
  if (-not (Test-Path -LiteralPath $packageJsonPath)) { throw '安装后未找到 @meidada-cn/cli package.json。' }
  $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
  if ($packageJson.name -ne '@meidada-cn/cli' -or $packageJson.version -ne $expectedVersion) {
    throw '安装后的 @meidada-cn/cli 版本校验失败。'
  }
  $versionOutput = (& $mdd version --json | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($versionOutput)) { throw 'mdd version --json 验证失败。' }
  $versionPayload = $versionOutput | ConvertFrom-Json
  if ($versionPayload.version -ne $expectedVersion) { throw 'mdd version --json 返回的版本不一致。' }
  Write-Host '安装完成。已验证 @meidada-cn/cli、mdd.cmd 和 mdd version --json；未修改全局 npm registry 配置。'
} catch {
  Write-Error '安装失败：CLI 安装或版本验证未通过。'
  exit 1
}
