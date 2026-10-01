# Temporary public link: starts a Cloudflare quick tunnel, writes its address into .env.public,
# then runs a second server on port 8001 with its own database (public-trial.db).
# Usage, from the project folder:  .\start-public.ps1      Stop with Ctrl+C (the tunnel stops too).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$cloudflared = ".tools\cloudflared-windows-amd64.exe"
if (-not (Test-Path $cloudflared)) {
    throw "Missing $cloudflared. Download cloudflared-windows-amd64.exe from https://github.com/cloudflare/cloudflared/releases into the .tools folder."
}

$log = ".tools\tunnel.log"
if (Test-Path $log) { Clear-Content $log }
$tunnel = Start-Process -FilePath $cloudflared -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://localhost:8001" `
    -RedirectStandardError $log -RedirectStandardOutput ".tools\tunnel.out.log" -WindowStyle Hidden -PassThru

try {
    # cloudflared prints the address a few seconds after it starts.
    $url = $null
    for ($i = 0; $i -lt 45 -and -not $url; $i++) {
        Start-Sleep -Seconds 1
        $match = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($match) { $url = $match.Matches[0].Value }
    }
    if (-not $url) { throw "The tunnel gave no address after 45 seconds. See $log." }

    @(
        "APP_BASE_URL=$url",
        "CORS_ORIGINS=$url",
        "DEMO_PUBLIC=true",
        "ENABLE_DEMO_LOGIN=true",
        "DEMO_ACCOUNTS_PER_HOUR=10",
        "DEMO_RETENTION_DAYS=3",
        "DATABASE_URL=sqlite+aiosqlite:///./public-trial.db"
    ) | Set-Content -Path ".env.public" -Encoding ascii

    Write-Host ""
    Write-Host "Public link: $url" -ForegroundColor Green
    Write-Host "It can take up to a minute before the link answers. Press Ctrl+C to stop."
    Write-Host ""
    & ".venv\Scripts\python.exe" -m uvicorn backend.app.main:app --env-file .env.public --host 127.0.0.1 --port 8001
}
finally {
    Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
}
