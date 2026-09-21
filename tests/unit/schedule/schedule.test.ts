import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextAt,
  newPlan,
  operate,
  changeSchedules,
  readSchedules,
  wallTimeToISO,
  type Plan,
} from "../../../src/schedule/store";
import {
  tickSchedules,
  reconcileSchedules,
} from "../../../src/schedule/scheduler";
import { parseSchedule } from "../../../src/schedule/commands";
import { createTask, mutateTasks } from "../../../src/team/task-store";
const now = Date.parse("2026-09-21T00:00:00Z");
const input = {
  name: "需求",
  profile: "bot",
  chatId: "oc_group",
  creator: "ou_owner",
  prompt: "只读检查需求",
  mode: "single" as const,
  state: "enabled" as const,
  rule: { kind: "daily" as const, time: "09:00", zone: "Asia/Shanghai" },
};
describe("schedule time and commands", () => {
  it("calculates fixed timezone and skips weekends", () => {
    expect(nextAt(input.rule, now)).toBe("2026-09-21T01:00:00.000Z");
    expect(
      nextAt(
        { ...input.rule, kind: "weekdays" },
        Date.parse("2026-09-25T02:00:00Z"),
      ),
    ).toBe("2026-09-28T01:00:00.000Z");
  });
  it("converts a selected local datetime and rejects a DST gap", () => {
    expect(wallTimeToISO("2026-09-21T09:00", "Asia/Shanghai")).toBe(
      "2026-09-21T01:00:00.000Z",
    );
    expect(() => wallTimeToISO("2026-03-08T02:30", "America/New_York")).toThrow(
      "不存在",
    );
  });
  it("parses group natural language without pretending to support arbitrary time", () => {
    expect(parseSchedule("每个工作日早上9点，检查需求")?.rule.kind).toBe(
      "weekdays",
    );
    expect(parseSchedule("每周一 18:30 总结")?.rule.weekday).toBe(1);
    expect(parseSchedule("每天晚上9点 检查")?.rule.time).toBe("21:00");
    expect(parseSchedule("有空检查")).toBeUndefined();
  });
  it("deduplicates drafts and confirmation and preserves deletion history", () => {
    const l = { plans: [] as Plan[], runs: [] };
    const p = newPlan(l, { ...input, state: "draft", sourceId: "msg" }, now);
    expect(
      newPlan(l, { ...input, state: "draft", sourceId: "msg" }, now).id,
    ).toBe(p.id);
    operate(l, p.id, "enable", now);
    const due = p.nextAt;
    operate(l, p.id, "enable", now + 100);
    expect(p.nextAt).toBe(due);
    operate(l, p.id, "delete", now);
    expect(l.plans).toHaveLength(1);
    expect(p.state).toBe("deleted");
  });
});
describe("durable scheduling", () => {
  it("claims once across concurrent ticks and supports more than one plan for an agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "schedule-"));
    try {
      await changeSchedules(root, (l) => {
        newPlan(l, input, now);
        newPlan(l, { ...input, chatId: "oc_other" }, now);
      });
      const launch = vi.fn().mockResolvedValue({ taskFile: "f", taskId: "t" });
      await Promise.all([
        tickSchedules(root, "bot", launch, now + 3600000),
        tickSchedules(root, "bot", launch, now + 3600000),
      ]);
      expect(launch).toHaveBeenCalledTimes(2);
      expect((await readSchedules(root)).runs).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("skips missed executions and never overlaps an unfinished plan", async () => {
    const root = await mkdtemp(join(tmpdir(), "schedule-"));
    try {
      const p = await changeSchedules(root, (l) => newPlan(l, input, now));
      const launch = vi.fn().mockResolvedValue({ taskFile: "f", taskId: "t" });
      await tickSchedules(root, "bot", launch, now + 7200000);
      expect(launch).not.toHaveBeenCalled();
      await changeSchedules(root, (l) => operate(l, p.id, "run"));
      await tickSchedules(root, "bot", launch, now + 7200001);
      expect(launch).toHaveBeenCalledTimes(1);
      await tickSchedules(root, "bot", launch, now + 86400000 + 3600000);
      expect(launch).toHaveBeenCalledTimes(1);
      expect((await readSchedules(root)).runs.at(-1)?.note).toContain("未结束");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("pauses on missing human input and keeps the linked document", async () => {
    const root = await mkdtemp(join(tmpdir(), "schedule-"));
    try {
      const p = await changeSchedules(root, (l) => newPlan(l, input, now));
      const file = join(root, "task.json");
      const t = await mutateTasks(file, (l) =>
        createTask(l, "目标", "ou_owner", "om_root"),
      );
      await tickSchedules(
        root,
        "bot",
        async () => ({ taskFile: file, taskId: t.id }),
        now + 3600000,
      );
      await mutateTasks(file, (l) => {
        l.tasks[0]!.state = "blocked";
        l.tasks[0]!.document = { url: "https://feishu.cn/docx/abc" };
      });
      await reconcileSchedules(root, "bot");
      const l = await readSchedules(root);
      expect(l.plans.find((x) => x.id === p.id)?.state).toBe("paused");
      expect(l.runs[0]?.state).toBe("needs_input");
      expect(l.runs[0]?.documentUrl).toContain("abc");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("does not rerun after a lost launch result or restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "schedule-"));
    try {
      await changeSchedules(root, (l) => newPlan(l, input, now));
      const launch = vi.fn().mockRejectedValue(new Error("network"));
      await tickSchedules(root, "bot", launch, now + 3600000);
      await tickSchedules(root, "bot", launch, now + 3600001, true);
      expect(launch).toHaveBeenCalledOnce();
      expect((await readSchedules(root)).plans[0]?.state).toBe("paused");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('schedule cancellation races', () => {
  it('does not resurrect an execution cancelled while launch is pending', async () => {
    const root = await mkdtemp(join(tmpdir(), 'schedule-race-'));
    try {
      await changeSchedules(root, l => newPlan(l, input, now));
      await tickSchedules(root, 'bot', async (_p, run) => {
        await changeSchedules(root, l => { l.runs.find(r => r.id === run.id)!.state = 'cancelled'; });
        return { taskFile: 'file', taskId: 'task' };
      }, now + 3600000);
      expect((await readSchedules(root)).runs[0]?.state).toBe('cancelled');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
