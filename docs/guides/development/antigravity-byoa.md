---
tags: [guide, ai, desktop, byoa]
description: Configure the official Google Antigravity ACP Agent in MemoFlow Desktop.
created: 2026-10-17T00:00:00Z
updated: 2026-10-19T00:00:00Z
---

# Google Antigravity (AGY) BYOA

Antigravity is a **Desktop native Agent**, alongside Codex, Claude Code, Pi and DSH. It is not a Mastra model service or an API-key proxy. The Web application remains Mastra-only.

## Native prerequisites

Install Google's official **Antigravity ACP server** using an ACP-compatible client or the [official ACP registry](https://github.com/agentclientprotocol/registry/tree/main/antigravity-acp). On Windows, the AGY configuration section in MemoFlow provides a one-click **download link** to Google's versioned x64 ZIP (v1.4.0) and a Registry link for the newest release or other architectures. This opens the system browser; it does not install or run the binary, and does not change any existing native profile. Extract both `agy_acp_server.exe` and `localharness_external.exe` into one directory, then point the connection at the first executable. Keep the server and its bundled native harness together. MemoFlow does not redistribute or silently download Google's proprietary binaries.

The official ACP executable is `agy_acp_server.exe` on Windows and `agy_acp_server.par` on Linux/macOS. It is **different from the `agy` CLI**. An installed or signed-in `agy` CLI does not establish ACP availability.

Complete the official server's Google OAuth login **inside MemoFlow** after saving the program path (see below). MemoFlow starts a temporary official ACP server for that instance, captures the Google authorization URL it emits, and opens it through the system browser on explicit user action. The official server performs the token exchange and writes `acp_token.json` itself; MemoFlow never copies, displays, logs or persists the token. This integration uses the native `oauth-personal` authentication method. Discovery, startup and chat restore still fail closed with a "sign in required" state and never open a browser.

## Configure MemoFlow

Open Settings → AI → Providers, select **Antigravity (AGY)** or add a named Antigravity instance.

Set **Program path** to the official ACP executable. The default command is `agy_acp_server`; on Unix, an installed `.par` executable on PATH is also resolved. Use an absolute path when the client keeps its binaries outside PATH.

Set **Native Home** to the server's `GEMINI_HOME` directory, which is the **parent** of `antigravity-acp/`, not the token file itself. For example, an existing native profile contains `<native-home>/antigravity-acp/acp_token.json`. Select that existing profile rather than moving or pasting its credential files.

Save, then check the connection. MemoFlow reads the model directory and version from the native ACP handshake. Select an actually discovered model in the Composer. No provider URL, API key, guessed model list, or automatic fallback to another Agent is used.

## Sign in with Google

When the instance reports **login required**, the Antigravity section shows **使用 Google 账号登录 / Sign in with Google**.

1. Click the button. MemoFlow starts a temporary official ACP server with this instance's program path, `GEMINI_HOME` and `AGY_ACP_FORCE_FILE_STORAGE=1`, then sends `initialize` and `authenticate({ methodId: 'oauth-personal' })`.
2. The official server publishes a `https://accounts.google.com/...` authorization URL. MemoFlow validates its origin, path, `response_type=code`, single `state`, and a loopback `redirect_uri`, then opens it through the existing external-link surface. If the browser does not open, use **复制登录链接** or select the read-only link field.
3. Finish Google consent in the browser. The official server's own loopback listener receives the callback, exchanges the code, and stores the native token.
4. MemoFlow re-probes the same official ACP connection and only reports success after the account and at least one model are observed. "Browser opened" or "callback returned HTTP 200" is not authentication.

Only one flow runs per Provider instance; the flow expires after five minutes and can be cancelled. **Switch account** starts a new flow. **Sign out** uses the official ACP `logout` capability for that instance only and never deletes the whole `.gemini` directory. A changed `GEMINI_HOME` or account cannot resume a conversation bound to the previous native session, and model visibility is partitioned by the verified account fingerprint.

If the browser runs on another machine (for example over WSL/SSH), expand the redirect-link field and paste the complete loopback callback URL. It is accepted only when its loopback origin, path and `state` match the active flow; duplicate or foreign redirects are rejected without ending the flow.

## Behavior and boundaries

- Discovery uses cached native authentication and does not submit a model prompt.
- Google sign-in is only started by the explicit per-instance action. Refresh, app startup and chat restore never open a browser or start an authorization flow; the login child process and its temporary directory are closed on success, failure, cancel, timeout and app quit.
- Sign-out uses only the official ACP capability and stops conversations that still hold the previous account's session. Credentials remain in the native profile; MemoFlow does not copy, display or log tokens, codes or full callback URLs.
- Model visibility preferences and execution failures are partitioned by native instance and an opaque identity digest. Routine cache rewriting does not reset preferences; changed authorization cannot resume an old account's session.
- The native Agent stays in default per-action permission mode. MemoFlow applies the current turn's explicit permission policy; Antigravity interaction questions remain user-input requests and are never auto-approved as tools.
- Rate-limit and quota errors preserve the selected route and safe recoverable status. There is no automatic retry or implicit paid channel switch.
- Existing MemoFlow native inputs remain text/reference-based. Native protocol capabilities do not silently enable unsupported attachment types in MemoFlow.

Antigravity requires a supported local native runtime. Windows and WSL installations are independent; a Linux ACP installation is not treated as a Windows executable.
