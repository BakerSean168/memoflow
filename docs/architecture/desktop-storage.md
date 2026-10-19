# Desktop storage ownership

Issue #487 replaces the previous single-root layout. Existing local development data is disposable: there is no migration, fallback read, alias environment variable or dual write. Quit the app, use a fresh isolated test root, then sign in/sync again. Never recursively remove a user's selected Vault, Downloads or exported backup.

## Platform roots

The pure provider is `apps/desktop/src/main/paths/desktop-storage-roots.ts`. Shared/Profile resolvers derive from its result without filesystem effects.

| Category | Windows | Linux | macOS |
| --- | --- | --- | --- |
| CONFIG | APPDATA/Name | XDG_CONFIG_HOME/name (default ~/.config/name) | ~/Library/Application Support/Name/config |
| DATA | LOCALAPPDATA/Name/data | XDG_DATA_HOME/name (default ~/.local/share/name) | ~/Library/Application Support/Name/data |
| STATE | LOCALAPPDATA/Name/state | XDG_STATE_HOME/name (default ~/.local/state/name) | ~/Library/Application Support/Name/state |
| CACHE | LOCALAPPDATA/Name/cache | XDG_CACHE_HOME/name (default ~/.cache/name) | ~/Library/Caches/Name |
| Logs | STATE/logs | STATE/logs | ~/Library/Logs/Name |

Name is MemoFlow, MemoFlow-Dev or MemoFlow-Test; Linux uses lowercase. Windows validates independently supplied absolute APPDATA and LOCALAPPDATA Known Folder values, including redirected folders. Local is never derived from Roaming's parent. Linux accepts only absolute nonempty XDG values; relative, empty and unset values use the specification defaults.

CONFIG holds small preferences in shared/preferences. DATA holds device identity, the account registry and protected credentials in shared, and profiles/<profileId>/{auth,db,storage}. STATE holds shared/profile UI state and update/install-receipts/install-receipt.json. CACHE holds snapshot-staging, downloads-internal and temporary reconstructible bytes. Profile IDs are validated before joining paths.

## Electron lifecycle

The first main-entry import configures storage before ready or Session construction. Electron userData is CONFIG/electron; sessionData is DATA/chromium-session. Bootstrap creates only these required private directories and logs; Profile directories are created when opening a Profile, other business directories by their writers. Private directories use mode 0700 where supported.

Persisted shell/profile cookies, Local Storage and IndexedDB belong to DATA. Cache clearing uses Electron Session.clearCache() for open sessions and deletes only CACHE. It never recursively deletes sessionData, offline SQLite/auth, update receipts or external files.

## User files

Import/export/backup uses native open/save dialogs. The application does not own a common user-files root or create Documents/Downloads/export folders. Before confirmation it performs no writes. After a successful operation it records the selected parent as a CONFIG preference; inaccessible saved directories fall back to the system dialog default. Canceling leaves the filesystem unchanged. Internal download staging stays in CACHE; completed user files stay at the chosen destination.

## Isolated acceptance

Set only `MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT` to an absolute disposable path. Its config/data/state/cache children replace platform roots, and logs are in state/logs on every platform. Do not combine test runs using the same directory. Desktop, packaged-runtime, web desktop harnesses and update runners use this contract.

Local scripts resolve the same provider; reset commands require the app to be stopped and affect only app-owned semantic roots. They do not search for or remove user-owned files. Historical single-root directories are not read or migrated automatically.

Windows native NSIS/redirected Known Folders and macOS packaged smoke require their actual target operating systems. Unit tests on Linux prove path derivation, not native OS installation or dialog behavior.
