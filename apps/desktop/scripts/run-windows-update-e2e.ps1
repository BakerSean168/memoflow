param(
  [Parameter(Mandatory = $true)]
  [string]$BaseInstaller,

  [Parameter(Mandatory = $true)]
  [string]$CandidateFeedDir,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedVersion,

  [Parameter(Mandatory = $true)]
  [string]$ReportPath,

  [string]$RuntimeRoot = '',

  [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-StringSha256([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return [Convert]::ToHexString($hash).ToLowerInvariant()
}

function Get-RegistrySemanticFingerprint([string]$Path) {
  $registry = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  $profiles = @(
    $registry.profiles |
      Sort-Object profileId |
      ForEach-Object {
        [ordered]@{
          profileId = $_.profileId
          profileKind = $_.profileKind
          localOwnerId = $_.localOwnerId
          displayName = $_.displayName
          avatarSeed = $_.avatarSeed
          keyEnvelopeId = $_.keyEnvelopeId
          identifier = $_.identifier
          cloudBinding = $_.cloudBinding
          createdAt = $_.createdAt
          hasSnapshot = $_.hasSnapshot
          lastSnapshotVersion = $_.lastSnapshotVersion
          lastSnapshotHydratedAt = $_.lastSnapshotHydratedAt
          status = $_.status
        }
      }
  )
  $semantic = [ordered]@{
    version = $registry.version
    activeProfileId = $registry.activeProfileId
    profiles = $profiles
  } | ConvertTo-Json -Depth 20 -Compress
  return Get-StringSha256 $semantic
}

function Wait-ForInstalledExecutable([int]$TimeoutSeconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $programsRoot = Join-Path $env:LOCALAPPDATA 'Programs'

  while ([DateTime]::UtcNow -lt $deadline) {
    $preferred = Join-Path $programsRoot 'MemoFlow\memoflow.exe'
    if (Test-Path -LiteralPath $preferred) {
      return (Resolve-Path -LiteralPath $preferred).Path
    }

    if (Test-Path -LiteralPath $programsRoot) {
      $match = Get-ChildItem -LiteralPath $programsRoot -Filter 'memoflow.exe' -File -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if ($null -ne $match) {
        return $match.FullName
      }
    }

    Start-Sleep -Seconds 2
  }

  throw "MemoFlow installed executable was not found within $TimeoutSeconds seconds"
}

function Get-MemoFlowUpdateInstallers {
  $updaterRoot = Join-Path $env:LOCALAPPDATA '@memoflowdesktop-updater'
  @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    $_.Name -like 'MemoFlow-Windows-*-Setup.exe' -or
    ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($updaterRoot + '\', [StringComparison]::OrdinalIgnoreCase))
  })
}

function Stop-And-Drain-MemoFlowProcesses([int]$TimeoutSeconds = 30) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $emptyPolls = 0

  while ([DateTime]::UtcNow -lt $deadline) {
    # An installer still copying files can launch --updated after two quiet
    # application samples. Wait for it to finish; never kill it mid-install.
    $installers = @(Get-MemoFlowUpdateInstallers)
    if ($installers.Count -gt 0) {
      $emptyPolls = 0
      Start-Sleep -Seconds 1
      continue
    }
    $running = @(Get-Process -Name 'memoflow' -ErrorAction SilentlyContinue)
    if ($running.Count -eq 0) {
      $emptyPolls += 1
      # Require two quiet samples: NSIS can spawn --updated after the first
      # process exits. A one-shot Stop-Process does not prove the handoff is idle.
      if ($emptyPolls -ge 2) { return }
    }
    else {
      $emptyPolls = 0
      foreach ($process in $running) {
        try {
          $process.Kill($true)
        }
        catch {
          # The process may have exited between enumeration and kill.
          Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
      }
    }
    Start-Sleep -Seconds 1
  }

  throw "MemoFlow installer/app processes did not settle within $TimeoutSeconds seconds"
}

function Get-E2EStatus([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  }
  catch {
    return $null
  }
}

function Get-InstalledProductVersion([string]$ExecutablePath) {
  if (-not (Test-Path -LiteralPath $ExecutablePath)) {
    return $null
  }

  try {
    return [System.Diagnostics.FileVersionInfo]::GetVersionInfo($ExecutablePath).ProductVersion
  }
  catch {
    return $null
  }
}

function Write-FailureDiagnostics(
  [string]$Path,
  [string]$InstalledExecutable,
  [System.Diagnostics.Process]$BaseProcess,
  [Nullable[DateTime]]$BaseExitedAt
) {
  $processes = @()
  try {
    $processes = @(
      Get-CimInstance Win32_Process -ErrorAction Stop |
        Where-Object {
          $_.Name -ieq 'memoflow.exe' -or
          ($_.CommandLine -and $_.CommandLine -match 'MemoFlow-Windows-.+-Setup\\.exe')
        } |
        Select-Object ProcessId, Name, ExecutablePath, CommandLine
    )
  }
  catch {
    $processes = @()
  }

  $updaterCacheFiles = @()
  try {
    $updaterRoots = @(
      Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match 'updater' }
    )
    $updaterCacheFiles = @(
      $updaterRoots |
        ForEach-Object {
          Get-ChildItem -LiteralPath $_.FullName -File -Recurse -ErrorAction SilentlyContinue
        } |
        Sort-Object FullName |
        Select-Object -First 200 FullName, Length, LastWriteTimeUtc
    )
  }
  catch {
    $updaterCacheFiles = @()
  }

  $diagnostics = [ordered]@{
    recordedAt = [DateTime]::UtcNow.ToString('o')
    installedExecutable = $InstalledExecutable
    installedVersion = Get-InstalledProductVersion $InstalledExecutable
    baseProcessId = if ($null -ne $BaseProcess) { $BaseProcess.Id } else { $null }
    baseProcessHasExited = if ($null -ne $BaseProcess) { $BaseProcess.HasExited } else { $null }
    # PowerShell unwraps a bound Nullable[DateTime] as DateTime; .Value throws under StrictMode.
    baseExitedAt = if ($null -ne $BaseExitedAt) { ([DateTime]$BaseExitedAt).ToUniversalTime().ToString('o') } else { $null }
    matchingProcesses = $processes
    updaterCacheFiles = $updaterCacheFiles
  }

  $diagnostics | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Path -Encoding utf8
}

if ($env:RUNNER_OS -and $env:RUNNER_OS -ne 'Windows') {
  throw 'Desktop Update installed E2E requires a Windows runner'
}

$BaseInstaller = (Resolve-Path -LiteralPath $BaseInstaller).Path
$CandidateFeedDir = (Resolve-Path -LiteralPath $CandidateFeedDir).Path
$ReportPath = [System.IO.Path]::GetFullPath($ReportPath)

$metadataPath = Join-Path $CandidateFeedDir 'latest.yml'
if (-not (Test-Path -LiteralPath $metadataPath)) {
  throw "candidate feed is missing latest.yml: $metadataPath"
}

$candidateInstallers = @(Get-ChildItem -LiteralPath $CandidateFeedDir -Filter '*Setup.exe' -File)
if ($candidateInstallers.Count -ne 1) {
  throw "candidate feed must contain exactly one Setup.exe, found $($candidateInstallers.Count)"
}
$candidateInstaller = $candidateInstallers[0].FullName

if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) {
  $runtimeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("memoflow-update-e2e-" + [guid]::NewGuid().ToString('N'))
}
else {
  $runtimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
  Remove-Item -LiteralPath $runtimeRoot -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

$storageTestRoot = Join-Path $runtimeRoot 'user-data'
$userDataPath = Join-Path $storageTestRoot 'data'
$statusPath = Join-Path $runtimeRoot 'status.json'
$registryPath = Join-Path $userDataPath 'shared\profiles\registry.json'
$sentinelPath = Join-Path $userDataPath 'shared\update-e2e-preservation.txt'
$receiptPath = Join-Path $storageTestRoot 'state\update\install-receipts\install-receipt.json'

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $registryPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $sentinelPath) | Out-Null
@{
  version = 2
  activeProfileId = $null
  profiles = @()
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $registryPath -Encoding utf8
"memoflow-update-e2e-preserve" | Set-Content -LiteralPath $sentinelPath -Encoding utf8

$registryBefore = $null
$sentinelBefore = Get-Sha256 $sentinelPath

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$python = (Get-Command python -ErrorAction Stop).Source
$server = Start-Process -FilePath $python -ArgumentList @(
  '-m',
  'http.server',
  "$port",
  '--bind',
  '127.0.0.1',
  '--directory',
  $CandidateFeedDir
) -PassThru -WindowStyle Hidden

$feedUrl = "http://127.0.0.1:$port"
$baseProcess = $null
$manualRelaunchCount = 0
$baseExitedAt = $null
$staleCandidateRecoveryAttempted = $false
$controlledCandidateProcess = $null
$controlledCandidateStartedAt = $null
$successStatus = $null

$managedEnvironment = @(
  'CI',
  'MEMOFLOW_DESKTOP_UPDATE_E2E',
  'MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION',
  'MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH',
  'MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL',
  'MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT'
)
$previousEnvironment = @{}
foreach ($name in $managedEnvironment) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  Write-Host "[update-e2e] Installing base: $BaseInstaller"
  $installBase = Start-Process -FilePath $BaseInstaller -ArgumentList '/S' -PassThru -Wait
  if ($installBase.ExitCode -ne 0) {
    throw "base installer exited with code $($installBase.ExitCode)"
  }

  # If the assisted NSIS template launches the app even for a silent install,
  # terminate that uncontrolled first launch before applying the isolated E2E
  # userData/feed environment below.
  Stop-And-Drain-MemoFlowProcesses -TimeoutSeconds 30

  $installedExecutable = Wait-ForInstalledExecutable -TimeoutSeconds 60
  Write-Host "[update-e2e] Installed executable: $installedExecutable"

  $env:CI = 'true'
  $env:MEMOFLOW_DESKTOP_UPDATE_E2E = '1'
  $env:MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION = $ExpectedVersion
  $env:MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH = $statusPath
  $env:MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL = $feedUrl
  $env:MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT = $storageTestRoot

  Write-Host "[update-e2e] Launching N against $feedUrl"
  $baseProcess = Start-Process -FilePath $installedExecutable -PassThru

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    $status = Get-E2EStatus $statusPath
    if ($null -ne $status) {
      Write-Host "[update-e2e] phase=$($status.phase) current=$($status.currentVersion) expected=$($status.expectedVersion)"
      if ($null -eq $registryBefore -and (Test-Path -LiteralPath $registryPath)) {
        $registryBefore = Get-RegistrySemanticFingerprint $registryPath
        Write-Host "[update-e2e] captured base Profile registry semantic fingerprint=$registryBefore"
      }
      if ($status.phase -eq 'failed') {
        throw "Desktop Update E2E failed: $($status.detail)"
      }
      if ($status.phase -eq 'candidate-verified') {
        $successStatus = $status
        break
      }
    }

    if ($null -ne $baseProcess -and $baseProcess.HasExited) {
      $now = [DateTime]::UtcNow
      if ($null -eq $baseExitedAt) {
        $baseExitedAt = $now
      }

      $installedVersion = Get-InstalledProductVersion $installedExecutable
      $candidateInstalled =
        $installedVersion -and
        $installedVersion.StartsWith($ExpectedVersion, [System.StringComparison]::Ordinal)

      if ($candidateInstalled) {
        # NSIS's --updated launch does not inherit the PowerShell runner's
        # isolated E2E environment. Wait for the installer to finish its
        # handoff, then drain the uncontrolled process tree exactly once.
        # Do not judge a controlled N+1 launch against the OLD baseExitedAt:
        # the previous script killed its own N+1 after approximately 2 seconds.
        if (
          -not $staleCandidateRecoveryAttempted -and
          ($now - $baseExitedAt).TotalSeconds -ge 20
        ) {
          Write-Host '[update-e2e] Settling NSIS auto-relaunch before controlled N+1 verification'
          Stop-And-Drain-MemoFlowProcesses -TimeoutSeconds 30
          $staleCandidateRecoveryAttempted = $true

          $candidateEnvironment = @{
            CI = 'true'
            MEMOFLOW_DESKTOP_UPDATE_E2E = '1'
            MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION = $ExpectedVersion
            MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH = $statusPath
            MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL = $feedUrl
            MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT = $storageTestRoot
          }
          Write-Host "[update-e2e] Launching controlled N+1 ($installedVersion) with isolated userData=$userDataPath"
          $controlledCandidateProcess = Start-Process -FilePath $installedExecutable -Environment $candidateEnvironment -PassThru
          $controlledCandidateStartedAt = [DateTime]::UtcNow
          $manualRelaunchCount += 1
          Write-Host "[update-e2e] Controlled candidate pid=$($controlledCandidateProcess.Id)"
        }
        elseif ($null -ne $controlledCandidateProcess) {
          $controlledAge = ($now - $controlledCandidateStartedAt).TotalSeconds
          # A verified candidate writes candidate-verified before quitting;
          # the status check at the top of this loop wins over this branch.
          if ($controlledCandidateProcess.HasExited -and $controlledAge -ge 5) {
            Write-FailureDiagnostics -Path (Join-Path $runtimeRoot 'failure-diagnostics.json') -InstalledExecutable $installedExecutable -BaseProcess $baseProcess -BaseExitedAt $baseExitedAt
            throw "Controlled N+1 process exited before candidate-verified (pid=$($controlledCandidateProcess.Id))"
          }
          if ($controlledAge -ge 120) {
            Write-FailureDiagnostics -Path (Join-Path $runtimeRoot 'failure-diagnostics.json') -InstalledExecutable $installedExecutable -BaseProcess $baseProcess -BaseExitedAt $baseExitedAt
            throw "Controlled N+1 process did not verify its update receipt within 120 seconds"
          }
        }
      }
    }

    Start-Sleep -Seconds 2
  }

  if ($null -eq $successStatus) {
    $baseExited = if ($null -ne $baseProcess) { $baseProcess.HasExited } else { $null }
    $lastInstalledVersion = Get-InstalledProductVersion $installedExecutable
    Write-Host "[update-e2e] timeout baseExited=$baseExited installedVersion=$lastInstalledVersion expectedVersion=$ExpectedVersion"
    $diagnosticsPath = Join-Path $runtimeRoot 'failure-diagnostics.json'
    Write-FailureDiagnostics `
      -Path $diagnosticsPath `
      -InstalledExecutable $installedExecutable `
      -BaseProcess $baseProcess `
      -BaseExitedAt $baseExitedAt
    Write-Host "[update-e2e] wrote failure diagnostics: $diagnosticsPath"
    throw "Desktop Update E2E did not reach candidate-verified within $TimeoutSeconds seconds"
  }

  if ($successStatus.currentVersion -ne $ExpectedVersion) {
    throw "candidate reported version $($successStatus.currentVersion), expected $ExpectedVersion"
  }

  if (Test-Path -LiteralPath $receiptPath) {
    throw "update receipt still exists after candidate verification: $receiptPath"
  }

  if ($null -eq $registryBefore) {
    throw 'base Profile registry semantic fingerprint was never captured'
  }

  $registryAfter = Get-RegistrySemanticFingerprint $registryPath
  $sentinelAfter = Get-Sha256 $sentinelPath
  if ($registryAfter -ne $registryBefore) {
    throw 'Profile registry semantic identity changed across installed update'
  }
  if ($sentinelAfter -ne $sentinelBefore) {
    throw 'userData preservation sentinel changed across installed update'
  }

  $report = [ordered]@{
    kind = 'desktop-update-installed-e2e'
    schemaVersion = 1
    result = 'passed'
    expectedVersion = $ExpectedVersion
    feedUrl = $feedUrl
    baseInstaller = [ordered]@{
      name = [System.IO.Path]::GetFileName($BaseInstaller)
      sha256 = Get-Sha256 $BaseInstaller
    }
    candidate = [ordered]@{
      installer = [System.IO.Path]::GetFileName($candidateInstaller)
      installerSha256 = Get-Sha256 $candidateInstaller
      metadata = 'latest.yml'
      metadataSha256 = Get-Sha256 $metadataPath
    }
    installedExecutable = $installedExecutable
    installedExecutableSha256 = Get-Sha256 $installedExecutable
    manualRelaunchCount = $manualRelaunchCount
    profileRegistrySemanticSha256Before = $registryBefore
    profileRegistrySemanticSha256After = $registryAfter
    preservationSentinelSha256Before = $sentinelBefore
    preservationSentinelSha256After = $sentinelAfter
    receiptCleared = $true
    finalStatus = $successStatus
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReportPath) | Out-Null
  $report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ReportPath -Encoding utf8
  Write-Host "[update-e2e] PASS report=$ReportPath"
}
finally {
  Get-Process -Name 'memoflow' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

  if ($null -ne $server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }

  foreach ($name in $managedEnvironment) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
  }
}
