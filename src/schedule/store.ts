import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withConfigFileLock } from "../config/profile-store";
import { writeFileAtomic } from "../platform/atomic-write";
export type Rule = {
  kind: "once" | "daily" | "weekdays" | "weekly";
  time: string;
  zone: string;
  weekday?: number;
  at?: string;
};
export type Plan = {
  id: string;
  revision: number;
  name: string;
  profile: string;
  chatId: string;
  threadId?: string;
  anchorId?: string;
  creator: string;
  mode: "single" | "coordinator";
  prompt: string;
  rule: Rule;
  state: "draft" | "enabled" | "paused" | "deleted";
  nextAt?: string;
  createdAt: string;
  expiresAt?: number;
  manual?: string;
  sourceId?: string;
  confirmationId?: string;
};
export type Run = {
  id: string;
  planId: string;
  snapshot: Plan;
  slot: string;
  scheduledAt: string;
  startedAt?: string;
  endedAt?: string;
  state:
    | "running"
    | "waiting"
    | "done"
    | "failed"
    | "skipped"
    | "needs_input"
    | "cancelled"
    | "uncertain";
  note?: string;
  taskFile?: string;
  taskId?: string;
  documentUrl?: string;
  delivery?: string;
};
export type Ledger = { plans: Plan[]; runs: Run[] };
export const scheduleFile = (root: string) => join(root, "schedules.json");
export async function readSchedules(root: string): Promise<Ledger> {
  try {
    return JSON.parse(await readFile(scheduleFile(root), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { plans: [], runs: [] };
    throw e;
  }
}
export async function changeSchedules<T>(
  root: string,
  fn: (l: Ledger) => T,
): Promise<T> {
  await mkdir(root, { recursive: true });
  return withConfigFileLock(scheduleFile(root), async () => {
    const l = await readSchedules(root);
    const value = fn(l);
    await writeFileAtomic(scheduleFile(root), JSON.stringify(l, null, 2), {
      mode: 0o600,
    });
    return value;
  });
}
export function localSlot(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get("weekday")!,
    ),
  };
}
export function validateRule(r: Rule) {
  if (
    !r ||
    !["once", "daily", "weekdays", "weekly"].includes(r.kind) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)
  )
    throw new Error("请选择有效频率和时间");
  new Intl.DateTimeFormat("en", { timeZone: r.zone }).format();
  if (
    r.kind === "weekly" &&
    (!Number.isInteger(r.weekday) || r.weekday! < 0 || r.weekday! > 6)
  )
    throw new Error("请选择星期");
  if (r.kind === "once" && (!r.at || !Number.isFinite(Date.parse(r.at))))
    throw new Error("请选择有效的一次性执行日期");
}
export function nextAt(r: Rule, after = Date.now()): string | undefined {
  validateRule(r);
  if (r.kind === "once")
    return Date.parse(r.at!) > after
      ? new Date(r.at!).toISOString()
      : undefined;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: r.zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  for (
    let t = Math.floor(after / 60000) * 60000 + 60000;
    t <= after + 9 * 86400000;
    t += 60000
  ) {
    const p = fmt.formatToParts(t);
    const v = (k: string) => p.find((x) => x.type === k)?.value;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      v("weekday")!,
    );
    if (
      `${v("hour")}:${v("minute")}` === r.time &&
      (r.kind === "daily" ||
        (r.kind === "weekdays" && day > 0 && day < 6) ||
        (r.kind === "weekly" && day === r.weekday))
    )
      return new Date(t).toISOString();
  }
  throw new Error("无法计算下次执行时间");
}
export function newPlan(
  l: Ledger,
  input: Omit<Plan, "id" | "revision" | "createdAt" | "nextAt">,
  now = Date.now(),
): Plan {
  validateRule(input.rule);
  if (
    !input.prompt?.trim() ||
    input.prompt.length > 12000 ||
    !input.name?.trim() ||
    input.name.length > 100 ||
    !input.creator ||
    !input.profile ||
    !/^oc_[\w]+$/.test(input.chatId) ||
    (input.threadId && !/^omt_[\w]+$/.test(input.threadId)) ||
    (input.anchorId && !/^om_[\w]+$/.test(input.anchorId)) ||
    !["single", "coordinator"].includes(input.mode)
  )
    throw new Error("请检查名称、内容、Agent、群和 Topic");
  if (input.sourceId) {
    const old = l.plans.find(
      (p) => p.sourceId === input.sourceId && p.profile === input.profile,
    );
    if (old) return old;
  }
  const time = nextAt(input.rule, now);
  if (!time) throw new Error("执行时间必须在未来");
  const p: Plan = {
    ...input,
    id: "SCH-" + randomUUID().slice(0, 8),
    revision: 1,
    createdAt: new Date(now).toISOString(),
    nextAt: time,
  };
  l.plans.push(p);
  return p;
}
export function operate(
  l: Ledger,
  id: string,
  action: string,
  now = Date.now(),
) {
  const p = l.plans.find((x) => x.id === id && x.state !== "deleted");
  if (!p) throw new Error("计划不存在");
  if (action === "pause") {
    p.state = "paused";
    delete p.manual;
  } else if (action === "delete") {
    p.state = "deleted";
    delete p.manual;
  } else if (action === "enable") {
    if (p.state === "enabled") return p;
    if (p.state === "draft" && p.expiresAt && now > p.expiresAt)
      throw new Error("确认已过期，请重新创建");
    p.state = "enabled";
    p.nextAt = nextAt(p.rule, now);
    if (!p.nextAt) throw new Error("一次性计划已过期，请编辑日期");
  } else if (action === "run") {
    if (p.state === "draft") throw new Error("请先确认计划");
    if (
      p.manual ||
      l.runs.some(
        (r) =>
          r.planId === id &&
          ["running", "waiting", "needs_input", "uncertain"].includes(r.state),
      )
    )
      throw new Error("已有执行或待处理任务");
    p.manual = randomUUID();
  } else throw new Error("不支持的计划操作");
  return p;
}

export function wallTimeToISO(value: string, zone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("请选择有效的日期和时间");
  const seed = Date.parse(value + "Z");
  if (!Number.isFinite(seed)) throw new Error("日期无效");
  for (let t = seed - 14 * 3600000; t <= seed + 14 * 3600000; t += 60000) {
    const local = localSlot(new Date(t), zone);
    if (local.date + "T" + local.time === value)
      return new Date(t).toISOString();
  }
  throw new Error("所选时区不存在这个时刻，请重新选择");
}
