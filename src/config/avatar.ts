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
