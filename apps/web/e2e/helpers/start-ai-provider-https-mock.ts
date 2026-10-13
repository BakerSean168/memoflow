import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';

const port = Number(process.env.E2E_AI_PROVIDER_PORT ?? '58103');
const certPath = process.env.E2E_AI_PROVIDER_TLS_CERT;
const keyPath = process.env.E2E_AI_PROVIDER_TLS_KEY;
const acceptedKeyFile = process.env.E2E_AI_PROVIDER_ACCEPTED_KEY_FILE;

if (!certPath || !keyPath || !acceptedKeyFile) {
  throw new Error('E2E AI Provider HTTPS mock requires TLS cert/key and accepted-key file');
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function acceptedKeys(): Set<string> {
  return new Set(
    readFileSync(acceptedKeyFile, 'utf8')
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function authorized(request: IncomingMessage): boolean {
  const authorization = request.headers.authorization ?? '';
  if (!authorization.startsWith('Bearer ')) return false;
  return acceptedKeys().has(authorization.slice('Bearer '.length));
}

const server = createServer(
  {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  },
  async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      sendJson(response, 200, { status: 'ok', scheme: 'https' });
      return;
    }

    if (!authorized(request)) {
      sendJson(response, 401, { error: { message: 'Invalid E2E provider key' } });
      return;
    }

    if (request.method === 'GET' && request.url === '/v1/models') {
      sendJson(response, 200, {
        object: 'list',
        data: [
          {
            id: 'e2e-model-alpha',
            name: 'E2E Model Alpha',
            context_length: 32768,
            pricing: { prompt: '0.000001', completion: '0.000002' },
          },
          {
            id: 'e2e-model-beta',
            name: 'E2E Model Beta',
            context_length: 65536,
            pricing: { prompt: '0.000003', completion: '0.000004' },
          },
        ],
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      const body = await readJson(request);
      const model = typeof body.model === 'string' ? body.model : 'e2e-model-alpha';
      if (body.stream === true) {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        });
        const base = {
          id: `chatcmpl-e2e-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
        };
        for (const [delta, finishReason] of [
          [{ role: 'assistant', content: `E2E provider connection OK (${model})` }, null],
          [{}, 'stop'],
        ])
          response.write(
            `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`,
          );
        response.end('data: [DONE]\n\n');
        return;
      }
      sendJson(response, 200, {
        id: `chatcmpl-e2e-provider-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: `E2E provider connection OK (${model})` },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
      });
      return;
    }

    sendJson(response, 404, { error: { message: 'Unknown E2E AI Provider route' } });
  },
);

server.listen(port, '127.0.0.1', () => {
  console.log(`[ai-provider-https-mock] listening on https://127.0.0.1:${port}`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
