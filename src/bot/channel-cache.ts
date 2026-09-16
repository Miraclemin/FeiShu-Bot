import type { LarkChannelOptions } from '@larksuite/channel';

/** SDK defaults share a process-wide cache, including message IDs across bots. */
export function createChannelCache(): NonNullable<LarkChannelOptions['cache']> {
  const namespaces = new Map<string, Map<string | Symbol, { value: unknown; expires?: number }>>();
  return {
    async set(key, value, expire, options) {
      const namespace = options?.namespace ?? '';
      let entries = namespaces.get(namespace);
      if (!entries) { entries = new Map(); namespaces.set(namespace, entries); }
      const now = Date.now();
      for (const [id, entry] of entries) if (entry.expires !== undefined && entry.expires <= now) entries.delete(id);
      entries.set(key, { value, expires: expire });
      // Bound in-memory history; SDK keeps its own hot dedup tier as well.
      if (entries.size > 20000) entries.delete(entries.keys().next().value!);
      return true;
    },
    async get(key, options) {
      const entries = namespaces.get(options?.namespace ?? '');
      const entry = entries?.get(key);
      if (entry?.expires !== undefined && entry.expires <= Date.now()) { entries?.delete(key); return undefined; }
      return entry?.value;
    },
  };
}
