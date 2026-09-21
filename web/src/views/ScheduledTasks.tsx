import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Plan, Rule, Run } from "../../../src/schedule/store";
type Profile = {
  name: string;
  displayName?: string;
  online: boolean;
  groups: { id: string; name: string; coordinator: boolean }[];
};
type Data = { plans: Plan[]; runs: Run[]; profiles: Profile[] };
const labels: Record<string, string> = {
  draft: "待确认",
  enabled: "已启用",
  paused: "已暂停",
  deleted: "已删除",
  running: "执行中",
  waiting: "等待回执",
  done: "已完成",
  failed: "执行失败",
  skipped: "已跳过",
  needs_input: "等待人工",
  cancelled: "已取消",
  uncertain: "结果待核对",
};
const selectStyle = "w-full rounded-md border bg-background px-3 py-2 text-sm";
const date = (s?: string, zone?: string) =>
  s ? new Date(s).toLocaleString("zh-CN", { timeZone: zone }) : "—";
const localDateTime = (value: string, zone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
};
export function ScheduledTasks({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Data>({ plans: [], runs: [], profiles: [] }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState(false),
    [edit, setEdit] = useState<Plan>(),
    [selected, setSelected] = useState<string>(),
    [filter, setFilter] = useState("all");
  const [name, setName] = useState(""),
    [profile, setProfile] = useState(""),
    [chat, setChat] = useState(""),
    [mode, setMode] = useState<"single" | "coordinator">("single"),
    [prompt, setPrompt] = useState(""),
    [kind, setKind] = useState<Rule["kind"]>("weekdays"),
    [time, setTime] = useState("09:00"),
    [zone, setZone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [weekday, setWeekday] = useState(1),
    [once, setOnce] = useState(""),
    [requestId, setRequestId] = useState(""),
    [preview, setPreview] = useState(false),
    [dates, setDates] = useState<string[]>([]);
  const load = async () => {
    try {
      setData(await apiGet<Data>("/api/schedules"));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, []);
  const operate = async (action: string, id: string) => {
    setBusy(true);
    setError("");
    try {
      setData(await apiPost<Data>("/api/schedules", { action, id }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const group = data.profiles
    .find((p) => p.name === profile)
    ?.groups.find((g) => g.id === chat);
  const begin = (p?: Plan) => {
    setEdit(p);
    setName(p?.name ?? "");
    setProfile(p?.profile ?? data.profiles[0]?.name ?? "");
    setChat(p?.chatId ?? "");
    setMode(p?.mode ?? "single");
    setPrompt(p?.prompt ?? "");
    setKind(p?.rule.kind ?? "weekdays");
    setTime(p?.rule.time ?? "09:00");
    setZone(p?.rule.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setWeekday(p?.rule.weekday ?? 1);
    setOnce(p?.rule.at ? localDateTime(p.rule.at, p.rule.zone) : "");
    setRequestId(crypto.randomUUID());
    setPreview(false);
    setEditor(true);
    setError("");
  };
  const previewPlan = async () => {
    setError("");
    setBusy(true);
    try {
      const result = await apiPost<{ dates: string[] }>("/api/schedules", {
        action: "preview",
        profile,
        chatId: chat,
        mode,
        rule: { kind, time, zone, weekday },
        localAt: once,
      });
      setDates(result.dates);
      setPreview(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setPreview(false);
  }, [name, profile, chat, mode, prompt, kind, time, zone, weekday, once]);
  const save = async () => {
    setBusy(true);
    try {
      const rule: Rule = {
        kind,
        time,
        zone,
        ...(kind === "weekly" ? { weekday } : {}),
        ...(kind === "once" ? { at: edit?.rule.at } : {}),
      };
      setData(
        await apiPost<Data>("/api/schedules", {
          action: edit ? "edit" : "create",
          id: edit?.id,
          revision: edit?.revision,
          name,
          profile,
          chatId: chat,
          mode,
          prompt,
          rule,
          localAt: once,
          requestId,
        }),
      );
      setEditor(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          返回工作台
        </Button>
        <Button onClick={() => begin()}>新建定时任务</Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">定时任务</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          一个 Agent 可在多个群或 Topic
          设置多个计划。电脑联网、未休眠，软件与机器人后台运行时执行。
        </p>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {editor && (
        <section className="rounded-xl border bg-background p-5 space-y-4">
          <h2 className="font-semibold">{edit ? "编辑计划" : "新建计划"}</h2>
          <label className="block text-sm">
            名称
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              执行 Agent
              <select
                className={selectStyle}
                value={profile}
                disabled={!!edit}
                onChange={(e) => {
                  setProfile(e.target.value);
                  setChat("");
                  setMode("single");
                }}
              >
                <option value="">请选择</option>
                {data.profiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}
                    {p.online ? "" : "（未启动）"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              目标群
              <select
                className={selectStyle}
                disabled={!!edit}
                value={chat}
                onChange={(e) => {
                  setChat(e.target.value);
                  setMode("single");
                }}
              >
                <option value="">请选择已启用的群</option>
                {data.profiles
                  .find((p) => p.name === profile)
                  ?.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            指定 Topic：请在那个话题中 @机器人创建，计划会自动绑定该
            Topic，也会出现在这里。
          </p>
          <label className="block text-sm">
            执行方式
            <select
              className={selectStyle}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="single">单 Agent 执行</option>
              <option value="coordinator" disabled={!group?.coordinator}>
                组织者协调团队
              </option>
            </select>
          </label>
          <label className="block text-sm">
            任务内容
            <textarea
              className={selectStyle}
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：读取本群需求表，汇总未完成需求，只读不修改。"
              maxLength={12000}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              频率
              <select
                className={selectStyle}
                value={kind}
                onChange={(e) => setKind(e.target.value as Rule["kind"])}
              >
                <option value="weekdays">周一至周五</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="once">仅一次</option>
              </select>
            </label>
            {kind === "once" ? (
              <label className="text-sm">
                执行日期和时刻（所选时区）
                <Input
                  type="datetime-local"
                  value={once}
                  onChange={(e) => setOnce(e.target.value)}
                />
              </label>
            ) : (
              <label className="text-sm">
                时间
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            )}
            <label className="text-sm">
              时区
              <Input value={zone} onChange={(e) => setZone(e.target.value)} />
            </label>
          </div>
          {kind === "weekly" && (
            <label className="block text-sm">
              星期
              <select
                className={selectStyle}
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
                  <option key={i} value={i}>
                    星期{d}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            每次执行生成独立任务文档，结果发回所选群／Topic。错过时间不补跑；等待人工时自动暂停计划。周一至周五不含节假日调休判断。
          </p>
          {preview && (
            <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
              <p>
                {data.profiles.find(p => p.name === profile)?.displayName || profile} → {group?.name} {edit?.threadId ? "（原 Topic）" : ""}{" "}
                · {mode === "single" ? "单 Agent" : "组织者协调"}
              </p>
              <p>
                {kind === "once"
                  ? once + " · " + zone
                  : `${kind === "daily" ? "每天" : kind === "weekdays" ? "周一至周五" : "每周 " + weekday} ${time} · ${zone}`}
              </p>
              <p className="whitespace-pre-wrap">{prompt}</p>
              <p>接下来执行：{dates.map((d) => date(d, zone)).join("；")}</p>
              <p>
                确认后允许按此内容在本机执行，并将结果和文档发到对应群。修改仅影响未来执行。
              </p>
              <Button disabled={busy} onClick={save}>
                {edit ? "确认保存" : "确认创建并启用"}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!name.trim() || !profile || !chat || !prompt.trim()}
              onClick={previewPlan}
            >
              预览确认
            </Button>
            <Button variant="ghost" onClick={() => setEditor(false)}>
              取消
            </Button>
          </div>
        </section>
      )}
      <select
        aria-label="筛选计划"
        className={selectStyle}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="all">所有计划</option>
        <option value="enabled">已启用</option>
        <option value="paused">已暂停</option>
        <option value="draft">待确认</option>
      </select>
      {!data.plans.filter((p) => p.state !== "deleted").length && (
        <section className="rounded-xl border p-8 text-center text-muted-foreground">
          还没有计划。可创建“每天整理群待办”或“每周检查项目需求”。
        </section>
      )}
      {data.plans
        .filter(
          (p) =>
            p.state !== "deleted" && (filter === "all" || p.state === filter),
        )
        .map((p) => (
          <section key={p.id} className="rounded-xl border p-4 space-y-3">
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">{p.name}</h2>
              <span className="text-sm">{labels[p.state]}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {data.profiles.find(x => x.name === p.profile)?.displayName || p.profile} ·{" "}
              {data.profiles
                .find((x) => x.name === p.profile)
                ?.groups.find((g) => g.id === p.chatId)?.name ?? p.chatId}
              {p.threadId ? " · Topic" : ""} · {p.id}
            </p>
            <p className="text-sm">
              下次：
              {p.state === "enabled"
                ? date(p.nextAt, p.rule.zone)
                : "暂停／待确认"}{" "}
              · {p.rule.zone}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSelected(selected === p.id ? undefined : p.id)
                }
              >
                执行记录
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  operate(p.state === "enabled" ? "pause" : "enable", p.id)
                }
              >
                {p.state === "enabled"
                  ? "暂停"
                  : p.state === "draft"
                    ? "确认启用"
                    : "恢复"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || p.state === "draft"}
                onClick={() => {
                  if (window.confirm("现在执行一次，并将结果发送到所选群？"))
                    void operate("run", p.id);
                }}
              >
                立即运行一次
              </Button>
              <Button size="sm" variant="ghost" onClick={() => begin(p)}>
                编辑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm("删除未来计划？保留历史，当前执行不受影响。")
                  )
                    void operate("delete", p.id);
                }}
              >
                删除
              </Button>
            </div>
            {selected === p.id && (
              <div className="border-t pt-3 space-y-3">
                {data.runs
                  .filter((r) => r.planId === p.id)
                  .reverse()
                  .slice(0, 30)
                  .map((r) => (
                    <div key={r.id} className="text-sm">
                      <p>
                        {date(r.scheduledAt, p.rule.zone)} · {labels[r.state]} ·{" "}
                        {r.id}
                      </p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {r.note}
                      </p>
                      {[
                        "running",
                        "waiting",
                        "needs_input",
                        "uncertain",
                      ].includes(r.state) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "结束本次并暂停计划？已有操作保留；组织者已派出的执行者不会被强制停止。",
                              )
                            )
                              void operate("cancel-run", r.id);
                          }}
                        >
                          结束本次并暂停
                        </Button>
                      )}
                      {r.documentUrl &&
                        /^https:\/\/feishu\.cn\/docx\/[\w]+$/.test(
                          r.documentUrl,
                        ) && (
                          <a
                            className="text-primary underline"
                            target="_blank"
                            rel="noreferrer"
                            href={r.documentUrl}
                          >
                            打开任务文档
                          </a>
                        )}
                    </div>
                  ))}
                {!data.runs.some((r) => r.planId === p.id) && (
                  <p className="text-sm text-muted-foreground">尚未执行</p>
                )}
              </div>
            )}
          </section>
        ))}
    </div>
  );
}
