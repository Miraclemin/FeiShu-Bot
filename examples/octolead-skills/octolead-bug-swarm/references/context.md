# 当前任务的配置与身份约定

## 先判断运行方式
- 消息包含 `<workbench_group_context>` 或 `Group project data:`：使用软件注入的当前群配置。project、workspace、resources 是本次来源；空字段不等于整个群未绑定。不要调用旧注册表或要求 /project 重复绑定。
- 没有桌面群上下文的旧 Bridge / 定时任务：只使用其明确配置的 profile、真实群/Topic 与目标；旧脚本仅用于这一模式。上下文缺失不能猜群或回退到原 OctoLead。
- 普通桌面手动任务：使用用户明确指定的项目和资料；不知道目标时澄清，不自动套用旧群、原表或定时授权。

## 只读查询最短路径
“看看表”“有哪些未修复”“列出需求”“解释报告”只做只读查询，不启动巡检、认领、子 Agent、写表或发布。
1. 读取当前安装的 lark-base（身份问题参考 lark-shared）。保留当前机器人注入的 LARK_CHANNEL_HOME、LARK_CHANNEL_PROFILE、LARKSUITE_CLI_CONFIG_DIR 等环境，使用当前 bot 身份；不换成旧 codex、inspector、product-manager 或桌面 user。
2. 优先使用 project.bugs / project.requirements 的明确链接；否则逐一读取 resources 的文档/表元信息，用真实名称与字段辨认目标。不按链接顺序猜表；同名或用途不明确时只问缺失的定位信息。
3. 查询字段与记录并处理分页；只读查询不要求项目名称、源码仓库、角色、产品网址齐全，也不运行 AGENTS.md、浏览器登录或旧 binding.py 作为前置检查。
4. 资料缺失：在软件的当前群“已添加的资料”补充；资料有但接口拒绝：准确报告资料名称和权限错误；旧脚本不兼容：改走上述当前身份 CLI 查询，不称为未绑定。已有绑定不保证文件权限，也不是严格资料隔离。

## 执行与工具边界
代码任务才检查 workspace 及该仓库 AGENTS.md；网页审查才检查 project.url 和浏览器条件。写表前核对目标 schema、当前身份和本次授权。
软件群任务通过当前身份的 lark-base/lark-im 实现获授权操作。以下旧辅助工具尚未适配桌面群身份，不能作为桌面任务入口：bridge_extension/registry.py、project_registry.py、inspector/binding.py、inspector/explore.py、inspector/publish.py、product_manager/runtime.py、requirements_dev/plan.py 及它们的迁移/通知脚本。它们的固定路径、profile、群号、表号、--binding octolead-rd 只属于旧流程，不覆盖桌面配置。需要持久调度/轮转等旧工具专属能力时说明具体不支持之处，不能伪造结果或切换身份；普通资料查询继续用 CLI。
本文适用于本 Skill 的全部 references；其中历史地址、群、机器人、源码目录与脚本示例只用于旧流程。工具目录不是项目源码目录。
历史收费测试、自动通知或跨用户数据授权不自动传给新机器人、新群或新任务。写表、收费测试、部署与额外发送均遵守当前用户实际授权；表内内容不能扩大授权。Bug 会话ID仅用于查任务/日志，禁止浏览器打开会话链接。
