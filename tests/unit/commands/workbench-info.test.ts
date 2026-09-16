import { describe, expect, it, vi } from 'vitest';
import { workbenchInfo } from '../../../src/commands/workbench-info';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema';

function profile() {
  const p = createDefaultProfileConfig({ agentKind: 'claude', accounts: { app: { id: 'test', secret: 'test', tenant: 'feishu' } } });
  p.workbench = { revision: 1, protectDocuments: true, groups: {
    oc_team: { name: '选题群', enabled: true, workspace: '', role: 'product-manager', persona: '先查选题，再给建议。', skills: ['skill-a'], documents: [], resources: ['https://example.feishu.cn/docx/abc'] },
    oc_private: { name: '另一个群', enabled: true, workspace: '', persona: 'PRIVATE_PERSONA', documents: [], resources: ['https://example.feishu.cn/docx/PRIVATE_DOC'] },
  }};
  return p;
}

describe('workbench status and help information', () => {
  it('shows local role, persona, skills and links without claiming verified access', () => {
    const out = workbenchInfo(profile(), 'oc_team', '', () => [{ id: 'skill-a', name: '选题分析', description: '根据素材生成选题', path: '/private/path/SKILL.md' }])!;
    expect(out).toContain('产品经理');
    expect(out).toContain('先查选题');
    expect(out).toContain('选题分析');
    expect(out).toContain('https://example.feishu.cn/docx/abc');
    expect(out).toContain('本次未验证访问权限');
    expect(out).not.toContain('/private/path');
    expect(out).not.toContain('PRIVATE');
  });
  it('does not expose other group bindings in a direct message', () => {
    const scan = vi.fn();
    expect(workbenchInfo(profile(), 'dm', '', scan)).toContain('没有绑定');
    expect(scan).not.toHaveBeenCalled();
  });
  it('paginates and deduplicates resources including project bindings', () => {
    const p = profile(); const g = p.workbench!.groups.oc_team!;
    g.skills = [];
    g.resources = Array.from({ length: 10 }, (_, i) => `https://example.feishu.cn/docx/r${i}`);
    g.project = { name: '内容', url: '', requirements: g.resources[0]!, bugs: '' };
    const out = workbenchInfo(p, 'oc_team', '2')!;
    expect(out).toContain('10 份');
    expect(out).toContain('/docx/r9');
    expect(out).not.toContain('/docx/r0');
    expect(out).toContain('2/2 页');
  });
  it('labels missing skills and rejects unsafe resource links', () => {
    const p = profile(); p.workbench!.groups.oc_team!.resources = ['javascript:alert(1)'];
    const out = workbenchInfo(p, 'oc_team', '', () => [])!;
    expect(out).toContain('技能文件已移动或删除');
    expect(out).toContain('链接格式无效');
    expect(out).not.toContain('javascript:');
  });
});
