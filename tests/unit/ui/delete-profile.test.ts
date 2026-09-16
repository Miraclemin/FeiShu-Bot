import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UiSupervisor } from '../../../src/ui/types';
const mocks = vi.hoisted(() => ({ remove: vi.fn(), load: vi.fn() }));
vi.mock('../../../src/cli/commands/profile', () => ({ runProfileRemove: mocks.remove }));
vi.mock('../../../src/config/profile-store', async (original) => ({ ...(await original<object>()), loadRootConfig: mocks.load }));
import { deleteProfile } from '../../../src/ui/fleet';
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({ profiles: { demo: {} } }); });
describe('delete Agent', () => {
  it('stops the selected Agent before archiving and never purges', async () => {
    const order: string[] = [];
    const stopProfile = vi.fn(async () => { order.push('stop'); });
    mocks.remove.mockImplementation(async () => { order.push('archive'); });
    await deleteProfile({ stopProfile } as unknown as UiSupervisor, 'demo', '/tmp/test-root');
    expect(order).toEqual(['stop', 'archive']);
    expect(stopProfile).toHaveBeenCalledWith('demo');
    expect(mocks.remove).toHaveBeenCalledWith('demo', { rootDir: '/tmp/test-root' });
  });
  it('keeps the binding if stopping fails', async () => {
    const stopProfile = vi.fn(async () => { throw new Error('stop failed'); });
    await expect(deleteProfile({ stopProfile } as unknown as UiSupervisor, 'demo')).rejects.toThrow('stop failed');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('rejects an unknown Agent without stopping anything', async () => {
    const stopProfile = vi.fn();
    await expect(deleteProfile({ stopProfile } as unknown as UiSupervisor, 'missing')).rejects.toThrow('Agent 不存在');
    expect(stopProfile).not.toHaveBeenCalled();
  });
});
