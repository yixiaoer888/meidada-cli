# npm 包目录说明

发布到 npm 后，包内目录按运行入口、公开参考文档、数据契约和 Agent Skill 分组：

- `bin/`: `mdd` 启动器和编译后的 CLI 主程序。
- `references/`: 面向用户和 Agent 的命令、流程、排错说明。
- `schemas/`: 从 CLI Zod contract 生成的公开 JSON Schema 契约。
- `skills/`: 内置 Agent Skill 和安装助手。
- `checksums.txt`: 发布包关键文件的 SHA256 校验清单。
- `README.md`: npm 首页说明。

源码目录 `src/`、测试文件、构建脚本和本地构建输出不会进入 npm 包。
