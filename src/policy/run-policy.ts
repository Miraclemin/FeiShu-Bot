import type { AgentCapability } from '../agent/capability';
import {
  accessToClaudePermissionMode,
  accessToCodexSandbox,
  clampAccess,
  type AccessMode,
  type ClaudePermissionMode,
  type CodexSandboxMode,
} from '../config/permissions';
import type { ProfileConfig } from '../config/profile-schema';
import type { AccessDecision } from './access';
import {
  accessPolicyDigest,
  attachmentPolicyConfigDigest,
  policyFingerprint,
  resourceScopeDigest,
} from './fingerprint';

export interface ScopeContext {
  source: 'im' | 'card' | 'comment' | 'meeting';
  chatId?: string;
  threadId?: string;
  actorId: string;
  commentScopeId?: string;
  resourceBindings?: ResourceBinding[];
}

export interface ResourceBinding {
  kind: 'doc' | 'folder';
  id: string;
  verified: boolean;
}

export interface AgentAttachment {
  kind: string;
  requiredness: 'required' | 'optional';
  decision: 'accepted' | 'rejected' | 'skipped';
  rejectionReason?: string;
  originalName?: string;
  size?: number;
  hash?: string;
  path?: string;
}

export interface RunPolicyInput {
  scope: ScopeContext;
  attachments: AgentAttachment[];
  prompt: string;
  requestedCwd: string;
  cwdRealpath: string;
  access: AccessDecision;
  capability: AgentCapability;
  profileConfig: ProfileConfig;
  now: number;
  codexHome?: string;
  inheritCodexHome?: boolean;
  ttlMs?: number;
}

export interface RunPolicyAllow {
  skillIsolation?: 'strict' | 'catalog';
  ok: true;
  prompt: string;
  requestedCwd: string;
  cwdRealpath: string;
  accessMode: AccessMode;
  sandbox: CodexSandboxMode;
  permissionMode: ClaudePermissionMode;
  access: AccessDecision;
  attachments: AgentAttachment[];
  policyFingerprint: string;
  expiresAt: number;
}

export interface RunPolicyReject {
  ok: false;
  rejectReason: {
    code:
      | 'skill-isolation-unavailable'
      | 'document-permission-unverified'
      | 'access-denied'
      | 'folder-allowlist-unverified'
      | 'required-attachment-rejected';
    userVisible: string;
  };
}

export type RunPolicyResult = RunPolicyAllow | RunPolicyReject;

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function evaluateRunPolicy(input: RunPolicyInput): RunPolicyResult {
  if (input.profileConfig.workbench) {
    if (input.access.reason !== 'owner') return reject('document-permission-unverified', '尚未验证调用者的文档权限；为防止借用机器人权限，当前仅允许创建者发起本机任务。');
    const group = input.scope.chatId ? input.profileConfig.workbench.groups[input.scope.chatId] : undefined;
    if (group?.skillIsolation === 'strict' && input.profileConfig.agentKind !== 'codex') return reject('skill-isolation-unavailable', '本群要求严格技能隔离，但当前本机 Agent 尚未接入隔离执行环境。任务已阻止，不会回退到本机全权限运行。');
    if (group?.documents.length) return reject('document-permission-unverified', '已设置严格文档白名单，但本机 CLI 尚不能强制执行逐文档权限边界。本次任务已拒绝，未将资料交给 Agent。');
  }
  if (!input.access.ok) {
    return reject('access-denied', '当前用户无权发起运行。');
  }

  if (input.scope.resourceBindings?.some((binding) => binding.kind === 'folder' && !binding.verified)) {
    return reject('folder-allowlist-unverified', '暂不支持 folder allowlist，已拒绝运行。');
  }

  if (
    input.attachments.some(
      (attachment) =>
        attachment.requiredness === 'required' && attachment.decision !== 'accepted',
    )
  ) {
    return reject('required-attachment-rejected', '必需附件未通过校验，已拒绝运行。');
  }

  const accessMode = clampAccess(
    input.profileConfig.permissions.defaultAccess,
    input.profileConfig.permissions.maxAccess,
    input.capability.permissions.maxAccess,
  );
  const sandbox = accessToCodexSandbox(accessMode);
  const permissionMode = accessToClaudePermissionMode(
    accessMode,
    input.profileConfig.permissions,
  );
  const resourceDigest = resourceScopeDigest({
    source: input.scope.source,
    chatId: input.scope.chatId,
    threadId: input.scope.threadId,
    commentScopeId: input.scope.commentScopeId,
    resourceBindings: input.scope.resourceBindings?.map((binding) => binding.id),
  });
  const attachmentDigest = attachmentPolicyConfigDigest(input.profileConfig.attachments);
  const accessDigest =
    input.scope.source === 'comment' && input.access.reason === 'comment-mention'
      ? 'comment-mention'
      : accessPolicyDigest(input.profileConfig.access);

  return {
    ok: true,
    skillIsolation: input.scope.chatId ? input.profileConfig.workbench?.groups[input.scope.chatId]?.skillIsolation : undefined,
    prompt: input.prompt,
    requestedCwd: input.requestedCwd,
    cwdRealpath: input.cwdRealpath,
    accessMode,
    sandbox,
    permissionMode,
    access: input.access,
    attachments: input.attachments,
    expiresAt: input.now + (input.ttlMs ?? DEFAULT_TTL_MS),
    policyFingerprint: policyFingerprint({
      cwdRealpath: input.cwdRealpath,
      sandbox,
      accessPolicyDigest: accessDigest,
      resourceScopeDigest: resourceDigest,
      attachmentPolicyShapeDigest: attachmentDigest,
      codexHome: input.codexHome,
      inheritCodexHome: input.inheritCodexHome ?? false,
    }),
  };
}

function reject(code: RunPolicyReject['rejectReason']['code'], userVisible: string): RunPolicyReject {
  return {
    ok: false,
    rejectReason: {
      code,
      userVisible,
    },
  };
}
