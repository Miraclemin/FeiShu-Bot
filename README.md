# feishu-collaborator

基于 [Miraclemin/lark-team-agent-bridge](https://github.com/Miraclemin/lark-team-agent-bridge) 当前工作树独立创建。

桌面工作台：Mac / Windows 共用 Electron + React，支持四种本机 Agent 检测和切换。使用方法及尚未实现的权限边界见 [WORKBENCH.md](docs/WORKBENCH.md)。

基于 [zarazhangrui/feishu-claude-code-bridge](https://github.com/zarazhangrui/feishu-claude-code-bridge) 的源码维护版本。把飞书消息连接到本机 Codex/Claude，并为产品、研发、巡检角色提供独立项目配置。

**这不是给已安装文件打补丁的版本。** 新功能已经进入 `src/`，通过 TypeScript 构建生成 `dist/cli.js`。安装包携带所需 Python 配置工具，运行时不加载旧 `bridge_extension/commands.mjs`，也不执行补丁脚本。

- 上游基线：`589868119ce9a0a860aaf4936b5f9bac14e72681`，0.7.1。
- 本分支版本：`0.8.0-preview.1`。
- 保留上游 MIT 许可证与来源说明；[原版使用说明](docs/UPSTREAM-README.zh.md)。
- 项目和 App 名称为 `feishu-collaborator`；保留 `lark-channel-bridge` CLI 别名以兼容现有调用。当前尚未发布 npm 包。

## 下载与分享

从 [GitHub Releases](https://github.com/Miraclemin/feishu-collaborator/releases) 下载预览版。Mac 选择 arm64（Apple Silicon）或 x64（Intel），Windows 选择 x64 的 exe。安装包没有 Apple 公证或 Windows 商业签名；Windows 安装运行尚未真机验收。

发给朋友的入口：[安装与首次使用](docs/GETTING-STARTED.zh.md)。每个人安装自己的客户端、登录自己的 Agent、创建自己的飞书机器人。当前仅机器人创建者可以发起本机任务。

## 当前验证边界

当前使用本机 Agent CLI；历史 Docker 严格隔离原型已停用。技能选择不是文件访问沙箱，不应视为生产就绪。安装包以预览版发布，系统支持与限制见下文。

## 本次新增和迁移了什么

| 功能 | 实现与边界 |
|---|---|
| 群/Topic 项目绑定 | `/project show/help/set`，以 profile＋群ID＋Topic ID 区分；未知项目不回退到其他群 |
| 同一张状态卡 | `/status` 同时显示运行状态、产品网址、源码、项目工作目录和各表链接；原按钮保留 |
| 电脑执行权限 | `/config` 增加只读、限制写入范围、Full；保存 defaultAccess/maxAccess；影响当前机器人所有群，下一任务生效 |
| 管理权限 | 绑定修改和执行权限仍受原创建者/管理员规则约束；忙碌时拒绝权限修改 |
| 真实群上下文 | 每次 IM 调用传入 `LARK_PROJECT_CHAT_ID` / `LARK_PROJECT_TOPIC_ID`，并在提示词中给出配置读取入口 |
| Keychain 兼容 | product-manager 在 workspace 模式使用 Codex `--approve-for-me`，单条命令接受审查；不降级钥匙串、不导出密钥；Full 保持原语义 |
| 只读配置 | 查看绑定不写锁文件；修改用文件锁＋原子替换，避免只读沙箱报错 |
| 旧项目对接 | 配置数据迁到 Bridge home；已有 Skill/定时工具可以使用薄兼容入口继续读取同一份数据 |

## 飞书里怎么用

在目标群 @ 对应机器人，每条命令单独发送：

```text
@产品 /status
@产品 /config
@产品 /project help
@产品 /project set name 我的产品
@产品 /project set url https://example.com
@产品 /project set repo /实际源码目录
@产品 /project set requirements 飞书需求表完整链接
```

表字段：`requirements` 需求、`bugs` 缺陷、`records` 巡检记录、`directions` 巡检方向、`logs` 探索日志。链接须包含 `/base/...?...table=tbl...`。

项目绑定按机器人＋群/Topic保存；**电脑执行权限按机器人保存**。`/cd` 修改项目工作目录，不修改产品网址或表格。个人/团队模式、允许群、是否需要@，继续沿用上游访问控制。团队模式会跳过聊天允许名单，管理命令仍限管理员。

手动任务回复原群/Topic。增加绑定不等于新建定时任务。现有产品/巡检批处理的 Topic 报告仍未接入，不能将命令支持 Topic 等同于整套业务自动化已验证。

## 源码开发、构建、安装

新增项目绑定工具目前使用 Unix 文件锁，支持 macOS/Linux；Windows 保留上游核心测试，但本扩展的绑定落盘尚未适配。

需要 Node.js 22.12+、pnpm 10、Python 3.9+，以及已登录的本机 Agent CLI。workspace 自动命令审批需要支持 `--approve-for-me` 的 Codex 版本。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
python3 -m unittest discover -s resources -p 'test_*.py'
pnpm build
pnpm pack --pack-destination /tmp
npm install -g /tmp/feishu-collaborator-0.8.0-preview.1.tgz
lark-channel-bridge restart --profile product-manager
lark-channel-bridge restart --profile inspector
lark-channel-bridge restart --profile codex
lark-channel-bridge ps
```

本地 UI 测试需要允许监听 `127.0.0.1`。不要把沙箱 `listen EPERM` 当作产品失败，也不要跳过断言来“通过”。

## 数据与兼容迁移

- 应用凭据、群访问权限、工作目录、会话仍由原 `~/.lark-channel/` 管理，本仓库不包含这些私有配置。
- 项目绑定存于 `$LARK_CHANNEL_HOME/project-bindings.json`（默认 `~/.lark-channel`）；可显式指定 `LARK_PROJECT_BINDINGS_FILE`。
- 原定时工具的明确默认群存于 `project-defaults.json`。群内调用优先使用真实事件上下文，不能用默认值猜群。
- 已有 Bug/产品/巡检 Skill 与业务脚本继续在用户的工作流项目维护；本仓库负责 Bridge 接入层和绑定协议，不复制业务截图、需求正文或应用源码。
- 从旧本机补丁方案迁移：先备份原安装包和本地工具，运行 `tools/migrate-local-bindings.py --legacy-tools <原工具目录> --package-root <安装包目录> --link-compat`。它保留原绝对路径入口为指向安装包资源的兼容链接；新的 Bridge 本身不依赖旧扩展代码。
- 不在本仓库提交 App Secret、token、绑定数据、运行截图和历史记录。

## 验证与回滚

迁移前保存原安装目录、配置和通道服务文件；部署采用本地构建的 tarball。验证三个 profile 重新连接、项目绑定一致、只读表格访问正常。出错时先恢复原安装目录和兼容入口，再逐个重启；不要删除或重建飞书机器人。

权限表单和状态卡有源码测试；新项目表仍需核对字段与权限，配置完整不代表浏览器登录或真实开发上线已验收。
