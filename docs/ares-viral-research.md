# ARES viral-research runner

ARES owns AI execution for the phonk.forum viral leaderboard. Railway only accepts a signed result, applies deterministic evidence checks, stores the snapshot, and serves it to the leaderboard.

## Production variables

Set these on the Railway `phonk-leaderboard` service:

```text
VIRAL_RESEARCH_PROVIDER=ares
VIRAL_RESEARCH_INGEST_SECRET=<random 32-byte-or-longer secret>
```

`OPENAI_API_KEY` is not required on Railway in ARES mode.

## Install on ARES

ARES must have Codex CLI installed and authenticated for the Windows account that owns the scheduled task. From a checkout of this repository, open an elevated PowerShell window and run:

```powershell
codex login status
.\scripts\install-ares-viral-research.ps1
```

The installer prompts for `VIRAL_RESEARCH_INGEST_SECRET`, restricts the local secret file ACL to the current user and SYSTEM, installs the runner under `%ProgramData%\phonk-forum\viral-research`, and registers `PhonkForum-ViralResearch` to run every six hours.

## Operations

```powershell
Get-ScheduledTask -TaskName PhonkForum-ViralResearch
Get-ScheduledTaskInfo -TaskName PhonkForum-ViralResearch
Get-Content "$env:ProgramData\phonk-forum\viral-research\runner.log" -Tail 50
Start-ScheduledTask -TaskName PhonkForum-ViralResearch
```

Each Codex run is ephemeral and read-only. The server rejects malformed payloads, candidates without two recent independent source domains, evidence older than 45 days, and claims that do not establish current TikTok momentum.
