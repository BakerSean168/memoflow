// Deterministic Pi RPC peer. Runs the actual generated production tool_call extension
// against a real bounded command; no inference, credentials, or persistent profile.
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
let answer;
const handlers = {};
const extension = import(pathToFileURL(process.argv[2])).then((module) =>
  module.default({
    registerMcpServer() {},
    unregisterMcpServer() {},
    on(name, handler) {
      handlers[name] = handler;
    },
  }),
);
require('node:readline')
  .createInterface({ input: process.stdin })
  .on('line', async (line) => {
    const frame = JSON.parse(line);
    const reply = (data) =>
      send({ type: 'response', id: frame.id, command: frame.type, success: true, data });
    if (frame.type === 'get_state') reply({ sessionId: 'native-861' });
    else if (frame.type === 'get_available_models')
      reply({ models: [{ id: 'model', name: 'Acceptance', provider: 'fixture' }] });
    else if (frame.type === 'set_model') reply({});
    else if (frame.type === 'extension_ui_response') {
      answer?.(frame.confirmed);
    } else if (frame.type === 'prompt') {
      reply({});
      await extension;
      const result = await handlers.tool_call(
        {
          toolName: 'bash',
          input: { command: 'node -e console.log("runtime-861-command-executed")' },
        },
        {
          ui: {
            confirm: (title, message) =>
              new Promise((resolve) => {
                answer = resolve;
                send({
                  type: 'extension_ui_request',
                  id: 'approval',
                  method: 'confirm',
                  title,
                  message,
                });
              }),
          },
        },
      );
      if (!result?.block) {
        const output = execFileSync(
          process.execPath,
          ['-e', 'console.log("runtime-861-command-executed")'],
          { encoding: 'utf8' },
        );
        send({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: output },
        });
      }
      send({ type: 'agent_settled' });
    }
  });
