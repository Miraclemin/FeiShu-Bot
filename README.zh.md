# FeiShu Bot · 中文说明

本项目默认使用中文 README。请查看 <strong>[项目首页](README.md)</strong>，了解项目背景、使用场景、下载安装、工作台配置以及来源与许可证。

- [下载安装包](https://github.com/Miraclemin/FeiShu-Bot/releases)
- [安装与首次使用](docs/GETTING-STARTED.zh.md)
- [工作台详细说明](docs/WORKBENCH.md)
- [上游中文文档](docs/UPSTREAM-README.zh.md)


## 自动协调与任务文档（Preview 6）

在群设置中启用组织者模式并填写各 Agent 职责。直接 @组织者提出目标，软件登记任务、创建独立飞书文档并协调执行。任务文档同步分工、回执、阻塞和通过 @提交的人工反馈；人协调时仍可沿用业务表格。

常用命令：`/team start 目标`、`/team status`、`/team resume`、`/team resolve S编号 人工核对结论`、`/team cancel`、`/team help`。取消仅停止后续协调，保留记录，不强停执行者；新任务使用新编号和新文档。

详见 [组织者模式](docs/coordinator-mode.md)。任务文档需飞书文档及分享权限，文档同步的真实飞书端到端验收尚待完成。

## 定时任务与简短回复（Preview 7）

首页「定时任务」可为同一 Agent 在不同群或 Topic 设置多个计划，支持单 Agent 执行和组织者协调。也可以在群内 @机器人发送「每天 09:00 汇总本群待办」，确认卡片后生效。

支持一次、每天、周一至周五、每周，以及暂停、恢复、执行记录。电脑、软件和机器人需保持运行；错过不补跑，等待人工时暂停。群内时间默认北京时间，Topic 计划在对应话题内创建。真实飞书端到端定时执行尚待验收。

所有 Agent 默认先说结论、用大白话、简短汇报。详细过程放任务文档；用户明确要求时再展开。
