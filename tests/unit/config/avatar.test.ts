import { describe, expect, it } from 'vitest';
import { randomAvatarId, isAvatarId } from '../../../src/config/avatar';
import catalog from '../../../resources/mascot-catalog.json';
describe('distinct random avatars', () => {
  it('allocates all 30 characters without reuse', () => {
    const used: string[] = [];
    for (let i = 0; i < 30; i++) used.push(randomAvatarId(used, undefined, () => 0));
    expect(new Set(used).size).toBe(30);
    expect(used.every(isAvatarId)).toBe(true);
  });
  it('still changes the current avatar when the pool is exhausted', () => {
    const all = catalog.map(x => x.id);
    expect(randomAvatarId(all, 'friend-fox', () => 0)).not.toBe('friend-fox');
  });
  it('keeps legacy manual selections valid', () => {
    expect(isAvatarId('owl-c2')).toBe(true);
    expect(isAvatarId('../unknown')).toBe(false);
  });
});
