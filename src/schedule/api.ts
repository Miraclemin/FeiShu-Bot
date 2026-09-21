import { mutateTasks, touchTask } from "../team/task-store";
import { resolveAppPaths } from "../config/app-paths";
import { loadRootConfig } from "../config/profile-store";
import type { UiSupervisor } from "../ui/types";
import {
  changeSchedules,
  newPlan,
  operate,
  readSchedules,
  nextAt,
  wallTimeToISO,
  type Plan,
  type Rule,
} from "./store";
import { coordinatorEnabled } from "../team/coordinator";
export async function schedulesApi(
  sup: UiSupervisor,
  rootDir?: string,
  body?: Record<string, unknown>,
) {
  const paths = resolveAppPaths({ rootDir });
  const root = paths.rootDir;
  const config = await loadRootConfig(paths.configFile);
  if (body) {
    if (
      body.action === "create" ||
      body.action === "edit" ||
      body.action === "preview"
    ) {
      const profile = String(body.profile ?? ""),
        chatId = String(body.chatId ?? "");
      const group = config?.profiles[profile]?.workbench?.groups[chatId];
      const controls = sup.controlsFor(profile);
      if (!group?.enabled) throw new Error("请先启用所选群");
      if (!controls?.botOwnerId || controls.ownerRefreshState !== "ok")
        throw new Error("请先启动机器人并核验拥有者");
      const mode = body.mode === "coordinator" ? "coordinator" : "single";
      if (mode === "coordinator" && !coordinatorEnabled(group))
        throw new Error("请先为本群开启组织者模式");
      const rule = { ...(body.rule as Rule) };
      if (rule.kind === "once" && body.localAt)
        rule.at = wallTimeToISO(String(body.localAt), rule.zone);
      if (body.action === "preview") {
        const dates: string[] = [];
        let after = Date.now();
        for (let i = 0; i < 3; i++) {
          const next = nextAt(rule, after);
          if (!next) break;
          dates.push(next);
          after = Date.parse(next);
        }
        if (!dates.length) throw new Error("时间必须在未来");
        return { dates };
      }
      await changeSchedules(root, (l) => {
        if (body.action === "edit") {
          const existing = l.plans.find(
            (p) => p.id === body.id && p.state !== "deleted",
          );
          if (!existing) throw new Error("计划不存在");
          if (existing.revision !== body.revision)
            throw new Error("计划已修改，请刷新");
          if (existing.profile !== profile || existing.chatId !== chatId)
            throw new Error("更换 Agent 或群请新建计划");
          const next = nextAt(rule);
          if (!next) throw new Error("时间已过期");
          const prompt = String(body.prompt ?? "").trim(),
            name = String(body.name ?? "").trim();
          if (!prompt || prompt.length > 12000 || !name || name.length > 100)
            throw new Error("名称或任务内容无效");
          existing.name = name;
          existing.prompt = prompt;
          existing.rule = rule;
          existing.mode = mode;
          existing.revision++;
          existing.nextAt = next;
        } else
          newPlan(l, {
            name: String(body.name ?? ""),
            prompt: String(body.prompt ?? ""),
            profile,
            chatId,
            mode,
            creator: controls.botOwnerId!,
            rule,
            state: "enabled",
            sourceId: body.requestId
              ? `ui:${String(body.requestId)}`
              : undefined,
          });
      });
    } else if (body.action === "cancel-run") {
      const run = (await readSchedules(root)).runs.find(
        (r) => r.id === body.id,
      );
      if (
        !run ||
        !["running", "waiting", "needs_input", "uncertain"].includes(run.state)
      )
        throw new Error("执行已经结束，请刷新");
      if (run.taskFile && run.taskId)
        await mutateTasks(run.taskFile, (l) => {
          const t = l.tasks.find((t) => t.id === run.taskId);
          if (t) {
            t.state = "cancelled";
            t.note = "用户结束本次执行，保留历史。";
            touchTask(t);
          }
        });
      const base = run.snapshot.threadId
        ? `${run.snapshot.chatId}:${run.snapshot.threadId}`
        : run.snapshot.chatId;
      if (run.snapshot.mode === "single")
        sup
          .controlsFor(run.snapshot.profile)
          ?.activeRuns?.interrupt(`${base}:schedule:${run.id}`);
      await changeSchedules(root, (l) => {
        const r = l.runs.find((r) => r.id === run.id)!;
        r.state = "cancelled";
        r.endedAt = new Date().toISOString();
        r.note =
          run.snapshot.mode === "coordinator"
            ? "已取消协调，已派出的执行者可能仍在运行"
            : "已发出停止请求，保留已有操作和记录";
        const p = l.plans.find((p) => p.id === run.planId);
        if (p && p.state !== "deleted") p.state = "paused";
      });
    } else {
      const before = (await readSchedules(root)).plans.find(
        (p) => p.id === body.id,
      );
      if (!before) throw new Error("计划不存在");
      if (["enable", "run"].includes(String(body.action))) {
        const c = sup.controlsFor(before.profile);
        const g = c?.profileConfig.workbench?.groups[before.chatId];
        if (!c?.botOwnerId || c.ownerRefreshState !== "ok" || !g?.enabled)
          throw new Error("请先启动机器人并检查群配置");
      }
      await changeSchedules(root, (l) =>
        operate(l, String(body.id), String(body.action)),
      );
    }
  }
  const ledger = await readSchedules(root);
  return {
    ...ledger,
    profiles: Object.entries(config?.profiles ?? {}).map(([name, p]) => ({
      name,
      online: sup.isOnline(name),
      groups: Object.entries(p.workbench?.groups ?? {})
        .filter(([, g]) => g.enabled)
        .map(([id, g]) => ({
          id,
          name: g.name || id,
          coordinator: coordinatorEnabled(g),
        })),
    })),
  };
}
