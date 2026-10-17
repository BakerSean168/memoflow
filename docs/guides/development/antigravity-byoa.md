---
tags: [guide, ai, desktop, byoa]
description: Configure the official Google Antigravity ACP Agent in MemoFlow Desktop.
created: 2026-10-17T00:00:00Z
updated: 2026-10-17T00:00:00Z
---

# Google Antigravity (AGY) BYOA

Antigravity is a **Desktop native Agent**, alongside Codex, Claude Code, Pi and DSH. It is not a Mastra model service or an API-key proxy. The Web application remains Mastra-only.

## Native prerequisites

Install Google's official **Antigravity ACP server** using an ACP-compatible client or the [official ACP registry](https://github.com/agentclientprotocol/registry/tree/main/antigravity-acp). On Windows, the AGY configuration section in MemoFlow provides a one-click **download link** to Google's versioned x64 ZIP (v1.4.0) and a Registry link for the newest release or other architectures. This opens the system browser; it does not install or run the binary, and does not change any existing native profile. Extract both `agy_acp_server.exe` and `localharness_external.exe` into one directory, then point the connection at the first executable. Keep the server and its bundled native harness together. MemoFlow does not redistribute or silently download Google's proprietary binaries.

The official ACP executable is `agy_acp_server.exe` on Windows and `agy_acp_server.par` on Linux/macOS. It is **different from the `agy` CLI**. An installed or signed-in `agy` CLI does not establish ACP availability.

Complete the official server's Google OAuth login in the ACP-compatible client first. MemoFlow reuses its existing native profile; it does not copy credentials or provide an alternate login/model backend. This integration uses the native `oauth-personal` authentication method. Unsupported or expired native login is reported as requiring sign-in rather than automatically opening an authentication browser during discovery.

## Configure MemoFlow

Open Settings → AI → Providers, select **Antigravity (AGY)** or add a named Antigravity instance.

Set **Program path** to the official ACP executable. The default command is `agy_acp_server`; on Unix, an installed `.par` executable on PATH is also resolved. Use an absolute path when the client keeps its binaries outside PATH.

Set **Native Home** to the server's `GEMINI_HOME` directory, which is the **parent** of `antigravity-acp/`, not the token file itself. For example, an existing native profile contains `<native-home>/antigravity-acp/acp_token.json`. Select that existing profile rather than moving or pasting its credential files.

Save, then check the connection. MemoFlow reads the model directory and version from the native ACP handshake. Select an actually discovered model in the Composer. No provider URL, API key, guessed model list, or automatic fallback to another Agent is used.

## Behavior and boundaries

- Discovery uses cached native authentication and does not submit a model prompt.
- Model visibility preferences and execution failures are partitioned by native instance and an opaque identity digest. Routine cache rewriting does not reset preferences; changed authorization cannot resume an old account's session.
- The native Agent stays in default per-action permission mode. MemoFlow applies the current turn's explicit permission policy; Antigravity interaction questions remain user-input requests and are never auto-approved as tools.
- Rate-limit and quota errors preserve the selected route and safe recoverable status. There is no automatic retry or implicit paid channel switch.
- Existing MemoFlow native inputs remain text/reference-based. Native protocol capabilities do not silently enable unsupported attachment types in MemoFlow.

Antigravity requires a supported local native runtime. Windows and WSL installations are independent; a Linux ACP installation is not treated as a Windows executable.
