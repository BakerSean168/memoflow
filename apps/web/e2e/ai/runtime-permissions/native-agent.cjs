// Deterministic native protocol peer. Executes a real, bounded command only after approval.
// No provider credentials, production data, or persistent native profiles.
const { execFileSync } = require('node:child_process');
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
let turn = 0;
const finish = () => {
  const output = execFileSync(process.execPath, ['-e', 'console.log("runtime-861-command-executed")'], { encoding: 'utf8' });
  send({ method: 'item/agentMessage/delta', params: { threadId: 'native-861', turnId: 'turn-' + turn, itemId: 'msg', delta: output } });
  send({ method: 'turn/completed', params: { threadId: 'native-861', turn: { id: 'turn-' + turn, status: 'completed' } } });
};
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const frame = JSON.parse(line);
  const reply = (result) => send({ id: frame.id, result });
  if (frame.method === 'initialize') reply({ userAgent: 'codex-cli/0.166.0' });
  else if (frame.method === 'account/read') reply({ account: { type: 'chatgpt', email: 'fixture@example.test', planType: 'team' }, requiresOpenaiAuth: true });
  else if (frame.method === 'thread/start' || frame.method === 'thread/resume') reply({ thread: { id: 'native-861' } });
  else if (frame.method === 'turn/start') {
    turn++;
    reply({ turn: { id: 'turn-' + turn } });
    send({ method: 'turn/started', params: { threadId: 'native-861', turn: { id: 'turn-' + turn } } });
    if (frame.params.approvalPolicy === 'never') finish();
    else send({ id: 900, method: 'item/commandExecution/requestApproval', params: { threadId: 'native-861', turnId: 'turn-' + turn, itemId: 'cmd', command: 'node -e console.log("runtime-861-command-executed")' } });
  } else if (frame.id === 900 && frame.result?.decision === 'accept') {
    send({ method: 'serverRequest/resolved', params: { threadId: 'native-861', requestId: 900 } });
    finish();
  }
});
