import catalog from '../../resources/mascot-catalog.json';

export function isAvatarId(value: unknown): value is string {
  return typeof value === 'string' && catalog.some(item => item.id === value);
}

/** Stable across display-name changes, engine switches and process restarts. */
export function defaultAvatarId(profile: string): string {
  let hash = 2166136261;
  for (const character of profile) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  return catalog[hash % catalog.length]!.id;
}

/** Prefer distinct characters over the legacy mirrored pose variants. */
export function randomAvatarId(used: readonly string[], previous?: string, random = Math.random): string {
  const pool = catalog.filter(item => item.atlas).map(item => item.id);
  const available = pool.filter(id => !used.includes(id) && id !== previous);
  const choices = available.length ? available : pool.filter(id => id !== previous);
  return choices[Math.floor(random() * choices.length)]!;
}

export function isHumanAvatarId(value: unknown): value is string {
  return typeof value === 'string' && catalog.some(item => item.id === value && item.humanAtlas);
}
export function randomHumanAvatarId(used: readonly string[]): string {
  const pool = catalog.filter(item => item.humanAtlas).map(item => item.id);
  const available = pool.filter(id => !used.includes(id));
  const choices = available.length ? available : pool;
  return choices[Math.floor(Math.random() * choices.length)]!;
}
export function isCoordinatorProfile(profile: { workbench?: { groups: Record<string, { role?: string }> } }): boolean {
  return Object.values(profile.workbench?.groups ?? {}).some(group => group.role === 'coordinator');
}
