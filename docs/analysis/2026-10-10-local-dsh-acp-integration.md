# DSH ACP as a first-class local Agent (2026-10-10)

## Decision and current implementation

T3 Code's working `acpRegistry_dsh` instance uses generic `acpRegistry` with DSH `--profile acp`; don't implement DSH `headless --json` as a fourth unrelated runtime. This implementation adds `dsh` as a distinct, persistent MemoFlow BYOA driver while extending the existing shared `NativeRpcTransport` with strictly checked ACP JSON-RPC 2.0 envelopes. No additional Agent loop, cloud provider key store or commercial relay is included.

### Actual wire path

`local_agent` conversation -> `LocalAgentRuntime` -> `DshDriver` -> locally installed DSH executable `--profile acp` -> stdio ACP v1 -> `session/new|session/resume` with ephemeral HTTP MCP URL/Bearer grant -> `session/set_config_option` with opaque exact model ID -> `session/prompt` -> ordered `session/update` -> existing MemoFlow AssistantRuntime events / locally owned persistence. `session/request_permission` requests are bridged to existing per-run user approval cards; `session/cancel` and `session/close` clean up the process. The existing Profile switch/revoke fence and the owner-bound Goal/Task/Knowledge implementation are not changed.

DSH ACP model choice is **not** a normal model Provider record. DSH itself owns its provider/model routing, saved session, and authentication. Its ACP `model` configuration option uses opaque JSON-encoded `['provider','model']` values; MemoFlow presents these unchanged and verifies the exact selected model before prompting. A nonexistent or unselected model fails closed, never falls back to a commercial route.

DSH is a named fourth Agent option in desktop Local Agent Settings. The homePath setting selects an existing DSH_HOME; it is not an API key field. ACP availability is optional, and clients without DSH installed must remain usable. Windows `.cmd` paths are resolved to installed DSH npm JS without executing a shell shim.

### Boundaries and caveats

- The generic ACP protocol framing is reusable. DSH's launch flags and model catalog mapping remain driver-specific; additional ACP Agent discovery/installers and capability registries are **not** implemented here.
- Native MCP write tools still require the existing MemoFlow write-scopes and transactional authorization, regardless of what the Agent requests. Non-MemoFlow tool permission is an explicit one-time user decision, not a durable grant.
- ACP native list/resume are supported by DSH's runtime, but UI load/delete management is **not** advertised. No cloud export of native session checkpoints or DSH credentials.
- The live GCP DSH profile routes through the operator's model gateway. It was **not** used for inference here. All current DSH protocol tests use an isolated fake Agent and an authenticated real MemoFlow MCP Goal backing store. No AnyRouter/4Router/commercial inference was made.
- A real Ollama Free test requires a **separately configured DSH_HOME** that contains only an Ollama Cloud route, and `MEMOFLOW_DSH_MODEL` must exactly match `JSON.stringify(['ollama', 'gpt-oss:20b'])` or another Ollama starter model present in that ACP catalog. The opt-in real-CLI test explicitly refuses to run without an absolute `MEMOFLOW_DSH_HOME` and an `ollama` route; the normal test run always skips live CLIs.
- ACP initialization without prompting is not evidence of a working authenticated model route. Ollama free model access and usage limits are account specific. No auto probing or periodic inference calls have been added.
- The system still does not prove real DSH/Claude two-turn model inference on Ollama; this is a release gate and not a claim of full acceptance.

### Verification commands (GCP Dev, DSH worktree)

```bash
pnpm exec vitest run src/server/local-agent/dsh-driver.spec.ts src/server/local-agent/native-rpc-transport-acp.spec.ts src/server/local-agent/native-identity.spec.ts --config packages/ai/vitest.config.ts
pnpm exec vitest run src/main/modules/ai/local-agent-tools.spec.ts --config apps/desktop/vitest.config.ts
pnpm exec nx run ai:typecheck --skip-nx-cache
pnpm exec nx run app-vue:typecheck --skip-nx-cache
pnpm exec nx run desktop:typecheck --skip-nx-cache
```

The Desktop test includes a **real stdio ACP child process -> real MemoFlow MCP localhost endpoint -> real owned Goal database query -> persisted two-turn native session** test with zero LLM calls. Real DSH CLI 2-turn is opt-in with `MEMOFLOW_REAL_DSH=1`, `MEMOFLOW_DSH_HOME=/absolute/isolated/home`, `MEMOFLOW_DSH_MODEL='["ollama","gpt-oss:20b"]'`, and a locally provisioned Ollama-only DSH profile. Do not run it against the existing operator T3 DSH commercial model-gateway wrapper or default DSH_HOME.

### Source references

- DSH ACP: https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/acp/acp
- T3 Code reusable registry: https://github.com/pingdotgg/t3code/tree/main/packages/provider-acp-registry
- Parent BYOA PR: https://github.com/BakerSean168/memoflow/pull/439
- DSH feature issue: https://github.com/BakerSean168/memoflow/issues/440
