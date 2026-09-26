import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
export const SCOPE_VERSION = 1;

export function createNxShowProjectsInvocation(args, cwd) {
  const root = path.resolve(cwd);
  const nxCli = require.resolve('nx/bin/nx.js', { paths: [root] });
  return {
    command: process.execPath,
    args: [nxCli, 'show', 'projects', ...args, '--json'],
    bootstrap: path.join(root, 'tools/ci/node-process-bootstrap.cjs'),
  };
}

async function nxProjects(args, cwd) {
  const invocation = createNxShowProjectsInvocation(args, cwd);
  try {
    const { stdout } = await exec(invocation.command, invocation.args, {
      cwd,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${invocation.bootstrap}`.trim(),
      },
    });
    const projects = JSON.parse(stdout);
    if (!Array.isArray(projects) || !projects.every((project) => typeof project === 'string')) {
      throw new Error('Nx returned an invalid project list');
    }
    return projects.sort();
  } catch (error) {
    const detail = [error?.stderr, error?.stdout]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
      .join('\n')
      .slice(0, 4000);
    throw new Error(
      `Nx project scope query failed (${args.join(' ')}): ${detail || error?.message || 'unknown error'}`,
      { cause: error },
    );
  }
}

export async function detectScope({
  root = process.cwd(),
  base = process.env.NX_BASE,
  head = process.env.NX_HEAD,
  full = false,
} = {}) {
  const common = full
    ? []
    : ['--affected', ...(base && head ? [`--base=${base}`, `--head=${head}`] : [])];
  const projects = await nxProjects(common, root);
  const target = async (name) => nxProjects([...common, `--with-target=${name}`], root);
  const [unit, coverage, smoke, integration, boundary, perf] = await Promise.all([
    target('test'),
    target('test:coverage'),
    target('test:smoke'),
    target('test:integration'),
    target('test:boundary'),
    target('test:perf'),
  ]);
  const webFlow = projects.some((project) => ['web', 'api'].includes(project));
  const desktopFlow = projects.includes('desktop');
  return {
    version: SCOPE_VERSION,
    base: base ?? null,
    head: head ?? null,
    full,
    projects,
    unit,
    coverage,
    smoke,
    integration,
    boundary,
    perf,
    webFlow,
    desktopFlow,
  };
}
