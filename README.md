<p align="center">
  <img src="resources/branding/icon.png" width="112" alt="Feishu Collaborator 应用图标">
</p>

<h1 align="center">Feishu Collaborator</h1>

<p align="center"><strong>让你电脑上的 AI Agent，在飞书群里参与项目工作。</strong></p>
<p align="center">连接飞书、本机 Agent 与项目资料，把任务入口放在日常沟通的地方。</p>

<p align="center">
  <a href="https://github.com/Miraclemin/feishu-collaborator/releases"><img src="https://img.shields.io/badge/Download-macOS%20%7C%20Windows-2563eb?style=flat-square" alt="下载 macOS 和 Windows 客户端"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-15803d?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Agent-Runs%20locally-475569?style=flat-square" alt="Agent 在本机运行">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#可以用它做什么">使用场景</a> ·
  <a href="#配置你的工作台">工作台配置</a> ·
  <a href="#常见问题">常见问题</a> ·
  <a href="#项目来源与致谢">来源与致谢</a>
</p>

---

## 这是什么

Feishu Collaborator 是一个开源桌面工作台，将飞书机器人连接到你电脑上已经安装的 <strong>Codex、Claude Code、Hermes 或 OpenClaw</strong>。

你可以在客户端里管理机器人，为不同飞书群选择工作目录、工作角色、Skills 和项目资料。配置完成后，由机器人创建者在飞书群里发起任务，本机 Agent 执行，再把结果回复到群里。

它适合已经在使用本机 Agent，希望从飞书发起项目任务的开发者、产品负责人和独立创作者。你继续使用自己的模型账号、代码目录和飞书资料；客户端负责把这些入口连接起来。

> <strong>先认识一个使用前提：</strong>当前桌面工作台只允许机器人创建者发起本机任务。群聊可以作为项目讨论与结果共享的地方，普通群成员暂时不能借用创建者的账号权限执行任务。

## 为什么做这个项目

一个项目的上下文往往散在不同地方：讨论在飞书群，需求和 Bug 在多维表格，代码在电脑里，而 Agent 又有自己的对话窗口。

当你想让 AI 帮忙时，经常要重新找链接、说明项目背景、切换工作目录，再把结果搬回群里。换一个项目，这些步骤又要做一遍。

Feishu Collaborator 希望减少这类重复准备：<strong>把群、项目目录、角色和资料关联起来，让你在熟悉的沟通入口发起工作。</strong>产品、研发、巡检可以有不同的角色配置，也可以围绕同一份需求或 Bug 记录继续讨论。具体要做什么、何时写入、何时上线，仍由任务要求和实际授权决定。

## 可以用它做什么

例如，你在维护一个产品，想先弄清楚一个反馈，再决定是否修改：

```text
你在飞书群 @ 自己的机器人：

“这是用户反馈的 Bug 记录：<记录链接>。
先结合当前项目代码分析原因，给出修改建议，暂时不要改代码。”
```

机器人使用这个群配置的本机引擎、工作目录和技能处理任务，并在群里回复。确认方案后，你可以继续给出下一步指令。读取飞书记录需要相应工具和资源权限；执行效果也取决于所选 Agent 与技能。

| 使用场景 | 你可以怎样配置和提问 |
| --- | --- |
| 整理需求 | 选择产品经理角色，关联需求表，请它梳理背景、问题与验收条件 |
| 分析与修复 Bug | 选择研发角色，指定代码目录和 Bug 表，从问题分析开始，再明确授权修改 |
| 检查产品体验 | 选择巡检角色，配合已安装的浏览器等技能，检查指定页面或流程 |
| 切换项目 | 给不同群设置各自的目录、资料和回复要求，减少重复说明 |
| 使用不同 Agent | 在同一工作台管理本机引擎，根据任务选择 Codex、Claude Code、Hermes 或 OpenClaw |

角色提供工作方向，Skills 提供任务指引；浏览器、飞书工具和其他技能依赖仍需在本机配置。选择角色本身不会自动完成整套业务流程。

## 它怎样工作

<p align="center">
  <img src="assets/readme/workflow.svg" width="100%" alt="机器人创建者在飞书群发起任务，桌面工作台加载群配置，本机 Agent 执行后回复原群。">
</p>

1. <strong>飞书是任务入口。</strong>机器人创建者在已启用的群里 @ 机器人提出请求。
2. <strong>工作台提供群配置。</strong>找到对应的目录、角色、技能清单和项目资料。
3. <strong>本机 Agent 执行任务。</strong>沿用使用者自己的 Agent 登录状态，按所选工具及权限工作。
4. <strong>结果回到原群。</strong>你在讨论发生的地方查看回复，再决定下一步。

任务由你的电脑运行，电脑需要联网并保持唤醒。模型请求仍通过对应 Agent 的模型服务处理，“本机运行”不代表离线模型。

## 快速开始

### 1. 下载客户端

前往 <strong>[GitHub Releases 下载](https://github.com/Miraclemin/feishu-collaborator/releases)</strong>，根据电脑选择安装包：

| 系统 | 选择的文件 | 安装方式 |
| --- | --- | --- |
| macOS · Apple Silicon（M 系列） | `…-mac-arm64.dmg` | 打开 DMG，将应用拖入 Applications |
| macOS · Intel | `…-mac-x64.dmg` | 打开 DMG，将应用拖入 Applications |
| Windows · x64 | `…-win-x64.exe` | 运行安装向导，选择安装目录 |

当前提供预览版。Mac 安装包尚未经过 Apple 公证，Windows 安装包尚未商业签名，系统可能提示确认；Windows 实际安装运行仍待真机验证。下载页提供 `SHA256SUMS.txt` 校验文件，具体安装提示见[安装指南](docs/GETTING-STARTED.zh.md)。

### 2. 准备自己的 Agent

至少安装并登录下面一种本机 CLI，并先在终端确认它能够正常回答问题：

| 引擎 | 工作台中的使用方式 |
| --- | --- |
| Codex | 使用本机 Codex CLI 与登录状态 |
| Claude Code | 使用本机 Claude Code CLI 与登录状态 |
| Hermes | 使用本机 Hermes CLI；当前适配需要完整本机权限 |
| OpenClaw | 使用本机 OpenClaw CLI；当前适配需要完整本机权限 |

客户端会检测引擎是否安装。<strong>检测到安装不等于已经登录</strong>，模型订阅、API 配置与额度由你自行准备。使用第三方 Skill 时，也要安装它依赖的工具。

### 3. 创建 Agent，连接飞书

1. 打开客户端，<strong>新建 Agent</strong>，选择本机可用的引擎。
2. 按界面提示扫码，创建或绑定自己的飞书机器人。
3. 在权限准备页面选择需要的能力，复制权限配置，到对应飞书应用后台导入。
4. 完成飞书应用发布和企业审批（如需要），再回到客户端完成对应授权。
5. 将机器人加入用于测试的飞书群。

飞书应用权限与具体文档、表格的访问权限需要分别配置。导入权限配置不会自动让机器人获得所有资料的访问权。

### 4. 配置群，发出第一条消息

进入该 Agent 的工作台，点击 <strong>“搜索并选择群”</strong>，完成以下配置：

- <strong>角色：</strong>选择它在这个群负责产品、研发还是巡检。
- <strong>工作目录：</strong>选择本机项目文件夹。
- <strong>项目资料：</strong>填写项目名称、网址，以及需要关联的需求表、Bug 表或其他飞书资料。
- <strong>Skills：</strong>勾选本群任务需要加载的技能。
- <strong>群状态：</strong>打开“在这个群启用”，保存配置并启动 Agent。

然后，由创建者在飞书群里 @ 机器人：

```text
@你的机器人 你好，请介绍一下你在这个群里的工作角色。
```

收到回复后，再尝试一个范围明确的任务：

```text
@你的机器人 请阅读当前项目的 README，概括它的用途，不修改文件。
```

## 配置你的工作台

### 按群组织项目

同一个机器人可以为不同群保存各自的项目配置。比如，产品 A 的群使用产品 A 的代码目录和需求表，产品 B 的群使用另一套配置。

| 配置项 | 用途 |
| --- | --- |
| 工作角色 | 为群里的任务设置产品经理、研发或巡检方向 |
| 项目名称与网址 | 帮助 Agent 理解正在处理哪个产品 |
| 本机工作目录 | 确定任务启动时所在的目录 |
| 需求表与 Bug 表 | 提供业务记录入口，可通过界面选择具体表格 |
| 其他飞书资料 | 补充本群需要参考的文档链接 |
| 人格与回复要求 | 例如“先给结论，再给一个具体例子” |
| 技能清单 | 选择本群任务需要加载的 Skills |

<strong>目录与资料链接是工作上下文。</strong>工作目录不是文件访问沙箱，资料链接也不构成严格的逐文档访问控制。只配置你愿意让该 Agent 使用的目录和工具权限。

### Skills 与工具

工作台可以发现本机及工作目录中的技能，并提供内置角色和飞书工作指引。选择角色时，会加入相应角色与基础飞书技能；你可以继续调整本群的清单。

Skill 通常是一份任务指引，告诉 Agent 如何做某类工作。勾选 Skill 不会自动安装浏览器工具、配置 MCP、登录飞书 CLI，或开通接口权限。首次使用一项能力时，先检查它的依赖和授权是否齐全。

### 切换引擎

你可以在工作台切换本机引擎，继续使用同一个飞书机器人。切换会开始新对话；正在运行任务时需要先等任务结束。不同引擎支持的权限模式和会话机制有所不同，详情见[工作台说明](docs/WORKBENCH.md)。

## 日常使用

除自然语言任务外，也可以在飞书里 @ 机器人发送命令。<strong>每条命令单独发送。</strong>

| 命令 | 用途 |
| --- | --- |
| `/help` 或 `/usage` | 查看帮助与当前群的技能提示 |
| `/status` | 查看运行状态与项目入口 |
| `/config` | 查看或调整机器人配置，修改受管理权限约束 |
| `/project show` | 查看当前群或 Topic 的项目绑定 |
| `/project help` | 查看项目配置命令 |
| `/new` | 开始新对话 |

第一次使用建议从读取和分析开始，再给出明确的修改要求。例如：“先解释原因”“只修改这个文件”“完成后运行相关测试”。是否可以执行取决于所选引擎和权限设置。

<details>
<summary><strong>进阶：通过飞书命令配置项目</strong></summary>

也可以逐条发送：

```text
@你的机器人 /project set name 我的产品
@你的机器人 /project set url https://example.com
@你的机器人 /project set repo /你的本机项目目录
@你的机器人 /project set requirements 飞书需求表完整链接
@你的机器人 /project set bugs 飞书Bug表完整链接
```

表格链接应包含 `/base/` 及具体的 `table=tbl...` 参数。项目绑定按机器人、群与 Topic 区分；电脑执行权限按机器人保存。更多字段及命令以 `/project help` 为准。

</details>

## 常见问题

### 需要部署服务器吗？

使用桌面客户端不需要另行部署服务器。任务在本机运行，客户端、网络和 Agent 必须可用。关闭最后一个应用窗口会停止该客户端管理的机器人；电脑休眠后也不能继续正常处理新任务。

### 可以分享给朋友吗？

可以，直接分享[下载页面](https://github.com/Miraclemin/feishu-collaborator/releases)即可。朋友需要在自己的电脑安装客户端，登录自己的 Agent，并绑定自己的飞书机器人。不要把自己的 App Secret、token 或配置目录一起发送。

### 同一个群里的其他人也能调用吗？

当前桌面工作台只允许经过验证的机器人创建者发起本机任务。把机器人加到群里，不会自动授权所有成员操作创建者的电脑或资料。回复会出现在群里，请根据群成员的可见范围选择任务内容。

### 找不到群，或者读不了表格怎么办？

先检查机器人是否已加入目标群，再检查应用权限是否开通并发布、相应扫码授权是否完成，以及实际使用的身份是否有该文档或表格的访问权。“群已绑定”和“资料能读取”是两个独立条件。

### 配置保存在哪里？

桌面客户端默认使用 `~/.lark-workbench`；命令行工具默认使用 `~/.lark-channel`。这些目录包含本机配置和运行数据，请妥善保管。开发时可通过 `LARK_WORKBENCH_HOME` 为桌面客户端指定其他目录。

## 从源码运行

适合希望修改项目或参与贡献的开发者。需要 <strong>Node.js 22.12+、pnpm 10.33.0</strong>；使用 Python 项目绑定工具时还需要 Python 3.9+，该工具目前依赖 Unix 文件锁。

```bash
git clone https://github.com/Miraclemin/feishu-collaborator.git
cd feishu-collaborator
corepack enable
pnpm install --frozen-lockfile
pnpm desktop:dev
```

常用开发命令：

```bash
pnpm typecheck       # TypeScript 类型检查
pnpm test            # 自动化测试
pnpm build           # 构建前端与 Bridge
pnpm desktop:pack    # 生成本机应用目录
pnpm desktop:dist    # 生成当前平台安装包
```

桌面程序基于 <strong>Electron + React + TypeScript</strong>，底层复用 Bridge 的消息通道、配置管理和 Agent 适配器。前端使用 Vite 构建，通过 electron-builder 打包。

## 文档与参与

- [安装与首次使用](docs/GETTING-STARTED.zh.md)：下载安装、初次连接与分享。
- [工作台说明](docs/WORKBENCH.md)：引擎适配、技能机制与权限行为。
- [上游中文文档](docs/UPSTREAM-README.zh.md)：了解底层 Bridge 的背景与原有用法。
- [提交 Issue](https://github.com/Miraclemin/feishu-collaborator/issues)：反馈问题或讨论想法。

欢迎通过 Issue 和 Pull Request 参与改进。报告问题时请附操作系统、客户端版本、所用引擎、复现步骤与脱敏后的错误信息；不要提交密钥、访问令牌或私有聊天内容。

## 项目来源与致谢

Feishu Collaborator 基于 [Miraclemin/lark-team-agent-bridge](https://github.com/Miraclemin/lark-team-agent-bridge) 独立演进，延续其飞书消息连接与项目配置能力，并增加桌面工作台、按群配置、本机多引擎选择及项目资料入口。

其源码基础来自 [zarazhangrui/feishu-claude-code-bridge](https://github.com/zarazhangrui/feishu-claude-code-bridge)。感谢上游作者和贡献者提供飞书与本机 Agent 之间的连接基础。本仓库保留上游许可证与原版文档。

也感谢 Electron、React、TypeScript、Vite 等开源项目，以及相关 Agent 和飞书工具生态的建设者。

## License

本项目以 <strong>[MIT License](LICENSE)</strong> 开源。你可以在遵守许可证条件的前提下使用、修改和分发，也可以用于商业用途；分发时需要保留版权声明和许可证声明。

项目保留上游版权声明。第三方依赖遵循各自的许可证；模型服务与飞书服务的使用仍适用其各自条款。
