---
tags:
  - architecture
  - desktop
  - release
  - windows
  - linux
  - macos
description: MemoFlow Desktop Windows、Linux、macOS Intel/Apple Silicon 构建、签名、资产与更新契约
created: 2026-09-02T16:15:00+08:00
updated: 2026-09-03T17:00:00+08:00
---

# Cross-platform Desktop Release Contract

## 1. Scope

This document governs release-time packaging and packaged-runtime acceptance for MemoFlow Desktop. It does not change cloud/server deployment.

## 2. Required platform set

| Key           | Native runner       | Electron Builder args            | Primary assets                         |
| ------------- | ------------------- | -------------------------------- | -------------------------------------- |
| `windows-x64` | Windows x64         | `--win nsis --x64`               | Setup `.exe`, blockmap, `latest.yml`   |
| `linux-x64`   | Ubuntu x64          | `--linux AppImage deb rpm --x64` | AppImage, deb, rpm, `latest-linux.yml` |
| `macos-x64`   | macOS Intel         | `--mac dmg zip --x64`            | architecture-named dmg/zip             |
| `macos-arm64` | macOS Apple Silicon | `--mac dmg zip --arm64`          | architecture-named dmg/zip             |

The runner architecture is part of evidence; package architecture is not inferred only from the file extension.

## 3. Naming

Artifact names must be globally unique across the matrix:

```text
MemoFlow-Windows-x64-<version>-Setup.exe
MemoFlow-Linux-x64-<version>.AppImage
MemoFlow-Linux-x64-<version>.deb
MemoFlow-Linux-x64-<version>.rpm
MemoFlow-macOS-x64-<version>.dmg
MemoFlow-macOS-x64-<version>.zip
MemoFlow-macOS-arm64-<version>.dmg
MemoFlow-macOS-arm64-<version>.zip
```

The exact accepted names may remain compatible with existing Windows/Linux updater metadata during migration. macOS must include `${arch}` immediately because two architectures are produced in one release.

## 4. Build contract

Every platform build must:

1. check out the exact release SHA with sufficient Git history for the release contract;
2. verify release version identity before packaging;
3. install the frozen pnpm lockfile;
4. run Desktop typecheck/test/build or consume exact verified build inputs where portable;
5. package on a native runner;
6. record OS, architecture, runner image, Node/pnpm/Electron Builder versions and signing mode;
7. upload assets under a platform-specific artifact name;
8. never publish directly from the matrix child.

A single upload/postflight job downloads all children, validates coverage and names, builds the manifest, then uploads to the existing Draft Release.

### 4.1 Packaged-runtime gate

A package is not release evidence merely because Electron Builder produced files. Every native matrix child must launch the exact packaged executable and prove renderer readiness through the shared Playwright packaged smoke. The receipt is written only after this gate passes.

Linux has an additional installed-package boundary: after the packaged executable passes, the `.deb` must be installed with APT and the smoke must run again from `/opt/MemoFlow/memoflow`. The Linux receipt therefore records `installed-deb`, while Windows records `packaged-exe` and macOS records `packaged-app`.

The Linux smoke must run with a real Freedesktop Secret Service provider. CI creates an ephemeral D-Bus session and GNOME Keyring; `basic_text`, `safeStorage.setUsePlainTextEncryption(true)` and `--password-store=basic` are not valid release-test substitutions.

### 4.2 Packaged Linux native resources

Worker paths and native extensions that Electron unpacks must be resolved from `app.asar.unpacked` at runtime. In particular, PowerSync Worker URLs must not be allowed to carry an `app.asar/...` path into SQLite native-extension loading.

### 4.3 Secure storage boundary

MemoFlow uses OS-backed Electron `safeStorage` when a secure provider is available. Linux rejects the Chromium `basic_text` backend and `v10` ciphertext for Profile keys and cloud sessions. On WSL, where a Linux Secret Service is commonly absent, MemoFlow may bridge to Windows CurrentUser DPAPI through WSL interoperability; that ciphertext has an explicit MemoFlow envelope and is never treated as the Linux `basic_text` fallback.

## 5. macOS trust policy

MemoFlow supports two explicit release states:

- `unsigned-pilot`: current default; x64/arm64 artifacts are for internal/manual installation only and the manifest must say so;
- `signed-notarized`: opt-in trusted-public mode, activated only by explicit release policy plus protected Apple credentials.

The signed path is implemented, but as of 2026-09-06 the GitHub repository/environments contain no Apple Developer certificate/notarization secrets, so no signed/notarized release has been accepted. Absence of credentials must never masquerade as signed output.

Signed mode proves the full download trust chain rather than only the inner app:

1. Developer ID Application signs the app with hardened runtime;
2. the app is notarized and stapled;
3. the DMG is Developer-ID signed;
4. the final DMG bytes are submitted to Apple notarization, must return `Accepted`, and are stapled;
5. an independent verifier requires `codesign`, `stapler validate`, and Gatekeeper `Notarized Developer ID` acceptance for both app and DMG, plus the requested executable architecture;
6. only then may the platform receipt declare `signingState=signed-notarized`.

The DMG signed path disables pre-staple DMG update metadata because stapling mutates the disk-image bytes. macOS automatic updater/feed readiness remains a separate future acceptance; trusted manual-download signing does not implicitly enable auto-update.

## 6. Validation

Postflight rejects:

- missing required platform;
- duplicate asset basename;
- zero-size or unhashable asset;
- macOS artifact without architecture in name;
- architecture mismatch between platform receipt and package name;
- unknown signing state;
- update metadata referring to a missing file;
- asset version not equal to release tag version;
- platform receipt missing `runtimeValidation.status = passed`;
- runtime validation method other than `packaged-electron-playwright`;
- Linux receipt not proving the installed `.deb` executable;
- Linux packaged smoke using an insecure `basic_text`/`v10` secret-storage fallback.

## 7. Acceptance evidence

The first V3 cross-platform release is accepted only when the Published GitHub Release contains:

- Windows x64 installer;
- Linux x64 AppImage/deb/rpm;
- macOS x64 dmg/zip;
- macOS arm64 dmg/zip;
- Desktop manifest with all four platform receipts;
- SHA256SUMS covering every published Desktop asset;
- no duplicate names;
- exact tag/SHA identity;
- schema-v2 platform receipts containing packaged-runtime evidence for all four platforms.
