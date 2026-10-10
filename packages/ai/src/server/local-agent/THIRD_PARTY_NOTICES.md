# Local Agent adapter sources

The Codex adapter protocol lifecycle is adapted from T3 Code at `ec80933ac8cd02fec5c97b342462ccc9567cdb1e`, especially `packages/effect-codex-app-server/src/client.ts` and `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts`. MemoFlow uses its own bounded Node stdio transport and does not embed the T3 or Effect runtime.

Upstream: https://github.com/pingdotgg/t3code/tree/ec80933ac8cd02fec5c97b342462ccc9567cdb1e

Claude initialization, scoped MCP and permission mapping were checked against
`apps/server/src/provider/ClaudeProvider.ts`, `Drivers/ClaudeExecutable.ts`, and
`orchestration-v2/Adapters/ClaudeAdapterV2.ts` at the same revision. MemoFlow uses
`@anthropic-ai/claude-agent-sdk` 0.3.295 with a user-installed CLI; the SDK's own
license and terms are at https://code.claude.com/docs/en/legal-and-compliance.

Pi RPC and session extension behavior were checked against
`packages/provider-pi/src/server` at that revision and the installed
`@earendil-works/pi-coding-agent` 1.0.3 documentation (`rpc.md`, `json.md`,
`rpc-extension-ui.md`, `extensions.md`). The native Pi MCP extension API requires
Pi 0.99 or newer. Pi is not bundled or globally modified by MemoFlow.

MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
