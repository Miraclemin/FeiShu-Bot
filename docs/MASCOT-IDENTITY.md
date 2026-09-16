# Agent 头像与应用图标

按用户指定的 [IP as Logo](https://github.com/s1dashu/ip-as-logo-skill) 设计流程生成。参考版本：acb834c717bcd0a487c49732d08397ba280d690b，2026-09-16。

使用内置 image_gen.imagegen；工具未公开底层模型名称。每张独立生成一次，所有返回的原图均保留，没有重抽、筛除或修图。下列缩略图与系统图标是交付所需的尺寸和格式转换，原图未覆盖。

| 标签 | 方向及用途联想 | 预设构图 | 原图 |
| --- | --- | --- | --- |
| A1 | 小狗，可靠的工作搭档 | 左下 | [dog-a1.png](../resources/mascots/dog-a1.png) |
| A2 | 小狗，陪伴与守候 | 右下 | [dog-a2.png](../resources/mascots/dog-a2.png) |
| B1 | 水獭，动手协作 | 左下 | [otter-b1.png](../resources/mascots/otter-b1.png) |
| B2 | 水獭，团队配合 | 右下 | [otter-b2.png](../resources/mascots/otter-b2.png) |
| C1 | 猫头鹰，观察与检查 | 左下 | [owl-c1.png](../resources/mascots/owl-c1.png) |
| C2 | 猫头鹰，洞察与思考 | 右下 | [owl-c2.png](../resources/mascots/owl-c2.png) |

六张原图都是 1254 × 1254。完整提示词、约束、配色映射和返回元数据分别保存于：
[小狗](../resources/mascots/dog-generation.json)、[水獭](../resources/mascots/otter-generation.json)、[猫头鹰](../resources/mascots/owl-generation.json)。

应用标识使用 C1 猫头鹰，出现在浏览器 favicon、桌面窗口与 macOS Dock。首页标题旁不再显示应用头像，只在 Agent 行显示各自头像。Dock 使用单独的圆角、透明边距图标，避免显示为直角方块。macOS ICNS 和 Windows ICO 均已生成并接入打包配置；本次只构建、验证 macOS arm64 应用，没有验证 Windows 安装运行。

现有和新建 Agent 均根据稳定的 profile ID 获得默认头像，改显示名称、切换引擎不会改变头像。点击详情页头像可从六款中更换；选中结果保存在配置的 avatarId 中，立即显示，无需重启机器人。头像选项数量有限，多个 Agent 可以使用同一头像。

这些头像用于本软件内的 Agent，不会自动修改飞书开放平台中的机器人头像。使用内置素材，不需要创建 Agent 时联网生图或填写图片服务密钥。

尺寸与格式转换可在 macOS 执行：

    node tools/build-mascot-assets.mjs

原图：resources/mascots/
界面头像：web/src/assets/mascots/（256 × 256 PNG）
应用图标：resources/branding/（1024 PNG、ICNS、ICO）
