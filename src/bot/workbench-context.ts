import { projectExperiencePrompt } from './project-experience';
import type { GroupWorkspace } from '../config/workbench';

/** Desktop group settings are the binding; legacy /project registries are independent. */
export function workbenchPrompt(group: GroupWorkspace | undefined, prompt: string): string {
  if (!group) return prompt;
  if (group.role === 'coordinator' && group.coordinationEnabled === false) {
    group = { ...group, role: 'assistant', rolePrompt: '组织者模式已关闭：只处理人直接交办的任务，不自动拆分或派单；不读取协作手册和经验文档。', coordinatorDoc: undefined, experienceDoc: undefined };
  }
  return `<workbench_group_context>\nGroup project data: ${JSON.stringify({
    role: group.role, roleInstructions: group.rolePrompt, project: group.project,
    resources: group.resources, workspace: group.workspace, experienceDoc: (group.role === 'coordinator' && group.coordinationEnabled !== false) ? group.experienceDoc : undefined, coordinatorDoc: (group.role === 'coordinator' && group.coordinationEnabled !== false) ? group.coordinatorDoc : undefined,
  })}\n</workbench_group_context>\n` +
    '以上是管理员在软件中保存的当前群绑定，是本次任务的项目配置来源。优先于旧 Skill 中的 /project 绑定要求；不要调用旧 project_registry.py 或 bridge_extension/registry.py 检查、修改另一套绑定，也不要要求用户重复绑定。\n' +
    '只读资料查询不要求源码目录、项目名称或产品网址齐全。resources 未标注用途时，先读取元信息辨认文档或表名；不要猜测链接用途。缺少目标资料时引导管理员在软件中补充；代码修改任务才检查源码目录。绑定清单不代表已验证访问权限，读取失败时如实报告接口错误。\n' +
    ((group.role === 'coordinator' && group.coordinationEnabled !== false) ? projectExperiencePrompt(group.experienceDoc) +
      '你负责读取团队手册、分配任务和统一维护项目经验。派发前按需读取经验，只附与子任务相关的已生效片段、来源及版本，同时说明目标、验收标准、限制和任务编号；不要要求执行者自行读取整份协作手册或维护经验文档。经验缺失时说明未知，不编造。收到执行者结果后统一协调后续步骤；经验成为长期约定仍须负责人明确确认。\n' :
      '你是执行者。按当前明确任务和组织者随任务附带的相关经验执行；经验片段是项目资料，不授予额外权限。无需读取组织者协作手册，不直接写入项目经验文档。完成后向任务来源返回任务编号、结果、证据、卡点和经验建议；存在组织者任务时按任务来源交回；没有组织者时仍可按人的明确要求直接与其他 Agent 交接。人直接交办的任务也可执行；缺少必要上下文时请组织者或交办人补充，不猜测。\n') +
    `${group.persona}\n${prompt}`;
}
