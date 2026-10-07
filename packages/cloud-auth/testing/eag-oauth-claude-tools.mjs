import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
// Drives the real CLI deterministically without an external model call.
// Prerequisite: browser OAuth login and seeded Goal/Task/Occurrence IDs.
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const ids = JSON.parse(readFileSync(required('EAG_FIXTURE_IDS_FILE')));
const resource = required('EAG_RESOURCE_URL');
const reportDir = required('EAG_REPORT_DIR');
const configDir = required('EAG_CLAUDE_CONFIG_DIR');
const binary = required('EAG_CLAUDE_NATIVE_BIN');
const steps = [
  ['goal_search', { query: 'OAuth acceptance' }],
  ['goal_get', { id: ids.goal }],
  ['task_plan_search', { query: 'OAuth acceptance' }],
  ['task_plan_get', { id: ids.plan }],
  [
    'task_occurrence_list',
    { startDate: Date.parse('2026-11-01T00:00:00Z'), endDate: Date.parse('2026-11-01T23:59:59Z') },
  ],
  ['task_occurrence_get', { id: ids.occurrence }],
];
const checks = [];
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!req.url.startsWith('/v1/messages')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
    return;
  }
  const input = JSON.parse(Buffer.concat(chunks).toString());
  if (req.url.includes('count_tokens')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"input_tokens":100}');
    return;
  }
  const results = (input.messages ?? [])
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((x) => x.type === 'tool_result');
  const index = results.length;
  if (results.some((r) => r.is_error)) {
    console.error('CLI tool returned error', JSON.stringify(results.at(-1)).slice(0, 800));
    process.exitCode = 1;
  }
  if (index > checks.length) checks.push(steps[index - 1][0]);
  const step = steps[index];
  const name = step && (input.tools ?? []).find((t) => t.name.endsWith('__' + step[0]))?.name;
  if (step && !name) {
    console.error(
      'MCP tool missing',
      step[0],
      (input.tools ?? []).map((t) => t.name),
    );
    process.exitCode = 1;
  }
  const block =
    step && name
      ? { type: 'tool_use', id: `toolu_fixture_${index}`, name, input: step[1] }
      : { type: 'text', text: 'Six read tool calls completed.' };
  const message = {
    id: `msg_fixture_${index}`,
    type: 'message',
    role: 'assistant',
    model: input.model,
    content: [block],
    stop_reason: block.type === 'tool_use' ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
  if (!input.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(message));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const event = (type, data) =>
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  event('message_start', {
    message: {
      ...message,
      content: [],
      stop_reason: null,
      usage: { input_tokens: 100, output_tokens: 0 },
    },
  });
  event('content_block_start', {
    index: 0,
    content_block: block.type === 'tool_use' ? { ...block, input: {} } : { type: 'text', text: '' },
  });
  event('content_block_delta', {
    index: 0,
    delta:
      block.type === 'tool_use'
        ? { type: 'input_json_delta', partial_json: JSON.stringify(block.input) }
        : { type: 'text_delta', text: block.text },
  });
  event('content_block_stop', { index: 0 });
  event('message_delta', {
    delta: { stop_reason: message.stop_reason, stop_sequence: null },
    usage: { output_tokens: 50 },
  });
  event('message_stop', {});
  res.end();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const child = spawn(
  binary,
  [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--model',
    'claude-sonnet-4-6',
    '--tools',
    'Read',
    '--allowedTools',
    'mcp__eag_read_oauth__*',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--mcp-config',
    JSON.stringify({ mcpServers: { eag_read_oauth: { type: 'http', url: resource } } }),
    '--',
    'Exercise the six MemoFlow read tools for the acceptance fixture.',
  ],
  {
    cwd: reportDir,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      ANTHROPIC_AUTH_TOKEN: 'local-fixture-only',
      ANTHROPIC_API_KEY: 'local-fixture-only',
      ENABLE_TOOL_SEARCH: 'false',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '',
  errors = '';
child.stdout.on('data', (b) => (output += b));
child.stderr.on('data', (b) => (errors += b));
const timer = setTimeout(() => child.kill(), 60000);
const [code] = await once(child, 'exit');
clearTimeout(timer);
server.close();
writeFileSync(`${reportDir}/claude-tool-output.log`, output, { mode: 0o600 });
const passed = code === 0 && checks.length === 6 && !process.exitCode;
writeFileSync(
  `${reportDir}/claude-tools.json`,
  JSON.stringify({
    passed,
    checks,
    profile: 'Claude Code CLI with deterministic local model fixture; real OAuth/MCP/owner/PG',
  }),
);
console.log({ code, passed, checks, errors: errors.slice(-300) });
if (!passed) process.exitCode = 1;
