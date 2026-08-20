# npm 包目录说明

发布到 npm 后，包内目录按运行入口、公开参考文档、数据契约和 Agent Skill 分组：

- `bin/`: `mdd` 启动器、安装器和平台二进制解析脚本；CLI 主程序由按平台拆分的 npm 包分发，不直接随主 npm 包发布。
- `references/`: 面向用户和 Agent 的命令、流程、排错说明。
- `schemas/`: 由 CLI Zod contract 生成的公开 JSON Schema 契约。
- `skills/`: 内置 Agent Skill 和安装助手。
- `checksums.txt`: GitHub Release 平台二进制压缩包的 SHA256 校验清单。
- `README.md`: npm 首页说明。

平台二进制包命名为 `@meidada-cn/cli-<platform>-<arch>`，作为主包精确版本的 `optionalDependencies` 自动安装；启动器优先直接运行该包的 `bin/mdd` 或 `bin/mdd.exe`。GitHub Release 资产 `mdd-cli-<version>-<platform>-<arch>.(zip|tar.gz)` 保留为平台包缺失时的兼容回退，下载后会校验 SHA-256 并写入 `~/.mdd/bin/`。Windows ARM64 当前使用 Windows AMD64 资产，通过系统 x64 兼容层运行。

源码目录 `src/`、测试文件、构建脚本和本地构建输出不会进入 npm 包。
