import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/u;
const ZERO = /^0{40}$/u;

async function localGit(args) {
  const { stdout } = await exec('git', args, { maxBuffer: 512 * 1024, timeout: 60_000 });
  return stdout.trim();
}

export async function ensureChangesRange({ base, head, pullRequest = false, git = localGit } = {}) {
  if (!SHA.test(head ?? '')) throw new Error('Changes requires immutable head SHA');
  if (!base || ZERO.test(base)) return { fetched: false, shallowExpanded: false };
  if (!SHA.test(base)) throw new Error('Changes requires immutable base SHA');
  const exists = async (sha) => {
    try {
      await git(['cat-file', '-e', `${sha}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  };
  if (!(await exists(head))) throw new Error('Changes head is missing from checkout');
  let fetched = false;
  if (!(await exists(base))) {
    await git(['fetch', '--no-tags', '--depth=2', 'origin', base]);
    fetched = true;
  }
  if (!(await exists(base))) throw new Error('Changes base is unavailable after fetch');
  let shallowExpanded = false;
  if (pullRequest) {
    const mergeBase = async () => {
      try {
        await git(['merge-base', base, head]);
        return true;
      } catch {
        return false;
      }
    };
    if (!(await mergeBase())) {
      const shallow = (await git(['rev-parse', '--is-shallow-repository'])) === 'true';
      if (!shallow) throw new Error('Changes PR base/head have no common ancestor');
      await git(['fetch', '--no-tags', '--unshallow', 'origin']);
      shallowExpanded = true;
      if (!(await mergeBase())) throw new Error('Changes PR ancestry still unavailable');
    }
  }
  return { fetched, shallowExpanded };
}
