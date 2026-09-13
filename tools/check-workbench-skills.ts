import { discoverSkills, codexSkillRuntime, externalSkillRuntime } from '../src/agent/workbench-skills';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
const all = discoverSkills(process.cwd());
console.log('Discovered skill count:', all.length);
const r = codexSkillRuntime(all, homedir() + '/.codex', true);
try {
  const out = execFileSync('codex', ['debug', 'prompt-input', 'test'], { env: { ...process.env, ...r.env }, encoding: 'utf8', maxBuffer: 8000000 });
  console.log('Native skill heading:', out.includes('Available skills'));
  console.log('Unselected catalog paths:', all.filter(s => out.includes(s.path)).length);
} finally { r.cleanup(); }
const h = externalSkillRuntime('hermes', process.cwd());
try {
  const out = execFileSync(homedir() + '/.hermes/hermes-agent/venv/bin/python', ['-c', 'from agent.prompt_builder import build_skills_system_prompt; s=build_skills_system_prompt(); print(len(s or ""))'], { cwd: homedir() + '/.hermes/hermes-agent', env: { ...process.env, ...h.env }, encoding: 'utf8' });
  console.log('Hermes native skill prompt length:', out.trim());
} finally { h.cleanup(); }
const o = externalSkillRuntime('openclaw', process.cwd());
try {
  const out = execFileSync('openclaw', ['config', 'validate'], { env: { ...process.env, ...o.env }, encoding: 'utf8' });
  console.log('OpenClaw scoped config:', out.trim());
} finally { o.cleanup(); }
