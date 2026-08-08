# =============================================================================
# Supabase logical database backup (defter-app / ulohxpkhesxozwnlnonb)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
#
# Requirements:
#   - Docker Desktop must be running.
#   - Enter the remote database password at the hidden prompt.
#
# Outputs (backups/<timestamp>/db-complete/):
#   roles.sql     - database roles
#   schema.sql    - schema, functions, triggers, grants, and RLS policies
#   data.sql      - application, Auth, and Storage metadata (COPY format)
#   manifest.json - sizes, SHA-256 hashes, and structural verification counts
#
# READ-ONLY: supabase db dump / pg_dump only read the production database.
# Storage object bytes are not included; use scripts\backup-storage.mjs for them.
# backups/ is gitignored because dumps contain personal data and password hashes.
#
# This file is ASCII-only on purpose for Windows PowerShell 5.1 compatibility.
# =============================================================================
$ErrorActionPreference = 'Stop'

$projectRef = 'ulohxpkhesxozwnlnonb'
$cliVersion = '2.111.0'
$repoRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
$outDir = Join-Path $repoRoot "backups\$timestamp\db-complete"

function Test-DockerReady {
  $docker = Get-Command 'docker.exe' -ErrorAction SilentlyContinue
  if (-not $docker) {
    throw 'Docker Desktop is required by Supabase CLI but docker.exe was not found.'
  }

  $dockerOut = Join-Path $env:TEMP 'defter-backup-docker-out.log'
  $dockerErr = Join-Path $env:TEMP 'defter-backup-docker-err.log'
  $process = Start-Process -FilePath $docker.Source -ArgumentList @('info') `
    -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $dockerOut -RedirectStandardError $dockerErr
  if ($process.ExitCode -ne 0) {
    throw 'Docker Desktop is not running. Start it, wait until it is ready, then run this script again.'
  }
}

function Set-DatabasePassword {
  if ($env:SUPABASE_DB_PASSWORD) {
    return $false
  }

  $securePassword = Read-Host 'Supabase database password' -AsSecureString
  if (-not $securePassword -or $securePassword.Length -eq 0) {
    throw 'Database password cannot be empty.'
  }

  $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $env:SUPABASE_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }

  return $true
}

function Invoke-SupabaseDump {
  param(
    [Parameter(Mandatory)][string[]]$DumpArgs,
    [Parameter(Mandatory)][string]$Label
  )

  $npx = Get-Command 'npx.cmd' -ErrorAction Stop
  $stdoutLog = Join-Path $outDir "$Label.stdout.log"
  $stderrLog = Join-Path $outDir "$Label.stderr.log"
  $arguments = @('--yes', "supabase@$cliVersion", 'db', 'dump', '--linked') + $DumpArgs

  $process = Start-Process -FilePath $npx.Source -ArgumentList $arguments `
    -WorkingDirectory $repoRoot -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

  $stderr = Get-Content $stderrLog -Raw -ErrorAction SilentlyContinue
  if ($process.ExitCode -ne 0) {
    throw "$Label failed (exit $($process.ExitCode)): $stderr"
  }

  if ($stderr -and $stderr.Trim()) {
    Write-Host "  $Label notes: $($stderr.Trim())"
  }
}

function Assert-BackupFile {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][long]$MinimumBytes
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Backup file was not created: $Path"
  }

  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt $MinimumBytes) {
    throw "Backup file is unexpectedly small: $Path ($($item.Length) bytes)"
  }
}

Test-DockerReady
$passwordWasPrompted = Set-DatabasePassword
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

try {
  $rolesPath = Join-Path $outDir 'roles.sql'
  $schemaPath = Join-Path $outDir 'schema.sql'
  $dataPath = Join-Path $outDir 'data.sql'

  Write-Host '1/3 roles.sql...'
  Invoke-SupabaseDump -DumpArgs @('--role-only', '--file', $rolesPath) -Label 'roles'

  Write-Host '2/3 schema.sql...'
  Invoke-SupabaseDump -DumpArgs @('--file', $schemaPath) -Label 'schema'

  Write-Host '3/3 data.sql (COPY format, Auth included)...'
  Invoke-SupabaseDump -DumpArgs @('--data-only', '--use-copy', '--file', $dataPath) -Label 'data'

  Assert-BackupFile -Path $rolesPath -MinimumBytes 100
  Assert-BackupFile -Path $schemaPath -MinimumBytes 10000
  Assert-BackupFile -Path $dataPath -MinimumBytes 1000

  $createTableCount = @(Select-String -Path $schemaPath -Pattern '^CREATE TABLE ').Count
  $createFunctionCount = @(Select-String -Path $schemaPath -Pattern '^CREATE (OR REPLACE )?FUNCTION ').Count
  $copyCount = @(Select-String -Path $dataPath -Pattern '^COPY ').Count
  $copyTerminatorCount = @(Select-String -Path $dataPath -Pattern '^\\\.$').Count

  if ($createTableCount -eq 0) {
    throw 'Schema verification failed: no CREATE TABLE statements found.'
  }
  if ($copyCount -eq 0 -or $copyCount -ne $copyTerminatorCount) {
    throw "Data verification failed: COPY=$copyCount terminators=$copyTerminatorCount"
  }

  $files = @($rolesPath, $schemaPath, $dataPath) | ForEach-Object {
    $item = Get-Item -LiteralPath $_
    $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
    [ordered]@{
      name = $item.Name
      bytes = $item.Length
      sha256 = $hash.Hash
    }
  }

  $manifest = [ordered]@{
    project_ref = $projectRef
    created_at = (Get-Date).ToString('o')
    supabase_cli_version = $cliVersion
    restore_format = 'official Supabase CLI roles + schema + data SQL'
    verification = [ordered]@{
      create_table_count = $createTableCount
      create_function_count = $createFunctionCount
      copy_section_count = $copyCount
      copy_terminator_count = $copyTerminatorCount
    }
    files = $files
  }
  $manifestPath = Join-Path $outDir 'manifest.json'
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  Get-ChildItem -File $outDir | Where-Object { $_.Name -notmatch '\.(stdout|stderr)\.log$' } |
    Select-Object Name, @{N='MB';E={[Math]::Round($_.Length / 1MB, 2)}} |
    Format-Table -AutoSize

  Write-Host "BACKUP_OK: $outDir"
  Write-Host 'Copy this folder to an encrypted external disk or private cloud location.'
}
finally {
  if ($passwordWasPrompted) {
    Remove-Item Env:\SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  }
}
