// Route-level fake for the two GitHub REST "compare" operations.
//
// Octokit resolves a request URL from the operation's route template, not from
// the JavaScript method name. The two operations this repository depends on are:
//
//   repos.compareCommits            GET /repos/{owner}/{repo}/compare/{base}...{head}
//   repos.compareCommitsWithBasehead GET /repos/{owner}/{repo}/compare/{basehead}
//
// Templates are copied verbatim from the Octokit REST endpoint definitions for
// those operations (@octokit/plugin-rest-endpoint-methods / @octokit/openapi-types).
// The repository deliberately carries no runtime Octokit dependency (the release
// control plane only runs inside `actions/github-script`), so the templates are
// restated here instead of imported.
//
// Octokit expands `{placeholder}` from the merged parameter bag and leaves a
// missing placeholder empty rather than validating it. Passing `basehead` to
// `compareCommits` therefore produced GET /repos/{owner}/{repo}/compare/... and
// an HTTP 404 (run 40638034477). The fakes below resolve the URL first and then
// derive the response from the *resolved* URL, so a wrong adapter shows up as a
// wrong route instead of a passing test.

const SHA_RE = /^[0-9a-f]{40}$/u;
const COMPARE_PATH = /^\/repos\/([^/]+)\/([^/]+)\/compare\/(.+)\.\.\.(.+)$/u;

export const COMPARE_ROUTES = {
  compareCommits: {
    method: 'GET',
    path: '/repos/{owner}/{repo}/compare/{base}...{head}',
    parameters: ['owner', 'repo', 'base', 'head'],
  },
  compareCommitsWithBasehead: {
    method: 'GET',
    path: '/repos/{owner}/{repo}/compare/{basehead}',
    parameters: ['owner', 'repo', 'basehead'],
  },
};

export function httpError(status, message) {
  const error = new Error(message ?? 'HTTP ' + status);
  error.name = 'HttpError';
  error.status = status;
  return error;
}

// Mirrors @octokit/endpoint: expand placeholders, leave absent ones empty.
export function resolveCompareRoute(adapter, params = {}) {
  const route = COMPARE_ROUTES[adapter];
  if (!route) throw new Error('unknown compare adapter: ' + adapter);
  const expanded = [];
  const url = route.path.replace(/\{(\w+)\}/gu, (_, key) => {
    expanded.push(key);
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
  return {
    method: route.method,
    url,
    missing: route.parameters.filter(
      (key) => !expanded.includes(key) || params[key] === undefined || params[key] === null,
    ),
  };
}

export function parseComparePath(url) {
  const match = COMPARE_PATH.exec(url);
  if (!match) return null;
  return { owner: match[1], repo: match[2], base: match[3], head: match[4] };
}

export function compareUrl(owner, repo, base, head) {
  return `/repos/${owner}/${repo}/compare/${base}...${head}`;
}

function commonAncestorIndex(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index - 1;
}

// Linear commit graph. Each chain is ordered oldest -> newest and chains share
// their root, which is enough to produce identical/ahead/behind/diverged.
// `refs` maps a non-SHA ref (tag, branch) to a commit in the graph.
export function createAncestry({ chains, refs = {} }) {
  const position = new Map();
  chains.forEach((chain, chainIndex) => {
    chain.forEach((sha, index) => {
      if (!SHA_RE.test(sha)) throw new Error('ancestry fixture requires full SHAs: ' + sha);
      position.set(sha, { chainIndex, index, chain });
    });
  });
  const resolve = (ref) =>
    position.has(ref) ? ref : Object.hasOwn(refs, ref) ? refs[ref] : undefined;
  const locate = (ref) => {
    const sha = resolve(ref);
    return sha === undefined ? null : (position.get(sha) ?? null);
  };
  return {
    has: (ref) => locate(ref) !== null,
    compare(baseRef, headRef) {
      const base = locate(baseRef);
      const head = locate(headRef);
      if (!base || !head) throw httpError(404, 'Not Found');
      const shape = (ahead, behind) => ({
        status:
          ahead > 0 && behind > 0
            ? 'diverged'
            : ahead > 0
              ? 'ahead'
              : behind > 0
                ? 'behind'
                : 'identical',
        ahead_by: ahead,
        behind_by: behind,
        total_commits: ahead + behind,
      });
      if (base.chainIndex === head.chainIndex) {
        const delta = head.index - base.index;
        return shape(Math.max(delta, 0), Math.max(-delta, 0));
      }
      const common = commonAncestorIndex(base.chain, head.chain);
      if (common < 0) throw httpError(404, 'No common ancestor');
      return shape(head.index - common, base.index - common);
    },
  };
}

// Installs both compare adapters onto an existing `github.rest.repos` object and
// returns the call log. `errors` injects a transport failure per adapter.
export function installCompareRoutes(repos, { ancestry, errors = {}, calls = [] } = {}) {
  if (!ancestry) throw new Error('ancestry fixture is required');
  const install =
    (adapter) =>
    async (params = {}) => {
      const route = resolveCompareRoute(adapter, params);
      calls.push({ adapter, ...route, params });
      if (errors[adapter]) throw errors[adapter];
      const parsed = parseComparePath(route.url);
      if (!parsed) throw httpError(404, 'Not Found');
      return { data: ancestry.compare(parsed.base, parsed.head) };
    };
  repos.compareCommits = install('compareCommits');
  repos.compareCommitsWithBasehead = install('compareCommitsWithBasehead');
  return calls;
}
