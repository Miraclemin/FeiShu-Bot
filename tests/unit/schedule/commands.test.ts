import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  CardActionEvent,
  LarkChannel,
  NormalizedMessage,
} from "@larksuite/channel";
import type { Controls } from "../../../src/commands";
import {
  scheduleCommand,
  scheduleCardAction,
} from "../../../src/schedule/commands";
import { changeSchedules, readSchedules } from "../../../src/schedule/store";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "schedule-command-"));
  roots.push(root);
  const controls = {
    profile: "agent",
    botOwnerId: "ou_owner",
    ownerRefreshState: "ok",
    profileConfig: {
      workbench: { groups: { oc_group: { enabled: true } } },
      access: { admins: [] },
    },
  } as unknown as Controls;
  const send = vi.fn().mockResolvedValue({ messageId: "om_card" });
  const channel = { send } as unknown as LarkChannel;
  const msg = {
    content: "每天 09:00 只读汇总",
    senderId: "ou_owner",
    senderType: "user",
    chatType: "group",
    mentionedBot: true,
    chatId: "oc_group",
    threadId: "omt_topic",
    messageId: "om_request",
  } as NormalizedMessage;
  return { root, controls, channel, send, msg };
}
describe("schedule confirmation authorization", () => {
  it("creates a draft in its Topic and only its creator can confirm the matching card once", async () => {
    const h = await fixture();
    await scheduleCommand(h.root, h.controls, h.channel, h.msg);
    const p = (await readSchedules(h.root)).plans[0]!;
    expect(p.state).toBe("draft");
    expect(p.threadId).toBe("omt_topic");
    expect(h.send.mock.calls[0]?.[2]).toEqual({
      replyTo: "om_request",
      replyInThread: true,
    });
    const event = {
      action: { value: { scheduleAction: "enable", id: p.id } },
      chatId: "oc_group",
      messageId: "om_card",
      operator: { openId: "ou_other" },
    } as CardActionEvent;
    await scheduleCardAction(h.root, h.controls, h.channel, event);
    expect((await readSchedules(h.root)).plans[0]?.state).toBe("draft");
    event.operator.openId = "ou_owner";
    event.messageId = "om_wrong";
    await scheduleCardAction(h.root, h.controls, h.channel, event);
    expect((await readSchedules(h.root)).plans[0]?.state).toBe("draft");
    event.messageId = "om_card";
    await scheduleCardAction(h.root, h.controls, h.channel, event);
    await scheduleCardAction(h.root, h.controls, h.channel, event);
    const l = await readSchedules(h.root);
    expect(l.plans).toHaveLength(1);
    expect(l.plans[0]?.state).toBe("enabled");
    expect(l.runs).toHaveLength(0);
  });
  it("does not accept an expired card, another Topic command, or bot-created plan", async () => {
    const h = await fixture();
    await scheduleCommand(h.root, h.controls, h.channel, {
      ...h.msg,
      senderIsBot: true,
    });
    expect((await readSchedules(h.root)).plans).toHaveLength(0);
    await scheduleCommand(h.root, h.controls, h.channel, h.msg);
    const p = (await readSchedules(h.root)).plans[0]!;
    await scheduleCommand(h.root, h.controls, h.channel, {
      ...h.msg,
      threadId: "omt_other",
      content: `/schedule confirm ${p.id}`,
    });
    expect((await readSchedules(h.root)).plans[0]?.state).toBe("draft");
    await changeSchedules(h.root, (l) => {
      l.plans[0]!.expiresAt = Date.now() - 1;
    });
    await scheduleCardAction(h.root, h.controls, h.channel, {
      action: { value: { scheduleAction: "enable", id: p.id } },
      chatId: "oc_group",
      messageId: "om_card",
      operator: { openId: "ou_owner" },
    } as CardActionEvent);
    expect((await readSchedules(h.root)).plans[0]?.state).toBe("draft");
  });
});
