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

$userDataPath = Join-Path $runtimeRoot 'user-data'
$userFilesPath = Join-Path $runtimeRoot 'user-files'
$statusPath = Join-Path $runtimeRoot 'status.json'
$registryPath = Join-Path $userDataPath 'shared\profiles\registry.json'
$sentinelPath = Join-Path $userDataPath 'shared\update-e2e-preservation.txt'
$receiptPath = Join-Path $userDataPath 'shared\update\install-receipt.json'

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
$lastRelaunchAttempt = [DateTime]::MinValue
$baseExitedAt = $null
$staleCandidateRecoveryAttempted = $false
$successStatus = $null

$managedEnvironment = @(
  'CI',
  'MEMOFLOW_DESKTOP_UPDATE_E2E',
  'MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION',
  'MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH',
  'MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL',
  'MEMOFLOW_DESKTOP_USER_DATA_PATH',
  'MEMOFLOW_DESKTOP_USER_FILES_PATH'
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
  Get-Process -Name 'memoflow' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

  $installedExecutable = Wait-ForInstalledExecutable -TimeoutSeconds 60
  Write-Host "[update-e2e] Installed executable: $installedExecutable"

  $env:CI = 'true'
  $env:MEMOFLOW_DESKTOP_UPDATE_E2E = '1'
  $env:MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION = $ExpectedVersion
  $env:MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH = $statusPath
  $env:MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL = $feedUrl
  $env:MEMOFLOW_DESKTOP_USER_DATA_PATH = $userDataPath
  $env:MEMOFLOW_DESKTOP_USER_FILES_PATH = $userFilesPath

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
        $runningMemoFlow = Get-Process -Name 'memoflow' -ErrorAction SilentlyContinue |
          Select-Object -First 1

        # Some NSIS launch modes do not preserve the parent environment when
        # starting the updated app. Only recover after the on-disk executable is
        # already N+1, so the runner never races an installer that is still
        # replacing the base executable.
        if (
          $null -ne $runningMemoFlow -and
          -not $staleCandidateRecoveryAttempted -and
          ($now - $baseExitedAt).TotalSeconds -ge 20
        ) {
          Write-Host '[update-e2e] Candidate did not report verification; restarting N+1 with runner environment'
          Get-Process -Name 'memoflow' -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
          $staleCandidateRecoveryAttempted = $true
          $runningMemoFlow = $null
        }

        if (
          $null -eq $runningMemoFlow -and
          ($now - $lastRelaunchAttempt).TotalSeconds -ge 8
        ) {
          try {
            Write-Host "[update-e2e] Relaunching installed N+1 ($installedVersion) for verification"
            Start-Process -FilePath $installedExecutable | Out-Null
            $manualRelaunchCount += 1
            $lastRelaunchAttempt = $now
          }
          catch {
            Write-Host "[update-e2e] Relaunch attempt deferred: $($_.Exception.Message)"
            $lastRelaunchAttempt = $now
          }
        }
      }
    }

    Start-Sleep -Seconds 2
  }

  if ($null -eq $successStatus) {
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
