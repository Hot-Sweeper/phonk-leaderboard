[CmdletBinding()]
param(
  [string]$Endpoint = "https://phonk.forum/api/internal/viral-research",
  [string]$SecretPath = "$env:ProgramData\phonk-forum\viral-research.secret",
  [string]$WorkDirectory = "$env:ProgramData\phonk-forum\viral-research"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-RunnerLog([string]$Message) {
  $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
  Add-Content -LiteralPath (Join-Path $WorkDirectory "runner.log") -Value "[$timestamp] $Message" -Encoding UTF8
}

if ($env:COMPUTERNAME -ne "ARES") {
  throw "This worker is restricted to ARES; current computer is $env:COMPUTERNAME."
}

$codex = Get-Command codex -ErrorAction Stop
if (-not (Test-Path -LiteralPath $SecretPath)) {
  throw "Missing ingestion secret at $SecretPath."
}

New-Item -ItemType Directory -Path $WorkDirectory -Force | Out-Null
$schemaPath = Join-Path $WorkDirectory "schema.json"
$promptPath = Join-Path $WorkDirectory "prompt.md"
if (-not (Test-Path -LiteralPath $schemaPath) -or -not (Test-Path -LiteralPath $promptPath)) {
  throw "ARES worker assets are missing. Re-run install-ares-viral-research.ps1."
}

$secret = (Get-Content -LiteralPath $SecretPath -Raw).Trim()
if (-not $secret) { throw "The ingestion secret is empty." }

$resultPath = Join-Path $WorkDirectory ("result-{0}.json" -f [guid]::NewGuid().ToString("N"))
$prompt = Get-Content -LiteralPath $promptPath -Raw
$arguments = @(
  "exec",
  "--ephemeral",
  "--sandbox", "read-only",
  "--skip-git-repo-check",
  "--ignore-rules",
  "--output-schema", $schemaPath,
  "--output-last-message", $resultPath,
  "--cd", $WorkDirectory
)

$featureList = (& $codex.Source features list 2>$null | Out-String)
if ($featureList -match "standalone_web_search") {
  $arguments += @("--enable", "standalone_web_search")
}
$arguments += "-"

try {
  Write-RunnerLog "Starting Codex viral research."
  $prompt | & $codex.Source @arguments | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "codex exec exited with code $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath $resultPath)) { throw "Codex did not write a result file." }

  $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
  if ($null -eq $result.candidates) { throw "Codex output did not contain candidates." }

  $codexVersion = (& $codex.Source --version | Out-String).Trim()
  $payload = [ordered]@{
    runner = "ARES"
    model = $codexVersion
    candidates = @($result.candidates)
  } | ConvertTo-Json -Depth 12 -Compress

  $headers = @{ Authorization = "Bearer $secret" }
  $response = Invoke-RestMethod -Uri $Endpoint -Method Post -Headers $headers -ContentType "application/json" -Body $payload -TimeoutSec 120
  Write-RunnerLog "Accepted=$($response.accepted) Rejected=$($response.rejected) Sources=$($response.sourceCount)."
} catch {
  Write-RunnerLog "FAILED: $($_.Exception.Message)"
  throw
} finally {
  if (Test-Path -LiteralPath $resultPath) {
    Remove-Item -LiteralPath $resultPath -Force
  }
}
