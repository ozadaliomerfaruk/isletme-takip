# =============================================================================
# Supabase FULL database backup (defter-app / ulohxpkhesxozwnlnonb)
#
# Usage:
#   $env:SUPABASE_DB_PASSWORD = "<database-password>"
#   powershell -File scripts\backup-db.ps1
#
# Outputs (backups/<date>/db/):
#   roles.sql   - database roles
#   schema.sql  - full schema (tables/views/functions/triggers/RLS; public+auth+storage+cron)
#   data.sql    - all data (COPY format; INCLUDES auth schema = user accounts)
#   full.dump   - pg_dump -Fc single file (double safety; restore with pg_restore)
#
# READ-ONLY: this script only DUMPS. pg_dump/pg_dumpall never write to the live
# database, so it cannot change, delete, or corrupt any production data.
#
# NOTE: Storage files (islem-photos) are NOT in this dump -> scripts\backup-storage.mjs
# NOTE: backups/ is gitignored - NEVER commit (contains password hashes + personal data).
#
# This file is ASCII-only ON PURPOSE: Windows PowerShell 5.1 reads .ps1 as the
# system ANSI codepage when there is no BOM, which corrupts non-ASCII characters
# and breaks parsing. Keep this file ASCII so it runs regardless of encoding.
# =============================================================================
$ErrorActionPreference = 'Stop'

if (-not $env:SUPABASE_DB_PASSWORD) {
  throw "SUPABASE_DB_PASSWORD env var is empty. First run: `$env:SUPABASE_DB_PASSWORD = '...'"
}

$ref   = 'ulohxpkhesxozwnlnonb'
$pgBin = "$env:TEMP\pgsql-extract\pgsql\bin"
if (-not (Test-Path "$pgBin\pg_dump.exe")) {
  throw "pg_dump not found at $pgBin - portable PostgreSQL binaries are missing."
}

$today  = Get-Date -Format 'yyyy-MM-dd'
$outDir = Join-Path (Get-Location) "backups\$today\db"
New-Item -ItemType Directory -Force $outDir | Out-Null

$env:PGPASSWORD = $env:SUPABASE_DB_PASSWORD

# Run a native pg tool via Start-Process so its stderr goes to a file instead of
# being wrapped by PowerShell as a terminating NativeCommandError (which would
# abort the script on harmless notices). Throws only on a non-zero exit code.
function Invoke-Pg {
  param(
    [Parameter(Mandatory)][string]$Exe,
    [Parameter(Mandatory)][string[]]$PgArgs,
    [Parameter(Mandatory)][string]$Label
  )
  $errLog = Join-Path $env:TEMP 'pg-stderr.log'
  $outLog = Join-Path $env:TEMP 'pg-stdout.log'
  $p = Start-Process -FilePath $Exe -ArgumentList $PgArgs -NoNewWindow -Wait -PassThru `
         -RedirectStandardError $errLog -RedirectStandardOutput $outLog
  $stderr = (Get-Content $errLog -Raw -ErrorAction SilentlyContinue)
  if ($p.ExitCode -ne 0) { throw "$Label FAILED (exit $($p.ExitCode)): $stderr" }
  if ($stderr -and $stderr.Trim()) { Write-Host "  ($Label notes) $($stderr.Trim())" }
}

# Pick a working session-pooler host. A project's shard can be aws-0 OR aws-1;
# this project is on aws-1 (verified 2026-06-15). Direct host needs IPv6 on the
# free tier, so we use the IPv4 session pooler.
$candidates = @('aws-1-eu-central-1.pooler.supabase.com','aws-0-eu-central-1.pooler.supabase.com')
$connHost = $null
foreach ($h in $candidates) {
  $probeErr = Join-Path $env:TEMP 'pg-probe-err.log'
  $probeOut = Join-Path $env:TEMP 'pg-probe-out.log'
  $p = Start-Process -FilePath "$pgBin\psql.exe" `
        -ArgumentList @('-h',$h,'-p','5432','-U',"postgres.$ref",'-d','postgres','-w','-c','select 1') `
        -NoNewWindow -Wait -PassThru -RedirectStandardError $probeErr -RedirectStandardOutput $probeOut
  if ($p.ExitCode -eq 0) { $connHost = $h; break }
}
if (-not $connHost) { throw "Could not connect to pooler (wrong password or network block)." }
Write-Host "Connection OK: $connHost"

$U           = "postgres.$ref"
$base        = @('-h',$connHost,'-p','5432','-U',$U,'-d','postgres')
$allSchemas  = @('-n','public','-n','auth','-n','storage','-n','cron')
$dataSchemas = @('-n','public','-n','auth','-n','storage')

Write-Host "1/4 roles.sql..."
Invoke-Pg "$pgBin\pg_dumpall.exe" @('-h',$connHost,'-p','5432','-U',$U,'--roles-only','-f',"$outDir\roles.sql") 'roles dump'

Write-Host "2/4 schema.sql..."
Invoke-Pg "$pgBin\pg_dump.exe" ($base + @('--schema-only') + $allSchemas + @('-f',"$outDir\schema.sql")) 'schema dump'

Write-Host "3/4 data.sql (COPY format, auth included)..."
Invoke-Pg "$pgBin\pg_dump.exe" ($base + @('--data-only') + $dataSchemas + @('-f',"$outDir\data.sql")) 'data dump'

Write-Host "4/4 full.dump (pg_dump -Fc, single-file double safety)..."
Invoke-Pg "$pgBin\pg_dump.exe" ($base + @('-Fc') + $allSchemas + @('-f',"$outDir\full.dump")) 'full dump'

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

Get-ChildItem $outDir | Select-Object Name, @{N='MB';E={[Math]::Round($_.Length/1MB,2)}} | Format-Table -AutoSize
Write-Host "DONE. Also copy this folder OUTSIDE the repo (external disk / Drive)."
