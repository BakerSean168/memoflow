// Calls the real Codex CLI's native MCP control API, without starting a model turn.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const ids = JSON.parse(readFileSync(required('EAG_FIXTURE_IDS_FILE')));
const resource = required('EAG_RESOURCE_URL');
const reportDir = required('EAG_REPORT_DIR');
const child = spawn(
  'codex',
  ['-c', `mcp_servers={eag_read_oauth={url=${JSON.stringify(resource)}}}`, 'app-server', '--stdio'],
  { stdio: ['pipe', 'pipe', 'ignore'] },
);
const pending = new Map();
let sequence = 0;
createInterface({ input: child.stdout }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.id == null || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
child.on('exit', () => {
  for (const request of pending.values()) request.reject(new Error('Codex exited'));
  pending.clear();
});
const timeout = setTimeout(() => child.kill(), 60000);
try {
  await rpc('initialize', {
    clientInfo: { name: 'eag-acceptance', version: '1' },
    capabilities: { experimentalApi: true },
  });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  const started = await rpc('thread/start', {
    cwd: reportDir,
    ephemeral: true,
    approvalPolicy: 'never',
    sandbox: 'read-only',
  });
  const threadId = started.thread.id;
  const status = await rpc('mcpServerStatus/list', { threadId, serverName: 'eag_read_oauth' });
  if (status.data[0]?.runtimeStatus !== 'connected') throw new Error('MCP server is not connected');
  const checks = [];
  async function call(tool, args) {
    const result = await rpc('mcpServer/tool/call', {
      threadId,
      server: 'eag_read_oauth',
      tool,
      arguments: args,
    });
    if (result.isError) throw new Error(`${tool} failed`);
    checks.push(tool);
    return result.structuredContent;
  }
  await call('goal_search', { query: 'OAuth acceptance' });
  await call('goal_get', { id: ids.goal });
  await call('task_plan_search', { query: 'OAuth acceptance' });
  await call('task_plan_get', { id: ids.plan });
  const occurrences = await call('task_occurrence_list', {
    startDate: Date.parse('2026-11-01T00:00:00Z'),
    endDate: Date.parse('2026-11-01T23:59:59Z'),
  });
  await call('task_occurrence_get', { id: occurrences.items[0].id });
  const evidence = { checks, profile: 'Codex app-server native tool call', passed: true };
  writeFileSync(`${reportDir}/codex-tools.json`, JSON.stringify(evidence));
  console.log(evidence);
} finally {
  clearTimeout(timeout);
  child.kill();
}
