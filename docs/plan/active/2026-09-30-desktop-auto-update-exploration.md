# MemoFlow Desktop Auto-Update Exploration

- Date: 2026-09-30
- Branch: `explore/desktop-auto-update`
- Scope: Desktop version discovery, background download, restart-to-apply update, release-feed integrity, and update UX.
- Status: Research precursor; detailed design moved to ADR-112 and the implementation plan

Detailed follow-up:

- [Reference study](../../analysis/2026-09-30-desktop-auto-update-reference-study.md)
- [ADR-112 — Desktop Update Domain、Runtime Boundary 与 Installation Ownership](../../architecture/adr/ADR-112-desktop-update-domain-runtime-and-installation-ownership.md)
- [Implementation plan](./2026-09-30-desktop-auto-update-implementation.md)

## 1. Executive summary

MemoFlow already contains most of the low-level ingredients for desktop self-update:

- Electron 44.4.5
- electron-builder 26.16.1
- electron-updater 6.8.9
- GitHub Releases publishing
- Windows NSIS target + blockmap
- Linux AppImage / deb / rpm targets
- macOS DMG + ZIP + blockmap targets
- generated update metadata
- an `AutoUpdateManager` and IPC handler skeleton

However, the current product does **not** have a closed update loop.

The updater module is not composed into the shell runtime, its IPC channels are not exposed by the preload allow-list, no renderer product surface consumes its state, and the release pipeline currently renames the macOS update manifests to architecture-specific names that the default GitHub updater feed does not request.

Therefore the right framing is not “add an updater from scratch”; it is “turn an existing residual updater skeleton into a first-class shell capability and make release metadata a tested protocol contract”.

## 2. Current-state evidence

### 2.1 Runtime dependencies

`apps/desktop/package.json` already declares:

- `electron-builder@26.16.1`
- `electron-updater@6.8.9`

`apps/desktop/electron-builder.json5` configures:

- `appId: com.memoflow.app`
- `productName: MemoFlow`
- GitHub publisher `BakerSean168/memoflow`
- Windows NSIS
- macOS DMG + ZIP
- Linux AppImage + deb + rpm

The GitHub repository is public, so the public GitHub provider does not require end-user credentials.

### 2.2 Existing updater code is not composed

Existing files:

- `apps/desktop/src/main/modules/auto-update/auto-update-manager.ts`
- `apps/desktop/src/main/modules/auto-update/ipc/index.ts`

The manager already models:

- startup/periodic checks
- update available / not available
- manual download
- download progress
- downloaded state
- quit-and-install
- `autoInstallOnAppQuit`

But there is no live host composition in `apps/desktop/src/main/main.ts` or `app-lifecycle.ts`:

- no `createAutoUpdateManager(...)`
- no `manager.init(...)`
- no `registerAutoUpdateIpcHandlers(...)`

So the existing class is effectively dormant.

### 2.3 IPC is not renderer-reachable

`AutoUpdateChannels` exists in `@memoflow/contracts/electron`:

- `auto-update:check`
- `auto-update:download`
- `auto-update:install`
- `auto-update:status`
- `auto-update:config`

But `apps/desktop/src/preload/allowed-channels.ts` does not include `AutoUpdateChannels`.

The manager also emits ad-hoc renderer events:

- `update:checking`
- `update:available`
- `update:not-available`
- `update:progress`
- `update:downloaded`
- `update:error`

Those event names are not owned by the contracts package and are not present in the preload allow-list.

Therefore even registering the existing main-process IPC handler would still not produce a usable product surface.

### 2.4 Published release metadata is only partially compatible

The latest inspected public release is `v0.14.1`.

It contains:

- `latest.yml`
- `latest-linux.yml`
- `latest-mac-x64.yml`
- `latest-mac-arm64.yml`

It does **not** contain the default macOS feed filename:

- `latest-mac.yml`

The release workflow explicitly renames each generated `latest-mac.yml` to an architecture-specific filename.

That avoids a GitHub asset-name collision between x64 and arm64 jobs, but it also means default `electron-updater` GitHub-provider lookup cannot consume the resulting macOS release metadata without additional client/feed routing.

### 2.5 Signing state

The inspected `v0.14.1` desktop release manifest reports:

- Windows x64: `unsigned`
- Linux x64: `unsigned`
- macOS x64: `unsigned-pilot`
- macOS arm64: `unsigned-pilot`

macOS automatic update requires a signed application. This is a functional gate, not just polish.

Windows signing is not the same hard blocker, but Authenticode should be considered part of the production distribution trust boundary before broad unattended updating.

## 3. How mature desktop products usually implement updates

The common direct-download desktop flow is:

1. App launches on version N.
2. A shell-level updater checks a small update manifest after startup.
3. The server/feed returns the latest eligible version and artifact metadata.
4. The client compares semantic versions and update channel policy.
5. If eligible, the client downloads an installer/package or differential blocks in the background.
6. The client verifies the downloaded bytes against update metadata and platform trust controls.
7. The app surfaces a non-blocking “Update ready” state.
8. User chooses “Restart to update”, or exits normally.
9. The updater swaps/installs the new version.
10. The next launch runs version N+1.

A mature product normally provides both:

- automatic background discovery/download; and
- a manual “Check for updates” affordance.

Slack is a representative UX: direct-download builds expose “Check for Updates” and “Restart to Apply Update”, while Store-managed installations defer update ownership to the platform store.

VS Code similarly enables automatic updates by default on macOS/Windows, exposes update policy, and delegates Linux package-managed installations to the system package manager.

## 4. Product behavior proposed for MemoFlow

### 4.1 Stable-channel defaults

For direct-download desktop builds:

- Check once after startup, delayed by 30–60 seconds.
- Re-check every 6 hours while the app remains open.
- Manual “Check for updates” is always available.
- Automatically download an eligible stable update in the background.
- Never force an active-session restart.
- After download, surface “Restart to update” + “Later”.
- If the user quits normally after download, allow installation on quit.
- Do not expose raw updater/network errors as blocking dialogs.
- Persist enough diagnostics to explain why an update did not apply.

The first production version should use only the stable channel.

Beta/preview can be added later as an explicit user or operator opt-in.

### 4.2 UX surface

Add a desktop-only settings section:

**Settings → About & Updates**

Contents:

- Product name
- Current version
- Update channel (initially Stable, read-only)
- Last checked time
- Current state
- “Check for updates” button
- Available version + short release note summary
- Download progress
- “Restart to update” action once ready
- Link/action to release notes
- Troubleshooting status if an update failed

Global shell behavior:

- No modal when merely checking.
- No modal for “already up to date”.
- Small badge/toast when a new version is downloading or ready.
- Once ready, a durable but non-blocking update indicator can remain until restart.

## 5. Architecture proposal

### 5.1 Ownership

Auto-update is a **Desktop Shell capability**, not a Profile capability.

It must be initialized exactly once per Electron app process and must not be created/destroyed as profiles change.

Recommended owner:

`DesktopUpdateRuntime`

Responsibilities:

- initialize electron-updater
- own update state machine
- schedule automatic checks
- expose explicit commands
- emit typed state updates
- bind to release channel/feed configuration
- cleanly dispose timers/listeners

### 5.2 State machine

Use one canonical state shape:

```ts
type DesktopUpdatePhase =
  'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';

interface DesktopUpdateSnapshot {
  phase: DesktopUpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progressPercent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  lastCheckedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}
```

The renderer should consume a snapshot, not reconstruct state from loosely-related events.

### 5.3 Contract ownership

Move all command/event names and DTOs to `@memoflow/contracts/electron`.

Commands:

- `CHECK`
- `DOWNLOAD` only if automatic download is later made configurable
- `INSTALL`
- `STATUS`

Events:

- one canonical `STATE_CHANGED` event is preferable to six ad-hoc event names

Avoid renderer-facing mutable raw `UpdateConfig`. Product policy should remain owned by the shell/runtime unless a specific setting is intentionally productized.

### 5.4 Preload boundary

The preload allow-list must explicitly include:

- updater command channels
- updater state event channel

No generic IPC escape hatch.

### 5.5 Renderer integration

Desktop host DI should provide a narrow `DesktopUpdateService` to app-vue.

The shared Vue product package should not import Electron directly.

Suggested client surface:

```ts
interface DesktopUpdateService {
  getSnapshot(): Promise<DesktopUpdateSnapshot>;
  check(): Promise<DesktopUpdateSnapshot>;
  restartAndInstall(): Promise<void>;
  subscribe(listener: (snapshot: DesktopUpdateSnapshot) => void): () => void;
}
```

The service is optional/absent on Web and Mobile.

## 6. Update feed strategy

### 6.1 Phase 1: keep current GitHub Releases for Windows

Windows already has the expected `latest.yml`, NSIS installer and blockmap.

This is the fastest path to prove the entire runtime/product loop.

### 6.2 macOS: do not keep the current ambiguous GitHub feed shape

Current separate x64 and arm64 builds both generate a `latest-mac.yml`, which collide in one GitHub Release.

The existing rename workaround preserves both files but breaks default lookup.

Two clean options exist:

#### Option A — universal macOS build

Publish one universal build and one canonical `latest-mac.yml`.

Pros:

- simplest updater feed
- simplest user experience

Cons:

- larger artifact
- native-module merging/rebuild complexity
- current desktop runtime has architecture-specific native dependencies, so this needs dedicated validation

#### Option B — architecture-specific generic feed

Keep x64 and arm64 artifacts separate and publish them into distinct update-feed paths, for example:

```text
/stable/darwin/x64/latest-mac.yml
/stable/darwin/x64/...
/stable/darwin/arm64/latest-mac.yml
/stable/darwin/arm64/...
```

At runtime, select the feed by `process.arch`.

Pros:

- preserves smaller per-arch binaries
- cleanly matches current build matrix
- no GitHub asset-name collision
- own domain decouples updater protocol from repository hosting
- easier staged rollout / cache policy control

Cons:

- requires managed object storage/CDN publication

Given MemoFlow already has multi-platform release automation and separate mac architectures, **Option B is the preferred long-term design**.

GitHub Releases can remain a human-download mirror.

### 6.3 Linux

Treat Linux by installation ownership:

- AppImage direct-download: updater-owned self-update is reasonable.
- deb/rpm installed through a package repository: package manager should own updates.
- raw downloaded deb/rpm without a repository: do not pretend there is a seamless store-like updater; provide version discovery + download/open guidance unless a fully-tested updater path is established.

The first Linux auto-update lane should therefore target AppImage explicitly.

## 7. Security and trust boundary

Required before broad automatic install:

### macOS

- Developer ID signing
- notarization
- staple/verification
- updater feed points only to matching signed artifacts

### Windows

- Add Authenticode signing before broad unattended rollout.
- Keep NSIS installer identity stable.
- Verify that update install preserves current-user installation directory semantics.

### All platforms

- HTTPS feed only
- generated metadata and artifact must come from the same release build
- preserve electron-updater SHA-512 verification
- never hand-edit checksums
- fail closed on checksum mismatch
- log updater failure in a bounded form without secrets

electron-builder 26 already supports staged rollout via `stagingPercentage` in update metadata.

Signed update manifests are a future hardening opportunity, but should not become a dependency until the project intentionally moves to a stable electron-builder version that supports the feature in the production line.

## 8. Rollout / release policy

Recommended stable rollout:

1. Build candidate.
2. Run packaged smoke tests.
3. Verify update metadata schema and referenced artifacts.
4. Verify platform signing/trust.
5. Publish update feed.
6. Start staged rollout (for example 10%).
7. Observe crash/startup/update failure telemetry.
8. Raise rollout percentage.
9. Complete rollout.

If a bad version has already reached clients, publish a **higher fixed version**. Do not try to replace bytes behind the same semantic version.

## 9. Implementation tickets

### DU-100 — Runtime ownership

- Introduce shell-owned `DesktopUpdateRuntime`.
- Initialize once after `app.whenReady()`.
- Do not tie lifecycle to Profile activation.
- Dispose timers/listeners on final quit.

Acceptance:

- packaged app performs one update check after startup
- profile lock/switch does not recreate updater

### DU-110 — Typed update contract

- Add update snapshot DTO.
- Add canonical update event channel.
- Retire ad-hoc `update:*` renderer event strings.
- Add preload allow-list coverage.

Acceptance:

- no raw string updater channel outside contracts
- preload tests cover all update channels

### DU-120 — Desktop renderer service

- Add `DesktopUpdateService` injection.
- Implement IPC adapter.
- Add subscription lifecycle cleanup.

Acceptance:

- app-vue has no Electron import for updater
- Web/Mobile remain unaffected

### DU-130 — About & Updates settings UX

- Add desktop-only Settings group.
- Show current version and current updater snapshot.
- Manual check.
- Progress.
- Restart-to-update.
- Non-blocking error state.

Acceptance:

- “already up to date” is visible but non-modal
- ready update remains actionable until restart

### DU-140 — Windows release closure

- Keep canonical `latest.yml`.
- Verify blockmap/install/update flow from N → N+1 on a real installed NSIS build.
- Add release test that fails if manifest or referenced artifact is absent.

Acceptance:

- clean VM installs N, detects N+1, downloads, restarts, reports N+1

### DU-150 — macOS feed correction

Preferred implementation:

- publish per-arch generic feed under an owned update domain
- runtime selects x64 vs arm64 feed
- require signed/notarized production release

Acceptance:

- both Intel and Apple Silicon installed builds update from N → N+1
- no dependence on a missing canonical GitHub `latest-mac.yml`

### DU-160 — Linux AppImage lane

- Detect AppImage-owned installation.
- Enable update path only for supported direct-download target.
- Do not claim automatic deb/rpm ownership unless verified.

### DU-170 — Rollout controls

- stable channel first
- staged rollout support
- update diagnostics
- operator runbook for halt/hotfix

## 10. Tests to add

### Unit

- state transitions
- check deduplication
- download deduplication
- error normalization
- timer lifecycle
- current/available version normalization

### Surface tests

- contract channel ownership
- preload allow-list
- shell-only composition
- app-vue does not directly import Electron updater details

### Release tests

- expected manifest exists per target
- every manifest path exists in release assets
- sha512 metadata is generated, not handwritten
- feed path is correct for platform/arch
- signed macOS policy is required for production updater publication

### End-to-end update test

For release candidate N+1:

1. Install N.
2. Point at candidate feed.
3. Launch N.
4. Detect N+1.
5. Download.
6. Restart/install.
7. Relaunch.
8. Assert `app.getVersion() === N+1`.
9. Assert user/profile data remains intact.

This is the most important missing verification. A package smoke test proves “the artifact starts”, not “an installed old version can update itself safely”.

## 11. Recommended implementation order

1. DU-100 + DU-110 — make updater a real shell capability.
2. DU-120 + DU-130 — expose real product UX.
3. DU-140 — close Windows end-to-end first.
4. Add production signing lane.
5. DU-150 — macOS architecture-aware feed + signed update test.
6. DU-160 — AppImage.
7. DU-170 — staged rollout and operational hardening.

## 12. Decision

Keep `electron-updater`; do not replace it.

MemoFlow already uses the electron-builder ecosystem and generates compatible installers/blockmaps/metadata. Replacing the updater library would add risk without solving the actual failures.

The core problem is ownership and release-protocol closure:

- dormant updater runtime
- inaccessible IPC
- missing product UX
- macOS feed filename/architecture conflict
- unsigned production artifacts
- no N → N+1 installed-update E2E test

Solve those boundaries first.
