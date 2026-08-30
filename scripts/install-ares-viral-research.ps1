[CmdletBinding()]
param(
  [string]$IngestSecret,
  [string]$InstallDirectory = "$env:ProgramData\phonk-forum\viral-research",
  [string]$TaskName = "PhonkForum-ViralResearch"
)

$ErrorActionPreference = "Stop"

if ($env:COMPUTERNAME -ne "ARES") {
  throw "Run this installer on ARES; current computer is $env:COMPUTERNAME."
}

$codex = Get-Command codex -ErrorAction Stop
& $codex.Source login status | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Codex is not authenticated for the current ARES user. Run 'codex login' first."
}

if (-not $IngestSecret) {
  $secureSecret = Read-Host "Paste VIRAL_RESEARCH_INGEST_SECRET" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
  try {
    $IngestSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}
if ([string]::IsNullOrWhiteSpace($IngestSecret)) { throw "The ingestion secret cannot be empty." }

New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
$sourceDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$runnerPath = Join-Path $InstallDirectory "run.ps1"
$schemaPath = Join-Path $InstallDirectory "schema.json"
$promptPath = Join-Path $InstallDirectory "prompt.md"
$secretPath = Join-Path (Split-Path -Parent $InstallDirectory) "viral-research.secret"

Copy-Item -LiteralPath (Join-Path $sourceDirectory "ares-viral-research.ps1") -Destination $runnerPath -Force
Copy-Item -LiteralPath (Join-Path $sourceDirectory "ares-viral-research.schema.json") -Destination $schemaPath -Force
Copy-Item -LiteralPath (Join-Path $sourceDirectory "ares-viral-research.prompt.md") -Destination $promptPath -Force
Set-Content -LiteralPath $secretPath -Value $IngestSecret -Encoding UTF8 -NoNewline

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$systemIdentity = [Security.Principal.SecurityIdentifier]::new("S-1-5-18")
$acl = [Security.AccessControl.FileSecurity]::new()
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, "FullControl", "Allow"))
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($systemIdentity, "FullControl", "Allow"))
Set-Acl -LiteralPath $secretPath -AclObject $acl

$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$actionArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runnerPath`""
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $actionArguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 6)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) -ExecutionTimeLimit (New-TimeSpan -Minutes 45)
$userId = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Runs the ARES Codex agent that researches current viral phonk for phonk.forum." -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed and started $TaskName on ARES."
Write-Host "Logs: $(Join-Path $InstallDirectory 'runner.log')"
