# Windows MemoFlow to WSL Obsidian

## Supported flow

In Windows MemoFlow Desktop, select the existing local Obsidian Vault through
its Windows UNC filesystem path, for example:

    \\wsl.localhost\Ubuntu-24.04\home\baker\projects\thought-forest

The Repository module retains responsibility for checking that a requested note
exists within the selected Vault and generating an obsidian://open?path= URI.

On Windows only, ExternalEditorPort detects paths rooted at
\\wsl.localhost\<distro> (also the older \\wsl$\<distro>), maps the UNC address to
its Linux absolute path, and invokes the distro's URI handler directly:

    wsl.exe --distribution Ubuntu-24.04 --exec /usr/bin/xdg-open 'obsidian://open?path=/home/baker/projects/thought-forest'

No shell is involved, so zsh glob expansion cannot corrupt the query string.
The WSL handler is registered via xdg-mime; it can point to an existing custom
Obsidian WSLg launcher and can reuse an already-running Obsidian instance.

## Unchanged behavior

- Windows-native Vaults still use Electron shell.openExternal().
- Linux/macOS MemoFlow still use their OS-native Obsidian handler.
- The Vault is not copied, moved, or synchronized by the bridge.
- Windows still needs UNC read access for selecting and scanning the Vault.
  This adapter does not alter note indexing or filesystem watching.
- Already installed v0.15.2 binaries do NOT include the new bridge.
  A Windows Desktop rebuild and release are needed after this change merges.

## Prerequisites and troubleshooting

Inside WSL, check the Linux URI handler:

    xdg-mime query default x-scheme-handler/obsidian

From Windows PowerShell, verify that the handler can open the Vault:

    wsl.exe -d Ubuntu-24.04 -e /usr/bin/xdg-open 'obsidian://open?vault=thought-forest'

If it fails, register Obsidian as the distro's handler. MemoFlow propagates
launch errors rather than silently falling back to a Windows handler.
