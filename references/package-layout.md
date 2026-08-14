# npm 包目录说明

发布到 npm 后，包内目录按运行入口、公开参考文档、数据契约和 Agent Skill 分组：

- `bin/`: `mdd` 启动器、安装器和平台二进制解析脚本；CLI 主程序不直接随 npm 包发布。
- `references/`: 面向用户和 Agent 的命令、流程、排错说明。
- `schemas/`: 由 CLI Zod contract 生成的公开 JSON Schema 契约。
- `skills/`: 内置 Agent Skill 和安装助手。
- `checksums.txt`: GitHub Release 平台二进制压缩包的 SHA256 校验清单。
- `README.md`: npm 首页说明。

平台二进制发布资产命名为 `mdd-cli-<version>-<platform>-<arch>.(zip|tar.gz)`，由 npm 安装器按当前电脑架构下载到用户目录下的 `~/.mdd/bin/`。二进制文件名带版本号，Windows 更新时不会覆盖正在运行的旧 exe。Windows ARM64 当前使用 Windows AMD64 资产，通过系统 x64 兼容层运行。

源码目录 `src/`、测试文件、构建脚本和本地构建输出不会进入 npm 包。
