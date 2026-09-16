# feishu-collaborator试用版

本次实现：Electron + React + TypeScript，复用 Bridge 的本地服务与适配器。
源码构建基于 macOS，提供 Mac arm64/x64 和 Windows x64 安装产物；Windows 安装运行需要在 Windows 真机验收。

## 启动

`pnpm desktop:dev` 构建并启动桌面程序。`pnpm desktop:pack` 生成可直接运行的应用目录。
`pnpm desktop:dist` 构建当前系统的分发包。`.github/workflows/desktop.yml` 分别构建 macOS 和 Windows。

桌面程序默认使用 `~/.lark-workbench`，与原 `~/.lark-channel` 隔离，不接管原机器人服务。
开发时可通过 `LARK_WORKBENCH_HOME` 指定另一配置目录。关闭最后一个窗口会停止此程序运行的机器人。

## 可试用

1. 首页显示 Codex、Claude Code、Hermes、OpenClaw 的本机安装检测。检测不等于已登录。
2. 新建 Agent，使用飞书扫描创建二维码。账号创建/企业审批仍取决于飞书实际规则。
3. 点击「搜索并选择群」，从机器人所在群或自己的群中按名称选择。人员名单也通过姓名搜索，不需要输入 ID。
4. 选择每群目录、人格、Skill 及启用状态，保存并应用。未选技能即不加载技能，删除或移动已选技能会阻止任务并要求重新选择。
5. 切换后端引擎保留同一个 App ID 和凭据，不创建另一个机器人。模型选择重置为引擎默认值，工作台模式不恢复旧会话。
6. 运行中拒绝切换；空闲在线机器人停止、保存、重新启动。启动失败明确显示未应用，可重新启动。

## 安全边界（请勿将计划功能当作已实现）

- 工作台模式只允许当前飞书验证的机器人创建者发起本机任务。群启用不能让普通群成员、外部人员、管理员自动获得执行权限。旧 CLI 配置在迁移前仍保持原行为。
- 飞书应用权限与调用者文档权限是两回事。当前四种原生 CLI 能继承本机工具、技能和凭据，技能加载限制不等于逐文件或逐工具的强制隔离。
- 因此本版本不开放普通成员委托执行，也不把白名单当作提示词承诺。设置严格文档列表时，该群执行会被拒绝（包括创建者），资料不会通过该任务交给模型。
- 精确逐文档授权、调用者 OAuth、逐请求工具代理、隔离执行容器仍待实现。页面明确标示这些限制。
- 工作目录仅设置 cwd，不是文件读取沙箱。Hermes/OpenClaw 适配器拒绝只读/工作区权限模式，必须明确选择本机完整权限才能运行。
- 未验证当前 owner、未启用的群、未安装的引擎、版本冲突均拒绝操作。
- 桌面 renderer 没有 Node 权限，开启 context isolation / sandbox；HTTP API 仅本机、随机 token 鉴权。外链只能打开 HTTPS。

## CLI 兼容性

- Codex / Claude Code 沿用现有流式适配器。
- Hermes 检查 `chat --help`，优先 `--query-file -`，旧版在 Unix 上使用直接 argv；不通过 shell 解释正文。
- OpenClaw 优先 `agent exec --message-file - --cwd --json`；旧版使用 `agent --local --session-id <new UUID> --message --json`，不启用 `--deliver`。按群调用使用独立临时配置覆盖 Agent 工作目录与技能列表；不宣称文件隔离。
- Windows `.cmd/.bat` 包装器遇到不能从 stdin 接收正文的旧版会拒绝执行，要求升级，避免命令行转义及长度问题。
- Hermes / OpenClaw 当前每任务新会话，不复用其他群或其他引擎会话；本机共享记忆仍不等于已隔离。

可运行 `tools/smoke-workbench-agents.ts` 中的连通检查。默认只检查可执行性；显式 `--run` 会请求模型回答测试词，可能消耗相应模型额度，不访问业务文件或发送飞书消息。

## 2026-09-12 修复与权限说明

- 修复 Electron 初始化配置根目录过晚、凭据 wrapper 未启用 Node 模式导致的启动 JSON 错误。启动错误同时显示在页面内，避免通知消失后无迹可查。
- 管理界面的 OAuth 使用独立 `lark-cli-management` 配置；不会修改运行机器人的 `strictMode=bot`。管理页面登录不等于允许群成员使用授权账号。
- 人员搜索要求应用开通用户身份的 `contact:user:search`，群查询要求 `im:chat:read`。应用开通并发布后，用户还需扫码同意；只有 `offline_access` 时无法查询人员/群。人员搜索先检查应用是否开放所需 scope，并提供扫码入口。
- 机器人身份使用应用权限及机器人可见资源；账号身份代表实际扫码账号，并非消息发送者。两者都不能代替“请求人和接收结果的人是否有权看到该文档”的检查。
- 当前保护模式固定机器人身份，普通用户/管理员名单不扩大执行权限。可用于个人自用；精确的多人文档授权尚未完成，不能作为多人权限隔离产品发布。

## 按群技能实现

扫描常见本机及工作目录的 SKILL.md，技能 ID 由规范化路径生成。每次任务重新核验选择；不继续之前的原生会话。工作台只注入该群勾选技能的名称、用途及入口，模型按需读取正文及相对引用。

- Codex：每任务私有临时配置，禁用扫描到的原生技能和插件加载，保留原生认证副本；配置在退出后清理，避免 Windows 超长命令行。
- Claude Code：关闭原生 slash/skill discovery，由本群技能目录提供选中技能。
- Hermes：私有临时 home，空原生技能目录、禁止预装技能同步、无外部技能目录；模型凭据临时私有复制，退出清理。
- OpenClaw：私有临时配置，将 Agent 原生 skills 设为空，再由 Bridge 提供该群选择；不修改用户原本配置。

这些控制约束原生技能发现与上下文加载，不是操作系统访问控制。给了完整本机 shell 权限的 Agent 仍可能自行读取其他文件。技能选择也不自动配置技能依赖的 MCP 或授予飞书接口权限。

实测：打包 Mac 应用中既有 Agent 启动上线；Codex 和 Hermes 原生空技能上下文检查通过。Windows 包可生成，但安装和运行尚需 Windows 真机测试。详情以本次交付说明为准。

技能机制参考：[Codex 技能配置](https://learn.chatgpt.com/docs/build-skills)、[OpenClaw 技能白名单与边界](https://docs.openclaw.ai/tools/skills)。

### 最简单的权限配置

“我的群”和人员搜索页面现提供“复制权限配置”和“打开本应用权限管理”。复制 JSON → 权限管理中批量导入并确认开通 → 发布并完成企业审批（如需）→ 回工作台扫码。只申请用户身份的 contact:user:search 和 im:chat:read，不自动扩大文档或邮件权限。

用户身份绑定扫码完成 OAuth 的账号，不自动绑定创建者或当前 @ 机器人的人。使用该账号时，资源权限与接口授权必须同时满足；不能因为机器人本身能读取某文档，就在用户身份失败后自动改用机器人身份读取。

注意旧 CLI 的 `user-default` 策略实际是 `strictMode=off`、`defaultAs=auto`，表示允许使用用户身份，并非强制每次使用用户身份。因此不能把这个选项本身当作调用者文档权限隔离。上面的“用户无权限就读取失败”指明确用该用户的 token 调用该接口的情况。工作台保护模式仍固定 `bot-only` 并限制为创建者执行。

### Disabled: historical strict skill isolation prototype

Build `docker build -t lark-skill-sandbox:codex-v1 resources/skill-sandbox` and start Docker Desktop on Mac/Windows. Enable strict skill isolation per group. Only Codex is supported; other engines fail closed. Each run copies selected skill directories and a bounded workspace snapshot, rejects links/special files, excludes native discovery directories, and mounts no host home or Docker socket. Skills are read-only. Changes are not written back. Feishu credentials and personal CLI configuration are not forwarded. Provider authentication is copied privately for the run. Internet access remains enabled for model calls; this is local filesystem isolation, not a network allowlist or a prohibition on generating equivalent code. Workspace files are still readable by the agent; use a dedicated project directory. Windows and other engines require separate runtime acceptance before production use.

Validation: 2026-09-13 macOS Docker filesystem probe passed (selected read, unselected/host path absent, selected write rejected); 19 targeted unit/integration tests passed. Live model acceptance failed because the container could not connect to chatgpt.com; interrupted and cleaned up. Not production-ready or included in desktop installers.

Docker execution is now disabled in the runtime. The supported flow runs the native CLI in the configured group workspace. Skill selection is a loading catalog, not a filesystem ACL. Historical strict settings remain fail-closed until the owner explicitly switches the group to native workspace mode.

### Up-front permission preparation

The workbench and directory authorization views share a permission preparation panel. Presets cover messaging, user directory/group selection, document reading, and Base table/record reading; record and document writes are opt-in. The desktop copies a validated preset-only JSON payload and opens the current app's permission console. This does not grant scopes, publish an app, complete user OAuth, or share any document. Platform confirmation/review and resource sharing remain required. Presets cover the built-in workflows, not arbitrary third-party skill permissions. Permission-bearing deep links are convenience links with bulk JSON import as fallback.
