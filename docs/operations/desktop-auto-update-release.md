---
tags:
  - runbook
  - desktop
  - auto-update
  - release
description: Desktop release publication, installed-update evidence, incident containment, and gated future feed rollout operations
created: 2026-10-01T00:00:00+00:00
updated: 2026-10-01T00:00:00+00:00
---

# Desktop Auto-Update Release Operator Runbook

## 1. Purpose, scope, and non-goals

Use this runbook to prepare, verify, publish, recover, and contain a MemoFlow Desktop stable release. It covers GitHub Release authority, platform packages, installed-update proof, bounded client diagnostics, and immutable release identities.

**Current executable mode:** the runtime uses a published-GitHub-Release provider through the `electron-updater` custom-provider interface; stable resolves to GitHub `latest`, while Nightly selects complete published releases in its own channel. Publishing a Release as latest exposes it to all eligible clients. The retained initial **10% rollout artifact is evidence only**, not a live rollout.

**Future gated mode:** projected feed publication and 10/30/50/100/pause controls are designed and locally materializable. No remote pointer writer/host or live client provider cutover is implemented. Sections explicitly labeled FUTURE must not be treated as current containment controls.

macOS DU-1501..1504 remain **DEFERRED by user**. Default release policy is `unsigned-pilot`; these packages are not production updater readiness evidence. This runbook does not activate macOS signing, upgrade the updater (DU-1703 remains optional), deploy server containers, add telemetry, or implement feed hosting.

Repository code/workflows are authoritative. [ADR-114](../internals/decisions/ADR-114-desktop-update-domain-runtime-and-installation-ownership.md) supplies the ownership design; its historical context is not current runtime status. See the [implementation plan](https://github.com/BakerSean168/memoflow/blob/bd373a220c6b471fdfa5b64bd54471da49c2f023/docs/plan/active/2026-09-30-desktop-auto-update-implementation.md) for proof history and the [Delivery Platform V3 runbook](./delivery-platform-v3-rollout.md) for server deployment and optional future macOS signing operations.

## 2. Current topology and authority map

Nightly publication starts from `nightly-release.yml`. Its timer checks every 30 minutes and selects current main only when exact-SHA main CI and retained runtime artifacts are verified, there are new commits, and at least six hours have elapsed since the previous published Nightly. Manual dispatch uses the same eligibility checks and defaults to a dry run.

Stable publication starts from an explicit `release-publish.yml` dispatch selecting a published, verified `nightly_tag`. It preserves that Nightly's Git SHA, repackages Desktop assets under the prepared stable version, and promotes the existing image digests.

Both paths create or resume a Draft bound to a full source SHA, run Desktop native acceptance and exact-source release acceptance, verify image and remote asset evidence, and publish only after all gates pass. New Git tags are created at publication. Nightly is a prerelease with `make_latest=false`; Stable is marked latest. Neither path selects a staging or production deployment.

| Authority                   | Owner and operational meaning                                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version intent              | `Prepare Release` (`release-please.yml`) is manually dispatched on verified current main. It creates or updates a version/changelog PR and never publishes.                                                                                                 |
| Tested source               | Exact successful `CI` push run on `main`, not a PR run or a green run for a different SHA. Release SHA must remain an ancestor of main.                                                                                                                     |
| Candidate images            | `candidate-publish.yml` runs within Nightly publication to produce exact-source image and runtime evidence. Stable reuses the selected Nightly's verified image digests.                                                                                    |
| Nightly eligibility         | `nightly-release.yml` selects eligible current-main source through its timer or explicit dispatch. Main CI does not directly trigger publication.                                                                                                           |
| Stable selection            | `release-publish.yml` requires an explicit published `nightly_tag`; that Nightly's source and evidence must remain verifiable.                                                                                                                              |
| Draft and final publication | The shared workflow creates or resumes a Draft with full-SHA `target_commitish`, then publishes after Desktop, image and exact-source acceptance gates pass. Preparation creates no public Git tag.                                                         |
| Release acceptance          | `release-quality.yml` runs exact-source acceptance journeys and supplies the receipt required by finalization.                                                                                                                                              |
| Desktop assets              | `Release Assets` (`release-assets.yml`), called as `Desktop Release Lane`, owns packages, platform receipts, smoke, metadata closure, and manifest-owned Draft uploads.                                                                                     |
| Docker assets               | `Docker Release Lane` calls `publish-images.yml`, promoting exact candidate identities rather than rebuilding release images. Publishing a Release does not deploy production.                                                                              |
| Canonical release evidence  | `desktop-release-manifest.json`, `docker-release-manifest.json`, and `candidate-set-v1.json` feed `release-manifest.json`. Finalization verifies every remote manifest-owned Desktop asset before publishing.                                               |
| Runtime updater             | `DesktopMainRuntime` owns one process/Shell updater, independent of Profile/window switching. Coordinator → install coordinator → shared shutdown owner → updater handoff is the sole restart/install path. Renderer consumes validated snapshots/commands. |
| Live provider               | `apps/desktop/desktop-update-release.json`: GitHub `BakerSean168/memoflow`, tag prefix `v`, stable → `latest`; the adapter owns `electron-updater` integration.                                                                                             |
| Projected controls          | `desktop-update-feed-evidence` and `desktop-update-rollout-evidence` are retained Actions evidence. Their receipts describe future publication/pointers; receipt creation performs no remote publication.                                                   |

### Published-release discovery and draft isolation

A public Git tag is not proof that a release is ready to install. GitHub's Atom feed can include tag-only entries while the associated Release is still a Draft. The client therefore uses the public Releases API: stable requests the explicitly designated latest Release; Nightly reads up to three pages of 100 published release records, sorts matching candidates by SemVer within each recent page, and continues only when no complete candidate exists. Drafts, other channels, missing metadata and missing uploaded installers are ineligible. Exhausted lookup budgets, malformed responses, network errors and rate limits remain failures rather than fabricated “up to date” results.

The provider uses the existing platform/architecture projection contract, verifies that metadata version equals the selected tag, and permits only uploaded assets from that same Release. The SDK still owns download, differential fallback, checksum/signature verification and installation. Checks have a 15-second request timeout and at most five metadata requests; successful discovery is cached for one minute. Public GitHub API quotas are shared by IP. HTTP 403/429 pauses requests for one full hour because the pinned v6 executor does not expose rate-limit response headers. No user token is shipped in the application. If shared-IP quotas become a real scale limit, publish the already-defined static channel projection; do not introduce another version authority.

Draft creation records a full source SHA in `target_commitish` without creating a public tag. Build and recovery lanes resolve that immutable Draft source; an existing tag must point to the same SHA. After all gates and asset verification pass, finalization revalidates source identity and publishes the Release, allowing GitHub to create its tag at publication. A published tag is checked again afterwards. Old failed drafts with matching pre-existing tags remain recoverable; this change does not delete historical tags.

Older installed clients retain their Atom discovery until they install a corrected build. A new complete Nightly can deliver the fix through the existing updater; changing the repository cannot patch a running installation. Do not publish incomplete drafts, replace artifacts under an existing version or remove gates to recover old clients.

References: [GitHub Releases API](https://docs.github.com/en/rest/releases/releases#list-releases), [Joplin published release discovery](https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/checkForUpdates.ts), and [VSCodium static update publication](https://github.com/VSCodium/vscodium/blob/master/update_version.sh).

## 3. Preconditions and operator checklist

Before starting or recovering publication, or promoting a Nightly to Stable, verify the following. Eligible Nightly publication can proceed from its scheduler; Stable always requires explicit operator selection.

- [ ] Record channel, source SHA, publication purpose and original run if recovering. For Stable, record the selected published Nightly and prepared Release Please milestone.
- [ ] Review current workflow revisions and confirm GitHub Actions/Release access, workflow credentials, candidate registry access, and existing local tools. Authenticate `gh` without putting tokens into evidence.
- [ ] Confirm that root `package.json`, Desktop `package.json` and `.release-please-manifest.json` agree at the selected source SHA. For a new Stable version, verify that Release Please prepared its version and changelog before the selected Nightly was built.
- [ ] Confirm the proposed version/tag is new; it must never be moved or reused for changed bytes. Record any existing Draft asset digests before a recovery run.
- [ ] Confirm signing policy. Leave `MACOS_RELEASE_MODE` unset or `unsigned-pilot` for current scope; do not introduce placeholder Apple credentials. An explicitly selected signed mode must fail closed on trust failure.
- [ ] Establish observation coverage on direct Windows NSIS and Linux AppImage installations, an incident evidence destination, and criteria for stopping further release activity.
- [ ] Understand that publication is all-eligible-client exposure; a green p10 evidence materializer does not provide a live 10% safety net.
- [ ] Plan to preserve Actions artifacts before their retention expires. Never bypass a failed validator with manual asset uploads or an early UI Publish click.

## 4. CURRENT EXECUTABLE release procedure

### 4.1 Prepare version metadata when needed

1. For a new Stable milestone, manually dispatch `Prepare Release` after current main has passed exact-SHA CI:

   ```bash
   gh workflow run release-please.yml --ref main
   gh run list --workflow release-please.yml --limit 10
   ```

2. Review and merge its version/changelog PR through normal checks. This prepares the version; it does not publish Stable. Ordinary Nightlies can use the version already recorded in main and do not require a new Release PR for every build.
3. Require successful exact-SHA main push CI and retained canonical runtime build artifacts for the source selected by the Nightly controller. Retain the source SHA and CI run ID from its decision output; a PR run or a green run for another SHA is insufficient.

   ```bash
   RELEASE_SHA='<full source SHA selected by the Nightly controller>'
   gh run list --workflow ci.yml --commit "$RELEASE_SHA" --limit 20
   gh run view '<CI run ID>' --json headSha,event,headBranch,status,conclusion,url
   ```

### 4.2 Select Nightly or Stable publication

4. For Nightly, inspect `Nightly Release` and its eligibility summary. A manual dry run uses the same current-main, artifact and six-hour checks:

   ```bash
   gh workflow run nightly-release.yml --ref main -f dry_run=true
   gh run list --workflow nightly-release.yml --limit 10
   ```

   An explicit dispatch with `dry_run=false` may publish if eligible. It does not bypass eligibility or select an arbitrary historical Draft.

5. For Stable, select a published, verified Nightly and inspect its dry-run result:

   ```bash
   SOURCE_NIGHTLY='v<version>-nightly.<date>.<run>'
   gh workflow run release-publish.yml --ref main \
     -f nightly_tag="$SOURCE_NIGHTLY" -f dry_run=true
   ```

   After verifying the selected source and plan, dispatch the same `nightly_tag` with `dry_run=false`.

6. The shared workflow creates or resumes the Draft bound to the selected full SHA. Record its pending tag name, source SHA, Release ID and publication run. A new Draft requires no public Git tag; existing tags must resolve to the same SHA. Release Please labels are reconciled after successful Stable publication.

### 4.3 Package and installed-update gates

7. Inspect Desktop, image and exact-source release acceptance lanes. Desktop builds exact release source on Windows x64, Linux x64, macOS x64, and macOS arm64 runners. The workflow separately checks out packaging tooling at `github.workflow_sha`; retain that tooling/workflow identity as well as the source SHA.
8. Require production build, Electron native dependency rebuild, packaging, packaged runtime closure verification, packaged smoke, and platform receipt success. Windows packages NSIS + ZIP; Linux packages AppImage + deb + rpm; macOS packages DMG + ZIP. Current macOS smoke and arch-specific metadata are unsigned-pilot evidence, not signed installed-update gates.
9. For Linux, inspect **actual AppImage smoke** and the separate installed Debian smoke. Debian install checks `/opt/MemoFlow/resources/package-type` equals `deb`. Do not substitute Debian smoke for AppImage updater proof or claim native RPM installation was proven.
10. Require both reusable `Desktop Update Installed E2E` jobs: `Windows NSIS N to N+1` and `Linux AppImage N to N+1`. The release-assets parent job ID `windows-installed-update-e2e` invokes the entire two-platform workflow. Its `ref` is the resolved exact release SHA.
11. Inspect `desktop-update-installed-e2e.json` in each installed-update artifact. Require `result=passed`, expected candidate version, final phase `candidate-verified`, cleared install receipt, and unchanged Profile registry semantic/userData preservation sentinel hashes. Linux additionally checks final version and installed bytes equal candidate AppImage SHA-256 and differ from base bytes.

    These workflows synthesize a lower N and current N+1 from the same source and serve a local HTTP feed. They prove installed update/lifecycle behavior; they do not prove access to the public GitHub provider. Windows proof previously passed in CI (run `36718670920`); Linux native GCP Dev proof passed `0.14.0 → 0.14.1`. The GitHub-hosted Linux lane exists and must pass for the particular release; historical proof is not a substitute.

### 4.4 Manifest verification and publication

12. Desktop upload waits for all platform builds and installed-update jobs. Require canonical Desktop manifest creation and `verify-desktop-update-metadata.mjs` success: metadata version/references, artifact bytes/digests, and required platform evidence must close over the manifest. Inspect `SHA256SUMS.txt` and platform receipts.
13. Confirm the feed materializer and rollout materializer succeed and retain `desktop-update-feed-evidence` and `desktop-update-rollout-evidence`. The workflow's initial command uses `10`. Inspect eligible/skipped lanes, release identity, and receipt hashes. **No live channel/pointer changes at this step.**
14. Require Draft upload of the manifest-owned assets and remote asset verification. Require Docker lane success and exact candidate digest preservation in its manifest. A feed receipt alone cannot substitute for either lane.
15. `Verify all release evidence and publish` downloads the lane/candidate manifests from the Draft, verifies remote Desktop assets (exactly one uploaded asset per manifest name, matching size and GitHub SHA-256 digest), builds `release-manifest.json`, uploads it, then revalidates the Draft source and publishes through `publishDraft`, marking stable as latest and Nightly as prerelease. This is automatic finalization, not a separate current 10% rollout approval stage.
16. Confirm Published/prerelease for Nightly or Published/latest for Stable, tag SHA, canonical manifest identities, asset coverage, and workflow success. Retain evidence and observe representative eligible clients via Settings. Keep server production deployment as the separate delivery-platform operation.

## 5. Retry or resume a failed publication

Identify the original publication run, Draft, full source SHA and failing gate before retrying. Inspect the Draft through its Release record; a pending tag name does not imply that a Git ref exists:

```bash
RELEASE_TAG='v<existing draft version>'
gh release view "$RELEASE_TAG" --json tagName,isDraft,targetCommitish,url
gh run view '<publication run ID>' --json status,conclusion,url
```

For a transient failure after source resolution succeeded, restore the prerequisite and rerun failed jobs of the original publication run:

```bash
gh run rerun '<publication run ID>' --failed
```

This retains that run's resolved source and successful evidence. Inspect the resumed run; starting a retry is not proof of successful publication.

Nightly's next eligibility check can reuse a single Draft associated with the **same current-main SHA**. A manual `nightly-release.yml` dispatch evaluates current main and cannot force publication of an arbitrary older Draft. If a product or test correction changes the source SHA, merge the correction and release that new source instead of rebuilding the old version from different code.

To resume a failed Stable promotion in a new run, select the same published `nightly_tag` through `release-publish.yml`, first with `dry_run=true`, then with `dry_run=false`. Its manual dispatch has no `tag` input. A dispatch for an already-published same-SHA Stable is a no-op and cannot replace published bytes.

Draft uploads use `--clobber`, but this does not authorize replacing different bytes under an existing version. Preserve and compare existing digests; when byte identity cannot be preserved, use a new release identity. Never manually publish a failed Draft or bypass its gates.

Prefer recovering candidate jobs within the original Nightly run so that required same-run artifacts remain available. A separate `candidate-publish.yml` dispatch does not automatically attach its artifacts to an existing Nightly publication. Missing or expired evidence must not be replaced with unrelated artifacts.

## 6. Evidence checklist

| Evidence                    | Exact exposed name/location                                                                                   | Acceptance/retention                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Candidate set               | Actions `candidate-set-<SHA>`; Release `candidate-set-v1.json`                                                | Exact source CI/SHA and candidate digests.                                                                                       |
| Platform packages/receipts  | Actions `desktop-windows-x64`, `desktop-linux-x64`, `desktop-macos-x64`, `desktop-macos-arm64`                | Keep the downloaded platform directory structure for local verifier/materializer use. Check recorded signing/runtime validation. |
| Desktop identity            | Release `desktop-release-manifest.json` and `SHA256SUMS.txt`                                                  | Manifest asset coverage, size, hashes, metadata closure.                                                                         |
| Docker identity             | Release `docker-release-manifest.json`                                                                        | Candidate digest preservation; both registries per lane evidence.                                                                |
| Canonical release           | Release `release-manifest.json`                                                                               | Desktop + Docker + candidate identities, tag/SHA/CI binding.                                                                     |
| Projected feed              | Actions `desktop-update-feed-evidence` containing `desktop-update-feed-publication.json` and `versions/...`   | Evidence only; 30-day retention. Record eligible/skipped lanes and pointer description.                                          |
| Projected rollout           | Actions `desktop-update-rollout-evidence` containing `desktop-update-rollout-control.json` and `controls/...` | Evidence only; initial p10, 30-day retention.                                                                                    |
| Windows installed proof     | Actions `desktop-update-installed-e2e-windows`                                                                | Report `desktop-update-installed-e2e.json`, runtime diagnostics, `latest.yml`; 14-day retention.                                 |
| Linux installed proof       | Actions `desktop-update-installed-e2e-linux-appimage`                                                         | Report `desktop-update-installed-e2e.json` and diagnostics; 14-day retention.                                                    |
| Package failure diagnostics | Actions `desktop-runtime-diagnostics-<platform>` when smoke fails                                             | 14-day retention; inspect bounded runtime failure evidence.                                                                      |
| Workflow provenance         | CI/candidate/release/child run URLs and IDs, source SHA, workflow/tooling SHA                                 | Keep with incident/release record; retrieve before Actions expiry.                                                               |

## 7. Platform matrix

| Installation                       | Current ownership and gate                                                                                        | Operator promise                                                                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64 direct per-user NSIS   | Self-managed; packaged smoke + real installed N→N+1 CI proof                                                      | Eligible capability permits download and explicit Restart-to-Update through the shared shutdown owner. ZIP/unknown/portable provenance must not be inferred to be NSIS.                                                             |
| Linux x64 direct AppImage          | Self-managed; actual AppImage smoke + N→N+1 gate; native GCP Dev proof passed                                     | Direct AppImage identity is required; observe byte replacement, relaunch, receipt clearance, and userData preservation.                                                                                                             |
| Linux deb/rpm (and Snap ownership) | Package-manager-owned; bounded package-type provenance for deb/rpm; installed Debian smoke                        | Check/release discovery can show Available. Upgrade through system software updater/package manager. No updater download, self-install, or Restart-to-Update. RPM build/resolver coverage is not native RPM installed-update proof. |
| macOS x64/arm64                    | Default unsigned-pilot; production signing, per-arch runtime feed, native installed-update DU-1501..1504 deferred | Manual/pilot distribution only; do not claim production updater ready. Optional signed/notarized packaging is documented in the delivery runbook and does not close deferred updater tickets.                                       |

## 8. Current exposure semantics

The current stable runtime discovers a published GitHub Release through `electron-updater`. Once finalization marks the Release Published/latest, all eligible stable clients can discover it on their next check. Ownership/capability and client version still govern action; this does not mean every device installs immediately. Installation uses the explicit restart path.

The canonical GitHub metadata does not acquire the materialized control's `stagingPercentage`. Projected copies live only in Actions artifacts. There is currently no operational p10 → p30 promotion, live pause pointer, or live feed pointer rollback. Changing a local receipt or downloading a rollout artifact cannot change client exposure.

## 9. FUTURE: live staged rollout activation and procedure

### 9.1 Activation prerequisites — all required before live use

A separately reviewed provider cutover must implement and prove:

- A remote feed host and authenticated pointer writer, atomic switch semantics, readback, access policy, and cache behavior. No such uploader/pointer command is implemented in this repository today.
- Client/provider configuration that actually reads the projected platform/architecture feed and control metadata instead of GitHub stable/latest, with fail-closed installation eligibility.
- Immutable `versions/<tag>/<gitSha>/...` artifact storage and immutable `controls/<tag>/<gitSha>/<channel>/<control>/...` metadata; correct resolution of metadata's artifact references to canonical versioned bytes.
- Exact release/manifest binding and remote byte verification before a pointer change; conflict detection against the actual previous remote control, concurrency protection, and retained switch/readback evidence.
- Installed Windows/AppImage proof against that hosted path, including persisted cohort behavior, pause/resume, cache propagation, pointer rollback, and clients already downloading/Ready.
- Explicit activation acceptance and observation/stop criteria. Any macOS inclusion additionally requires a new user decision and completion of deferred trust/per-arch/native installed-update gates.

Until then, the following commands are **local/CI evidence materialization only**. They do not upload files, update a remote pointer, change runtime configuration, or make staged rollout live.

### 9.2 Materialize versioned feed and controls

Run from repository root with a canonical Desktop manifest and downloaded platform artifacts matching it. Use fresh local output directories outside the input roots: the feed materializer recursively replaces its output root. Never point it at canonical artifacts or a live remote prefix.

```bash
node tools/ci-cd-platform/release-tools/verify-desktop-update-metadata.mjs \
  desktop-release-manifest.json artifacts
node tools/ci-cd-platform/release-tools/materialize-desktop-update-feed.mjs \
  desktop-release-manifest.json artifacts desktop-update-feed stable

PUBLICATION_RECEIPT=desktop-update-feed/desktop-update-feed-publication.json
FEED_ROOT=desktop-update-feed
node tools/ci-cd-platform/release-tools/materialize-desktop-update-rollout.mjs \
  "$PUBLICATION_RECEIPT" "$FEED_ROOT" rollout-p10 10
node tools/ci-cd-platform/release-tools/materialize-desktop-update-rollout.mjs \
  "$PUBLICATION_RECEIPT" "$FEED_ROOT" rollout-p30 30 10
node tools/ci-cd-platform/release-tools/materialize-desktop-update-rollout.mjs \
  "$PUBLICATION_RECEIPT" "$FEED_ROOT" rollout-p50 50 30
node tools/ci-cd-platform/release-tools/materialize-desktop-update-rollout.mjs \
  "$PUBLICATION_RECEIPT" "$FEED_ROOT" rollout-p100 100 50

# Example: pause at 30, then resume at 30. Use the actual prior control.
node tools/ci-cd-platform/release-tools/materialize-desktop-update-rollout.mjs \
  "$PUBLICATION_RECEIPT" "$FEED_ROOT" rollout-paused pause 30
node tools/ci-cd-platform/release-tools/materialize-desktop-update-rollout.mjs \
  "$PUBLICATION_RECEIPT" "$FEED_ROOT" rollout-resumed-p30 30 pause
```

CLI contracts:

```text
materialize-desktop-update-feed.mjs <desktop-manifest> <artifact-root> <output-root> [channel]
materialize-desktop-update-rollout.mjs <publication-receipt> <feed-root> <output-root> <pause|10|30|50|100> [previous:pause|10|30|50|100]
```

The optional final argument is the bare prior value (`10`, `30`, `50`, `100`, or `pause`), not a literal `previous:` prefix. It records increase/decrease/hold/pause/resume transitions; it neither reads nor locks remote state. Read the real prior control after future activation and supply that value. Each control is derived from the canonical publication feed, not from a previously projected control. Pause produces `stagingPercentage: 0`; active controls use 10/30/50/100. Cohort behavior mirrors electron-updater's device-local persisted `.updaterId`; operators must not reset device IDs to manipulate eligibility.

### 9.3 Future remote operation after activation

1. Verify canonical evidence; materialize the immutable versioned feed and initial p10 control. Inspect publication/rollout receipts, source receipt digest, lane coordinates, metadata hashes, and skipped lanes.
2. Through the future implemented writer, publish verified immutable versioned bytes and control metadata first. Read back bytes/hashes and artifact-reference resolution before exposing the pointer.
3. Atomically switch the stable platform/arch route to the validated release/control. The publication receipt describes `versioned-prefix-pointer-switch`; rollout describes immutable control metadata plus an atomic channel pointer. A JSON receipt is a plan/evidence object, not the switch itself.
4. Observe check/download/integrity/install/version/receipt/data-preservation evidence at 10%. Define dwell time, sample sufficiency, and thresholds in the cutover acceptance; the current repository provides no production telemetry or fixed dwell/SLO gate.
5. Advance 10 → 30 → 50 → 100 one stage at a time only after reviewing that stage. Materialize using the actual previous control, verify and atomically switch via the future writer, read back, and record the decision. Do not run the entire promotion sequence unattended.
6. On a stop signal, project pause from the actual active stage, switch/read back through the future writer, and retain evidence. Resume at the approved stage with `previousControl=pause` only after root-cause review and verified repair. Pause does not recall cached metadata, downloaded candidates, or installed versions.

## 10. Diagnostics and observation

In Settings → About & Updates → troubleshooting, capture only the bounded projection: `currentVersion`, nullable `targetVersion`, `owner`, `capabilities`, `feedClass` (`none`, `github`, `generic`), `lastCheckedAt`, nullable `lastCheckResult`, `state`, bounded failure (`operation`, `code`, `retryable`, `recoverableTo`), and install receipt (`status`, nullable `requestedAt`). Receipt statuses are `none`, `restart-requested`, `shutdown-complete`, `installer-handoff`, or `unavailable`.

Diagnostics refresh on mount and explicit check/restart results; they are not a live fleet telemetry stream. A null last check means no settled observation, not a provider outage. `unavailable` means receipt evidence could not be read, not proof of absent handoff. Background checks can fail silently; use an explicit Settings check for a user-visible reproduction. Never collect provider secrets/URLs, raw error messages, absolute paths, Profile contents, or `.updaterId` as troubleshooting fields.

| Observation                                                  | Inspect next                                                                                         | Distinction/action                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Disabled / package-manager owner / denied install capability | Installation type and bounded capabilities                                                           | Expected ownership behavior; do not force Restart-to-Update. Unsigned macOS is not a production updater incident.                             |
| Check failure on one device                                  | Last check/result/code; connectivity; another equivalent eligible client                             | Likely local/provider-access issue if remote release evidence is intact; do not alter release bytes to fix a device.                          |
| No target / up-to-date unexpectedly                          | Current version/channel, Published/latest identity, exact tag and metadata version                   | Draft/ineligible/older release is not a client download failure. Future staged mode additionally requires actual pointer/cohort verification. |
| Multiple equivalent clients fail metadata/artifact checks    | Release workflow logs, canonical manifest, remote asset coverage/digests, metadata reference closure | Suspect release/provider asset failure; stop release activity, preserve evidence, prepare a new-version repair.                               |
| Download/checksum failure                                    | Bounded failure and remote manifest-owned asset digest                                               | Distinguish transient download interruption from non-retryable integrity mismatch. Never bypass checksum or substitute same-version bytes.    |
| Ready → restart failure / candidate did not relaunch         | Receipt phase, bounded cleanup/handoff failure, installed-update reports                             | Client lifecycle/install failure; preserve receipt evidence. Do not delete receipts or reinstall over userData as a diagnostic shortcut.      |
| Installed N+1 but product/data regression                    | Actual version, receipt result, Profile/sentinel proof, application reproduction                     | A successful updater handoff does not prove application compatibility. Contain and hotfix.                                                    |

## 11. Pause policy

Stop further publication/promotion for manifest identity drift, missing assets, checksum mismatch, repeated installed-update/receipt failure, data preservation drift, or a confirmed application regression. Record the affected installation/version, evidence, operator decision, and next review condition. Do not suppress a failed gate.

**Current:** before publication, keep the Release Draft. Because successful release lanes finalize automatically, stop/cancel the owning `Release Publish` run before finalization if an external stop signal arrives; verify the actual release state afterward because cancellation can race publication. For an already Published release, local pause materialization has no containment effect. Freeze subsequent release activity and use the bad-published/hotfix procedure. There is no shipped remote switch to disable all existing clients' background checks.

**Future activated provider:** atomically select the validated pause control and verify remote readback/cache behavior. This prevents future cohort offers after propagation; it does not undo a download/Ready/install. Resume only after evidence shows the cause is resolved and the selected immutable release is safe.

## 12. Hotfix procedure

1. Preserve bad-release/incident evidence; identify whether the fault is client runtime, metadata/assets, installation, or application compatibility.
2. Implement and review the fix through a new PR. Choose a **higher new semantic version/tag** through release-please; even a packaging-only repair needs a new identity if published/versioned bytes change.
3. Repeat the exact-SHA main CI → candidate → Draft → both lanes → metadata/remote verification → canonical manifest → Published/latest procedure. Re-run both installed-update gates for the new source.
4. Observe affected clients reaching the fixed version and validate application/data behavior. Synthetic N→N+1 evidence does not replace incident-specific compatibility checks from the actual affected version.
5. Record the superseding hotfix and close containment only after verification. A release containing previous application logic but a higher version is still a new fully gated release.

## 13. Bad Draft handling

A Draft is not a normal updater offer. Capture the failing run, tag/SHA, existing asset identities, logs, and receipts; leave it unpublished. Transient external failures may use the constrained retry procedure. Source, package, metadata, or identity defects require a new reviewed commit and new release version; do not move the old tag to the fix.

For wrong tag SHA, duplicate release records, missing candidate evidence, or uncertain existing bytes, stop and record the ambiguity. Do not delete/recreate tags or manually replace assets to make checks green. Keep the failed Draft as evidence and clearly identify the superseding release in the operator record. Any exceptional cleanup needs separate review and must preserve identities/evidence; this runbook supplies no destructive cleanup command.

## 14. Bad Published release handling

Assume eligible clients may already have discovered, cached, downloaded, or installed it. Capture Published/latest state and all manifests/assets before any incident action. Freeze further release activity, notify the incident owner through the established incident process, and prepare a higher-version hotfix. Never delete historical artifacts or rewrite the tag as an update rollback strategy.

Current GitHub mode has no implemented live pause/rollback pointer. Changing release visibility/latest designation cannot recall installed/Ready clients and is not a proven rollback gate here; do not substitute it for a validated repair. Verify affected clients and existing local data remain usable; choose manual recovery only after compatibility review. Do not enable downgrade or delete userData/receipt evidence to force an old build.

## 15. FUTURE: feed pointer rollback

Applicable only after section 9 activation, using the future implemented writer:

1. Pause further exposure and retain the current pointer/control, release identities, hashes, and incident evidence.
2. Select a previously verified immutable prefix/control. Recheck remote hashes, asset-reference resolution, signing/installation eligibility, and client-version behavior.
3. Prove compatibility with data written by the bad version, install receipts/pending downloads, application/server contracts, and provider no-downgrade behavior. If compatibility is uncertain, keep containment and issue a forward hotfix.
4. Atomically move only the channel pointer to the approved prior target with conflict protection; read back from the serving path and verify cache propagation. Record old/new targets, previous control, reason, operator, and time.
5. Observe eligible older clients and already-updated clients separately. Pointer rollback can change future offers; it does not roll back installed software. Keep immutable version/tag bytes and control objects unchanged.

There is no repository command for step 4 today. Do not invent `upload-feed` or `switch-pointer` tooling, or treat receipt generation as successful rollback.

## 16. Rollback/containment decision table

| Condition                                       | CURRENT GitHub mode                                                             | FUTURE activated provider mode                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| CI/candidate fails                              | Stop; no release publication; restore exact evidence before recovery            | Same.                                                                       |
| Package/smoke/installed E2E/manifest fails      | Keep Draft; investigate; retry only with preserved identities                   | Same; no pointer exposure.                                                  |
| Transient Draft lane failure                    | Resume existing tag after prerequisites and identity review                     | Same.                                                                       |
| Draft has changed bytes/source or tag collision | Abandon Draft; new version; never move tag                                      | Same.                                                                       |
| Bad Published asset/metadata/application        | Assume full eligible exposure; higher-version hotfix; preserve bytes            | Pause live control, then compatibility-reviewed pointer rollback or hotfix. |
| Client cleanup/handoff/receipt failure          | Preserve diagnostics; local compatibility-reviewed recovery; hotfix if systemic | Pause if systemic; existing Ready/install is not recalled.                  |
| Data/contract compatibility uncertain           | Block downgrade/manual rollback; forward repair                                 | Do not switch back blindly; pause and forward repair.                       |
| macOS signing unavailable                       | Keep unsigned-pilot/deferred status; no production updater claim                | Exclude ineligible macOS lanes; explicit signed policy fails closed.        |
| deb/rpm user requests self-install              | Direct to package-manager upgrade                                               | Same; feed mode cannot grant installation ownership.                        |

## 17. No same-version overwrite rule

A semantic version/tag is an immutable release identity. Never overwrite its installers, AppImages, ZIPs, DMGs, metadata, blockmaps, or manifest-owned bytes with different content. Never force-move a tag. The workflow's Draft `--clobber` usage does not relax this policy; published releases are not repaired by rerunning uploads.

Examples (illustrative versions):

- Bad `v1.2.3` NSIS installer: publish fixed `v1.2.4`, not a rebuilt installer named `1.2.3` under `v1.2.3`.
- Wrong `latest-linux.yml` or blockmap in a published version: issue a new gated version, not a manual same-version metadata replacement.
- Wrong Draft source SHA: keep its tag unchanged and prepare a new version; do not repoint it to the fix.
- Future rollout p10 → p30: select a separate immutable control object/pointer; canonical versioned artifact bytes stay unchanged. Future rollback moves the pointer, never version/tag contents.

## 18. Incident retention and postmortem fields

Download installed-update/runtime diagnostics before their 14-day retention expires and feed/rollout artifacts before 30 days. Keep Release manifests, checksum list, remote Release JSON, relevant package bytes/hashes, and run logs in the established incident evidence store. Keep bounded client observations separate from secrets or user data; there is no automatic support-bundle subsystem in this scope.

Record incident ID, UTC timeline, operator/reviewer, first/last observed versions, installation/platform/architecture, Release PR, tag and full source SHA, workflow/tooling SHA, exact CI/candidate/release/E2E run IDs/URLs, canonical manifest digests, failing assets/digests, signing policy, bounded diagnostic fields, actual Published/latest state, affected client scope and uncertainty, stop decision, attempted recovery and results, and superseding hotfix. In future provider mode also retain actual pointer/control before/after, source publication receipt digest, remote readback/cache evidence, cohort stage, compatibility decision, and pause/resume/rollback approval. Distinguish an Actions projection from a proven remote mutation in every record.

## 19. Command and reference appendix

Commands below inspect or invoke existing repository/GitHub interfaces. Replace placeholders; use a fresh evidence directory to avoid overwriting retained evidence. Workflow dispatch can publish after gates pass; it is not a dry run.

```bash
# Inspect workflow progress/logs.
gh run list --workflow candidate-publish.yml --commit "$RELEASE_SHA" --limit 20
gh run list --workflow release-publish.yml --limit 20
gh run view '<run ID>' --log-failed

# Recovery-only candidate dispatch; not the normal release trigger.
gh workflow run candidate-publish.yml --ref main \
  -f ci_run_id='<successful exact-SHA main CI run ID>' -f sha="$RELEASE_SHA"

# Supplemental installed proof; ref must be the exact source SHA.
# The release-assets invocation already gates both platforms automatically.
gh workflow run desktop-update-e2e.yml --ref main -f ref="$RELEASE_SHA"

# Read-only Release evidence retrieval and remote Desktop verification.
mkdir -p operator-release-evidence
gh release download "$RELEASE_TAG" \
  --pattern candidate-set-v1.json --pattern desktop-release-manifest.json \
  --pattern docker-release-manifest.json --pattern release-manifest.json \
  --pattern SHA256SUMS.txt --dir operator-release-evidence
RELEASE_API_URL="$(gh release view "$RELEASE_TAG" --json apiUrl --jq .apiUrl)"
gh api "$RELEASE_API_URL" > operator-release-evidence/github-release.json
node tools/ci-cd-platform/release-tools/verify-desktop-release-assets.mjs \
  operator-release-evidence/desktop-release-manifest.json \
  operator-release-evidence/github-release.json

# Download candidate or feed/rollout/E2E evidence by exact run/name.
gh run download '<candidate run ID>' --name "candidate-set-$RELEASE_SHA" \
  --dir operator-release-evidence/candidate
# Use the exact artifact names from section 6 with the owning run ID.

# At a checkout of the exact release source, validate its contract.
node tools/ci-cd-platform/release-tools/release-contract.mjs \
  --require-release --expected-tag "$RELEASE_TAG"

# Local docs-only validation with already installed tools.
pnpm exec oxfmt --check docs/operations/desktop-auto-update-release.md \
  docs/plan/active/2026-09-30-desktop-auto-update-implementation.md
pnpm nx run memoflow:docs-check
pnpm nx run memoflow:governance-check
git diff --check
```

Remote verifier checks GitHub asset names/state/size/digest; metadata closure verifier additionally requires local matching artifact bytes. Neither downloads every binary or performs installed runtime proof for the operator. Keep both kinds of evidence.

Workflow sources: [Prepare Release](../../.github/workflows/release-please.yml), [CI](../../.github/workflows/ci.yml), [Publish Main Candidate](../../.github/workflows/candidate-publish.yml), [Release Publish](../../.github/workflows/release-publish.yml), [Release Assets](../../.github/workflows/release-assets.yml), [Docker lane](../../.github/workflows/publish-images.yml), [Desktop Update Installed E2E](../../.github/workflows/desktop-update-e2e.yml).

Tool sources: [feed materializer](../../tools/ci-cd-platform/release-tools/materialize-desktop-update-feed.mjs), [rollout materializer](../../tools/ci-cd-platform/release-tools/materialize-desktop-update-rollout.mjs), [metadata verifier](../../tools/ci-cd-platform/release-tools/verify-desktop-update-metadata.mjs), [remote assets verifier](../../tools/ci-cd-platform/release-tools/verify-desktop-release-assets.mjs), [canonical manifest builder](../../tools/ci-cd-platform/release-tools/build-release-manifest.mjs), [runtime provider identity](../../apps/desktop/desktop-update-release.json).
