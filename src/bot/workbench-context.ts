import type { GroupWorkspace } from '../config/workbench';

/** Desktop group settings are the binding; legacy /project registries are independent. */
export function workbenchPrompt(group: GroupWorkspace | undefined, prompt: string): string {
  if (!group) return prompt;
  return `<workbench_group_context>\nGroup project data: ${JSON.stringify({
    role: group.role, roleInstructions: group.rolePrompt, project: group.project,
    resources: group.resources, workspace: group.workspace,
  })}\n</workbench_group_context>\n` +
    '以上是管理员在软件中保存的当前群绑定，是本次任务的项目配置来源。优先于旧 Skill 中的 /project 绑定要求；不要调用旧 project_registry.py 或 bridge_extension/registry.py 检查、修改另一套绑定，也不要要求用户重复绑定。\n' +
    '只读资料查询不要求源码目录、项目名称或产品网址齐全。resources 未标注用途时，先读取元信息辨认文档或表名；不要猜测链接用途。缺少目标资料时引导管理员在软件中补充；代码修改任务才检查源码目录。绑定清单不代表已验证访问权限，读取失败时如实报告接口错误。\n' +
    `${group.persona}\n${prompt}`;
}
