import { randomUUID } from "node:crypto";
import {
  changeSchedules,
  localSlot,
  nextAt,
  type Plan,
  type Run,
} from "./store";
import { readTasks } from "../team/task-store";
export class ScheduleBusyError extends Error {}
export type Launch = (
  plan: Plan,
  run: Run,
) => Promise<{ taskFile: string; taskId: string }>;
export async function tickSchedules(
  root: string,
  profile: string,
  launch: Launch,
  now = Date.now(),
  recover = false,
) {
  const ready = await changeSchedules(root, (l) => {
    if (recover)
      for (const r of l.runs)
        if (
          r.snapshot.profile === profile &&
          ["running", "waiting"].includes(r.state) &&
          (!r.taskId || r.snapshot.mode === "single")
        ) {
          r.state = "uncertain";
          r.note = "软件重启，执行结果待核对，不自动重跑";
          const p = l.plans.find((p) => p.id === r.planId);
          if (p) p.state = "paused";
        }
    const jobs: Run[] = [];
    for (const p of l.plans) {
      if (
        p.profile !== profile ||
        p.state === "deleted" ||
        p.state === "draft" ||
        (!p.manual &&
          (p.state !== "enabled" || !p.nextAt || Date.parse(p.nextAt) > now))
      )
        continue;
      const manual = p.manual;
      const scheduled = manual ? new Date(now).toISOString() : p.nextAt!;
      const wall = localSlot(new Date(scheduled), p.rule.zone);
      const slot = `${p.id}:${p.revision}:${manual ?? `${wall.date}:${wall.time}`}`;
      delete p.manual;
      if (!manual) {
        p.nextAt = nextAt(p.rule, now);
        if (!p.nextAt) p.state = "paused";
      }
      if (l.runs.some((r) => r.slot === slot)) continue;
      const occupied = l.runs.some(
        (r) =>
          r.planId === p.id &&
          ["running", "waiting", "needs_input", "uncertain"].includes(r.state),
      );
      const missed =
        !manual && (recover || now - Date.parse(scheduled) > 120000);
      const run: Run = {
        id: "RUN-" + randomUUID().slice(0, 8),
        planId: p.id,
        snapshot: structuredClone(p),
        slot,
        scheduledAt: scheduled,
        state: occupied || missed ? "skipped" : "running",
        startedAt: new Date(now).toISOString(),
        ...(occupied || missed
          ? {
              endedAt: new Date(now).toISOString(),
              note: occupied ? "上次执行未结束" : "错过计划时间，未补跑",
            }
          : {}),
      };
      l.runs.push(run);
      if (run.state === "running") jobs.push(run);
    }
    return jobs;
  });
  await Promise.allSettled(
    ready.map(async (run) => {
      try {
        const result = await launch(run.snapshot, run);
        await changeSchedules(root, (l) => {
          const r = l.runs.find((x) => x.id === run.id)!;
          Object.assign(r, result);
          if (r.state === "running") r.state = "waiting";
        });
      } catch (e) {
        await changeSchedules(root, (l) => {
          const r = l.runs.find((x) => x.id === run.id)!;
          if (r.state === "cancelled") return;
          r.state = e instanceof ScheduleBusyError ? "skipped" : "failed";
          r.note = (e as Error).message;
          r.endedAt = new Date().toISOString();
          const p = l.plans.find((x) => x.id === r.planId);
          if (p && !(e instanceof ScheduleBusyError)) p.state = "paused";
        });
      }
    }),
  );
}
export async function reconcileSchedules(root: string, profile: string) {
  const { readSchedules } = await import("./store");
  const l = await readSchedules(root);
  for (const r of l.runs.filter(
    (r) =>
      r.snapshot.profile === profile &&
      r.taskFile &&
      r.taskId &&
      ["waiting", "running", "needs_input"].includes(r.state),
  )) {
    const t = (await readTasks(r.taskFile!)).tasks.find(
      (t) => t.id === r.taskId,
    );
    if (!t) continue;
    await changeSchedules(root, (store) => {
      const run = store.runs.find((x) => x.id === r.id)!;
      if (run.state === "cancelled") return;
      run.documentUrl = t.document?.url;
      run.note = t.summary || t.note;
      run.state =
        t.state === "completed"
          ? "done"
          : t.state === "cancelled"
            ? "cancelled"
            : t.state === "blocked"
              ? "needs_input"
              : "waiting";
      if (["done", "cancelled"].includes(run.state))
        run.endedAt = new Date().toISOString();
      if (run.state === "needs_input") {
        const p = store.plans.find((p) => p.id === run.planId);
        if (p && p.state === "enabled") p.state = "paused";
      }
    });
  }
}
export function startScheduler(
  root: string,
  profile: string,
  launch: Launch,
  onError: (e: unknown) => void,
) {
  let stopped = false,
    busy = false,
    first = true;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await reconcileSchedules(root, profile);
      await tickSchedules(root, profile, launch, Date.now(), first);
      first = false;
    } catch (e) {
      onError(e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 15000);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
