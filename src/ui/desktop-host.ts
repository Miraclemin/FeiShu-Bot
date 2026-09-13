import { mkdir } from 'node:fs/promises';
import { resolveAppPaths } from '../config/app-paths';
import { Supervisor } from '../runtime/supervisor';
import { startUiServer } from './server';
import pkg from '../../package.json';
export async function startDesktopHost(rootDir: string) {
  await mkdir(rootDir, { recursive: true, mode: 0o700 });
  process.env.LARK_CHANNEL_HOME = rootDir;
  const paths = resolveAppPaths({ rootDir });
  const supervisor = new Supervisor({ rootDir, configPath: paths.configFile });
  const ui = await startUiServer({ supervisor, rootDir, version: pkg.version });
  return { url: ui.url, close: async () => { await supervisor.shutdown(); await ui.close(); } };
}
