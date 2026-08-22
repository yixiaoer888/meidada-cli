#!/bin/sh
set -eu

REGISTRY=${MDD_NPM_REGISTRY:-https://registry.npmmirror.com/}
EXPECTED_VERSION=0.5.8
VERSION=${MDD_VERSION:-$EXPECTED_VERSION}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --official) REGISTRY=https://registry.npmjs.org/ ;;
    --registry) shift; REGISTRY=${1:?--registry requires a URL} ;;
    --version) shift; VERSION=${1:?--version requires a version} ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done

case "$REGISTRY" in https://*) ;; *) echo 'Registry 必须使用 HTTPS 地址。' >&2; exit 1 ;; esac
command -v node >/dev/null 2>&1 || { echo '未检测到 Node.js。请先安装 Node.js 20+：https://nodejs.org/' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo '未检测到 npm。请重新安装 Node.js 20+。' >&2; exit 1; }
NODE_MAJOR=$(node --version | sed 's/^v//' | cut -d. -f1)
[ "$NODE_MAJOR" -ge 20 ] || { echo "当前 Node.js 版本为 $(node --version)，需要 20 或更高版本。" >&2; exit 1; }
if [ "$VERSION" != "$EXPECTED_VERSION" ]; then
  echo "本安装脚本固定安装 CLI $EXPECTED_VERSION，不接受 $VERSION。" >&2
  exit 1
fi

PACKAGE="@meidada-cn/cli@$VERSION"
NPM_PREFIX=$(npm prefix --global)
NPM_ROOT=$(npm root --global)
echo "即将安装: $PACKAGE"
echo "使用 npm registry: $REGISTRY"
echo "npm 安装目录: $NPM_PREFIX"
echo '网络访问: 当前 npm registry。主包会自动安装当前平台的二进制 npm 包。'
echo '正常安装优先使用 npm 平台包；平台包不可用时仅下载当前版本官方二进制并校验 SHA-256。'
if ! npm install --global "$PACKAGE" --registry "$REGISTRY" --no-audit --no-fund; then
  echo '安装失败：CLI 安装未完成。' >&2
  exit 1
fi
MDD_BIN="$NPM_PREFIX/bin/mdd"
[ -x "$MDD_BIN" ] || { echo '安装失败：npm launcher 未生成。' >&2; exit 1; }
PACKAGE_JSON="$NPM_ROOT/@meidada-cn/cli/package.json"
[ -f "$PACKAGE_JSON" ] || { echo '安装失败：未找到 @meidada-cn/cli package.json。' >&2; exit 1; }
PACKAGE_VERSION=$(node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(p.name!=="@meidada-cn/cli") process.exit(2); process.stdout.write(p.version);' "$PACKAGE_JSON") || { echo '安装失败：npm 包校验失败。' >&2; exit 1; }
[ "$PACKAGE_VERSION" = "$EXPECTED_VERSION" ] || { echo '安装失败：npm 包版本不一致。' >&2; exit 1; }
VERSION_OUTPUT=$("$MDD_BIN" version --json) || { echo '安装失败：mdd version --json 执行失败。' >&2; exit 1; }
[ -n "$VERSION_OUTPUT" ] || { echo '安装失败：mdd version --json 没有输出。' >&2; exit 1; }
node -e 'const p=JSON.parse(process.argv[1]); if(p.version!==process.argv[2]) process.exit(2);' "$VERSION_OUTPUT" "$EXPECTED_VERSION" || { echo '安装失败：mdd version --json 返回的版本不一致。' >&2; exit 1; }
echo '安装完成。已验证 npm 包、launcher 和 mdd version --json；未修改全局 npm registry 配置。'
