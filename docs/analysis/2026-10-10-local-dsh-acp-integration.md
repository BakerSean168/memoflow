# DSH ACP as a first-class local Agent (2026-10-10)

## Decision and current implementation

T3 Code's working `acpRegistry_dsh` instance uses generic `acpRegistry` with DSH `--profile acp`; don't implement DSH `headless --json` as a fourth unrelated runtime. This implementation adds `dsh` as a distinct, persistent MemoFlow BYOA driver while extending the existing shared `NativeRpcTransport` with strictly checked ACP JSON-RPC 2.0 envelopes. No additional Agent loop, cloud provider key store or commercial relay is included.

### Actual wire path

`local_agent` conversation -> `LocalAgentRuntime` -> `DshDriver` -> locally installed DSH executable `--profile acp` -> stdio ACP v1 -> `session/new|session/resume` with ephemeral HTTP MCP URL/Bearer grant -> `session/set_config_option` with opaque exact model ID -> `session/prompt` -> ordered `session/update` -> existing MemoFlow AssistantRuntime events / locally owned persistence. `session/request_permission` requests are bridged to existing per-run user approval cards; `session/cancel` and `session/close` clean up the process. The existing Profile switch/revoke fence and the owner-bound Goal/Task/Knowledge implementation are not changed.

DSH ACP model choice is **not** a normal model Provider record. DSH itself owns its provider/model routing, saved session, and authentication. Its ACP `model` configuration option uses opaque JSON-encoded `['provider','model']` values; MemoFlow presents these unchanged and verifies the exact selected model before prompting. A nonexistent or unselected model fails closed, never falls back to a commercial route.

DSH is a named fourth Agent option in desktop Local Agent Settings. The homePath setting selects an existing DSH_HOME; it is not an API key field. ACP availability is optional, and clients without DSH installed must remain usable. Windows `.cmd` paths are resolved to installed DSH npm JS without executing a shell shim.

### Boundaries and caveats

- The generic ACP protocol framing is reusable. DSH's launch flags and model catalog mapping remain driver-specific; additional ACP Agent installers or capability registries are not implemented.
- Native MCP write tools still require the existing MemoFlow write-scopes and transactional authorization. Non-MemoFlow tool permission remains an explicit one-time user decision.
- DSH ACP native list/resume are supported, but UI load/delete of DSH checkpoints is not advertised. There is no cloud export of native sessions or credentials.
- The existing GCP DSH/T3 Code profiles use the operator's commercial model gateway. **Neither was used for this live test.** Protocol fixtures additionally exercise a fake ACP child and a real authenticated MemoFlow Goal backing store.
- **2026-10-10 GCP Dev live acceptance:** DSH 0.2.0-rc.2 was launched from its official CLI with a fresh temporary DSH_HOME, no inherited commercial provider credentials, default provider/model forced to `ollama` / `gpt-oss:20b`, and the API endpoint fixed to `https://ollama.com/v1`. A 0600 Ollama key file was used without passing the key in any CLI argument or repository file. ACP produced `mcp__memoflow__goal_search` activities in **both turns**, two `assistant.run.completed` events, and retained the same native session ID. The real Desktop test file **passed** (1 file, 32.17 s), and the launcher exited 0 with a no-commercial-fallback marker. The temporary profile was deleted after the run.
- This is a successful real DSH inference acceptance for **one Linux/Ollama Cloud model route**, not proof of arbitrary third-party ACP agents, other provider stability, a Windows DSH inference session, or production deployment. Free account quotas are controlled by Ollama; no periodic inference/probing was added.

### Verification commands (GCP Dev, DSH worktree)

```bash
pnpm exec vitest run src/server/local-agent/dsh-driver.spec.ts src/server/local-agent/native-rpc-transport-acp.spec.ts src/server/local-agent/native-identity.spec.ts --config packages/ai/vitest.config.ts
pnpm exec vitest run src/main/modules/ai/local-agent-tools.spec.ts --config apps/desktop/vitest.config.ts
pnpm exec nx run ai:typecheck --skip-nx-cache
pnpm exec nx run app-vue:typecheck --skip-nx-cache
pnpm exec nx run desktop:typecheck --skip-nx-cache
```

The Desktop test includes a **real stdio ACP child process -> real MemoFlow MCP localhost endpoint -> real owned Goal database query -> persisted two-turn native session** fixture with zero LLM calls. The verified real DSH test is opt-in through `node scripts/acceptance/ollama-dsh-mcp.mjs` (GCP Dev) after placing a real Ollama Cloud key in `~/.config/memoflow/ollama-cloud.key` with mode 0600, or setting `MEMOFLOW_OLLAMA_KEY_FILE` to an absolute path to such a file. The launcher automatically builds an Ollama-only ephemeral DSH_HOME and requires an official DSH binary; `--check` reads no key and makes no model requests. For manual advanced tests, `MEMOFLOW_REAL_DSH=1`, `MEMOFLOW_DSH_HOME=/absolute/isolated/home`, and `MEMOFLOW_DSH_MODEL='["ollama","gpt-oss:20b"]'` are required. Never run the acceptance against the operator's default commercial DSH/T3 profile.

### Source references

- DSH ACP: https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/acp/acp
- T3 Code reusable registry: https://github.com/pingdotgg/t3code/tree/main/packages/provider-acp-registry
- Parent BYOA PR: https://github.com/BakerSean168/memoflow/pull/439
- DSH feature issue: https://github.com/BakerSean168/memoflow/issues/440
