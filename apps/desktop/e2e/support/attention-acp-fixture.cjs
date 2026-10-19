#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

// Test-only DSH/Antigravity ACP JSON-RPC peer. Never connects to a model or the network.
// Production Desktop does not load this file. A test-owned isolated executable
// path is passed through the same public Native Connection IPC as user settings.
if (process.env.MEMOFLOW_ATTENTION_QA_FIXTURE !== '1') process.exit(88);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  let newline;
  while ((newline = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, newline).trim();
    input = input.slice(newline + 1);
    if (!line) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      process.exitCode = 1;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(request, 'id')) continue;
    let result;
    if (request.method === 'initialize') {
      result = {
        protocolVersion: 1,
        agentInfo: { version: '1.0.0' },
        agentCapabilities: { mcpCapabilities: { http: true }, sessionCapabilities: { resume: {} } },
      };
    } else if (request.method === 'authenticate' || request.method === 'session/close') {
      result = {};
    } else if (request.method === 'session/new' || request.method === 'session/resume') {
      result = {
        sessionId: 'memoflow-attention-qa-session',
        modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }] },
        configOptions: [
          {
            id: 'model',
            type: 'select',
            currentValue: 'attention-qa-model',
            options: [{ value: 'attention-qa-model', name: 'Offline Attention Fixture' }],
          },
        ],
      };
    } else if (request.method === 'session/prompt') {
      if (process.env.MEMOFLOW_ATTENTION_QA_PROMPT_LOG)
        fs.appendFileSync(process.env.MEMOFLOW_ATTENTION_QA_PROMPT_LOG, '1');
      // Deliberately simulate transport-level native ACP errors after a real
      // Desktop assistant.run.started. These are NOT real upstream responses.
      // A diagnostic marker must NEVER be forwarded to UI events or storage.
      const mode = process.env.MEMOFLOW_ATTENTION_QA_FAILURE;
      if (mode === 'success') {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'memoflow-attention-qa-session',
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: 'Offline AGY response' },
              },
            },
          }) + '\n',
        );
        process.stdout.write(
          JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { stopReason: 'end_turn' } }) +
            '\n',
        );
        continue;
      }
      const error =
        mode === 'rate_limited'
          ? { code: 429, message: 'Too Many Requests PRIVATE_ACP_QA_DIAGNOSTIC' }
          : mode === 'quota_exhausted'
            ? { code: -32001, message: '429 insufficient_quota PRIVATE_ACP_QA_DIAGNOSTIC' }
            : { code: -32001, message: 'Offline QA fixture: execution unavailable' };
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error }) + '\n');
      continue;
    } else {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: 'Fixture only: method unsupported' },
        }) + '\n',
      );
      continue;
    }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
  }
});
