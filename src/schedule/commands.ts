import type {
  CardActionEvent,
  LarkChannel,
  NormalizedMessage,
} from "@larksuite/channel";
import type { Controls } from "../commands";
import { canRunAdminCommand } from "../policy/access";
import { coordinatorEnabled } from "../team/coordinator";
import {
  changeSchedules,
  newPlan,
  operate,
  readSchedules,
  type Rule,
} from "./store";
export const scheduleHelp =
  "定时任务：每天 09:00 工作内容；每个工作日 09:00 工作内容；每周一 09:00 工作内容。默认北京时间。\n/schedule list\n/schedule show SCH编号\n/schedule confirm SCH编号\n/schedule pause SCH编号\n/schedule resume SCH编号\n/schedule run SCH编号\n/schedule delete SCH编号\n创建后须确认；电脑、软件和机器人需保持运行。";
export function parseSchedule(
  text: string,
): { rule: Rule; prompt: string } | undefined {
  const m = text.match(
    /^(?:请)?(?:帮我)?(?:设置)?(?:一个)?(?:定时任务[：:]?\s*)?(每天|每个?工作日|每周[一二三四五六日天])\s*(?:早上|上午|晚上|下午)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分?)?)\s*[，,:：]?\s*([\s\S]+)$/,
  );
  if (!m) return;
  let hour = Number(m[2]);
  if (/(?:晚上|下午)/.test(m[0].slice(0, m[0].indexOf(m[2]!))) && hour < 12)
    hour += 12;
  const rule: Rule = {
    kind:
      m[1] === "每天"
        ? "daily"
        : m[1]!.includes("工作日")
          ? "weekdays"
          : "weekly",
    time: `${String(hour).padStart(2, "0")}:${m[3] ?? String(m[4] ?? "00").padStart(2, "0")}`,
    zone: "Asia/Shanghai",
  };
  if (rule.kind === "weekly")
    rule.weekday = (
      { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 } as Record<
        string,
        number
      >
    )[m[1]!.slice(-1)];
  return { rule, prompt: m[5]!.trim() };
}
export async function scheduleCommand(
  root: string,
  controls: Controls,
  channel: LarkChannel,
  msg: NormalizedMessage,
): Promise<boolean> {
  const text = msg.content.replace(/<at\b[^>]*>.*?<\/at>/g, "").trim();
  const command = text.match(/^\/schedule(?:\s+(\w+))?(?:\s+([\s\S]+))?$/);
  const parsed = parseSchedule(text);
  const looksScheduled =
    /^(?:请|帮我|设置|一个|定时任务|每天|每个?工作日|每周|明天|后天).*?(?:每天|工作日|每周|明天|后天|定时)/.test(
      text,
    ) || /^(每天|每个?工作日|每周|明天|后天|定时任务)/.test(text);
  if (!command && !parsed && !looksScheduled) return false;
  const send = (s: string) =>
    channel.send(
      msg.chatId,
      { markdown: s },
      {
        replyTo: msg.messageId,
        ...(msg.threadId ? { replyInThread: true } : {}),
      },
    );
  if (msg.senderIsBot || msg.senderType === "bot" || msg.senderType === "app")
    return true;
  if (!msg.mentionedBot && msg.chatType !== "p2p") return false;
  if (!canRunAdminCommand(controls.profileConfig, controls, msg.senderId).ok) {
    await send("只有机器人拥有者或配置管理员可以管理定时任务。");
    return true;
  }
  try {
    const group = controls.profileConfig.workbench?.groups[msg.chatId];
    if (!group?.enabled) throw new Error("请先在软件中启用本群");
    if (parsed) {
      const plan = await changeSchedules(root, (l) =>
        newPlan(l, {
          name: parsed.prompt.slice(0, 50),
          prompt: parsed.prompt,
          rule: parsed.rule,
          profile: controls.profile,
          chatId: msg.chatId,
          threadId: msg.threadId,
          anchorId: msg.messageId,
          creator: msg.senderId,
          mode: coordinatorEnabled(group) ? "coordinator" : "single",
          state: "draft",
          sourceId: msg.messageId,
          expiresAt: Date.now() + 30 * 60000,
        }),
      );
      const summary = `**待确认：${plan.name}**\n${plan.id}\n时间：${plan.rule.kind === "weekdays" ? "周一至周五（不含调休判断）" : plan.rule.kind === "daily" ? "每天" : "每周" + plan.rule.weekday} ${plan.rule.time} · ${plan.rule.zone}\n下次：${new Date(plan.nextAt!).toLocaleString("zh-CN", { timeZone: plan.rule.zone })}\n方式：${plan.mode === "coordinator" ? "组织者协调" : "单 Agent"}；每次独立任务文档，结果发回本群／Topic。\n内容：${plan.prompt}\n电脑联网、未休眠且软件后台运行时执行。\n\n确认创建请 @我发送：\n\`/schedule confirm ${plan.id}\`\n取消请发送：\`/schedule delete ${plan.id}\`\n未确认不会执行，确认有效期30分钟。`;
      const receipt = await channel.send(
        msg.chatId,
        {
          card: {
            schema: "2.0",
            header: {
              title: { tag: "plain_text", content: "确认定时任务" },
              template: "blue",
            },
            body: {
              elements: [
                { tag: "markdown", content: summary },
                {
                  tag: "button",
                  text: { tag: "plain_text", content: "确认创建" },
                  type: "primary",
                  value: { scheduleAction: "enable", id: plan.id },
                },
                {
                  tag: "button",
                  text: { tag: "plain_text", content: "取消" },
                  value: { scheduleAction: "delete", id: plan.id },
                },
              ],
            },
          },
        },
        {
          replyTo: msg.messageId,
          ...(msg.threadId ? { replyInThread: true } : {}),
        },
      );
      if (receipt.messageId)
        await changeSchedules(root, (l) => {
          l.plans.find((p) => p.id === plan.id)!.confirmationId =
            receipt.messageId;
        });
      return true;
    }
    if (!command) {
      await send(
        "暂未识别具体时间，请使用“每天 09:00 任务内容”，或到软件「定时任务」设置一次性任务、时区和星期。尚未创建计划。",
      );
      return true;
    }
    const action = command[1] ?? "help",
      id = command[2]?.trim();
    const ledger = await readSchedules(root);
    const visible = ledger.plans.filter(
      (p) =>
        p.profile === controls.profile &&
        p.chatId === msg.chatId &&
        p.threadId === msg.threadId &&
        p.state !== "deleted",
    );
    if (action === "help") {
      await send(scheduleHelp);
      return true;
    }
    if (action === "list") {
      await send(
        visible
          .map(
            (p) =>
              `${p.id} · ${p.name} · ${p.state}\n下次：${p.nextAt ?? "无"}`,
          )
          .join("\n\n") || "本群／Topic 暂无定时计划。",
      );
      return true;
    }
    const plan = visible.find((p) => p.id === id);
    if (!plan) throw new Error("本群／Topic 没有这个计划");
    if (action === "show") {
      await send(
        `${plan.id} · ${plan.state}\n${plan.prompt}\n${JSON.stringify(plan.rule)}\n下次：${plan.nextAt ?? "无"}\n` +
          ledger.runs
            .filter((r) => r.planId === id)
            .slice(-5)
            .map(
              (r) =>
                `${r.id} ${r.state} ${r.note ?? ""}\n${r.documentUrl ?? ""}`,
            )
            .join("\n"),
      );
      return true;
    }
    await changeSchedules(root, (l) =>
      operate(
        l,
        id!,
        ({ confirm: "enable", resume: "enable" } as Record<string, string>)[
          action
        ] ?? action,
      ),
    );
    await send(
      `已保存：${id} · ${action === "confirm" || action === "resume" ? "已启用" : action === "pause" ? "已暂停（当前执行继续）" : action === "delete" ? "已删除计划，保留历史" : action === "run" ? "已登记立即执行一次" : action}`,
    );
  } catch (e) {
    await send((e as Error).message);
  }
  return true;
}

export async function scheduleCardAction(
  root: string,
  controls: Controls,
  channel: LarkChannel,
  evt: CardActionEvent,
): Promise<boolean> {
  const value = evt.action.value as
    { scheduleAction?: string; id?: string } | undefined;
  if (!value?.scheduleAction) return false;
  try {
    const p = (await readSchedules(root)).plans.find((p) => p.id === value.id);
    if (
      !p ||
      p.profile !== controls.profile ||
      p.chatId !== evt.chatId ||
      p.confirmationId !== evt.messageId ||
      p.creator !== evt.operator.openId ||
      !canRunAdminCommand(controls.profileConfig, controls, evt.operator.openId)
        .ok
    )
      throw new Error("此确认卡不属于当前操作者或已失效");
    if (!["enable", "delete"].includes(value.scheduleAction))
      throw new Error("无效操作");
    if (p.state !== "draft") {
      await channel.send(
        evt.chatId,
        { markdown: "此确认卡已处理，请在定时任务列表查看。" },
        { replyTo: evt.messageId },
      );
      return true;
    }
    await changeSchedules(root, (l) => operate(l, p.id, value.scheduleAction!));
    await channel.send(
      evt.chatId,
      {
        markdown: `${p.id} ${value.scheduleAction === "enable" ? "已创建并启用" : "已取消创建"}。`,
      },
      {
        replyTo: evt.messageId,
        ...(p.threadId ? { replyInThread: true } : {}),
      },
    );
  } catch (e) {
    await channel.send(
      evt.chatId,
      { markdown: (e as Error).message },
      { replyTo: evt.messageId },
    );
  }
  return true;
}
