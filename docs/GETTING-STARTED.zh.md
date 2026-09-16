# 安装与首次使用

这是运行在你电脑上的飞书 Agent 工作台。先以个人自用预览版试用。

## 1. 下载并安装

打开 [Releases](https://github.com/Miraclemin/feishu-collaborator/releases)，选择最新预览版：

- Mac M 系列芯片：文件名包含 `mac-arm64.dmg`。
- Mac Intel 芯片：文件名包含 `mac-x64.dmg`。
- Windows 64 位：文件名包含 `win-x64.exe`（尚未经过 Windows 真机安装运行验收）。

Mac 打开 DMG，将应用拖到 Applications。预览包未经过 Apple 公证；如果系统阻止打开，在核对下载来源后，按系统提示到“系统设置 → 隐私与安全性”允许此应用。Windows 安装包未做商业代码签名，可能出现系统信誉提示。Release 附 SHA256SUMS.txt，可校验下载文件。

## 2. 准备自己的 Agent

安装并登录至少一个支持的本机 CLI：Codex、Claude Code、Hermes 或 OpenClaw。先在终端确认它能正常回答，再打开工作台。安装检测不代表模型账号已登录，客户端不附带模型订阅或额度。

Hermes/OpenClaw 目前需要完整本机权限；Codex/Claude 可按界面支持的权限选择。工作目录不是文件沙箱。飞书工具与第三方技能所需的 CLI/MCP 也需要自行安装和授权。

## 3. 创建机器人并配置群

1. 打开客户端，新建 Agent，选择已安装的引擎。
2. 按界面扫码创建或绑定自己的飞书机器人。
3. 根据权限准备页面复制权限 JSON，到对应飞书应用后台导入、发布，并完成企业审批（如需要）。这些步骤不会因安装客户端而自动完成。
4. 将机器人加入测试群，在工作台选择群、工作目录、角色及需要的技能。
5. 如需操作多维表格，选择自己的需求/Bug 表，并确保应用或实际授权身份有对应资源权限。
6. 保存并启动，由机器人创建者在该群 @ 机器人发送一个简单问题，确认收到回复后再使用业务文件。

## 分享给别人

直接分享本页或 Release 链接即可。每人使用自己的客户端、Agent 账号和机器人，不需要你的 App Secret、token、配置文件或聊天历史。不要把 `~/.lark-workbench` 打包发送给别人。

目前普通群成员不能借用创建者权限发起本机任务。若目标是“同一群里所有人共用一台服务器上的机器人”，本预览版尚未完成这种多人授权能力。

客户端需要保持运行、电脑联网且不休眠；关闭窗口会停止此客户端管理的机器人。默认配置存放在 `~/.lark-workbench`，CLI 默认目录为 `~/.lark-channel`。

## 源码启动

需要 Node.js 22.12+、pnpm 10.33.0；Python 项目绑定工具需要 Python 3.9+（目前使用 Unix 文件锁）。

```bash
git clone https://github.com/Miraclemin/feishu-collaborator.git
cd feishu-collaborator
corepack enable
pnpm install --frozen-lockfile
pnpm desktop:dev
```

[功能与权限边界](WORKBENCH.md) · [提交问题](https://github.com/Miraclemin/feishu-collaborator/issues)
