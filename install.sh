#!/bin/sh
set -eu

REGISTRY=${MDD_NPM_REGISTRY:-https://registry.npmmirror.com/}
EXPECTED_VERSION=0.5.4
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
echo "即将安装: $PACKAGE"
echo "使用 npm registry: $REGISTRY"
echo "npm 安装目录: $NPM_PREFIX"
echo '网络访问: 当前 npm registry。主包会自动安装当前平台的二进制 npm 包。'
echo '正常安装优先使用 npm 平台包；平台包不可用时仅下载当前版本官方二进制并校验 SHA-256。'
if ! npm install --global "$PACKAGE" --registry "$REGISTRY" --no-audit --no-fund; then
  echo '若 Agent 无权写入上述目录，请在普通用户终端执行：' >&2
  echo "npm install --global $PACKAGE --registry $REGISTRY --no-audit --no-fund" >&2
  echo '若 npmmirror 尚未同步最新版本，请使用 --official。' >&2
  exit 1
fi
MDD_BIN="$NPM_PREFIX/bin/mdd"
[ -x "$MDD_BIN" ] || { echo "安装后未找到 CLI：$MDD_BIN" >&2; exit 1; }
"$MDD_BIN" version --json || { echo 'mdd 安装后验证失败，请重新打开终端后重试。' >&2; exit 1; }
echo '安装完成。未修改你的全局 npm registry 配置。若当前终端找不到 mdd，请重新打开终端。'
