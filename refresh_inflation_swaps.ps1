# refresh_inflation_swaps.ps1 - scheduled local capture + push for inflation swaps
$ErrorActionPreference = "Stop"
$repo = "C:\Users\bmonchablon\Documents\GitHub\smallfish-rates-regime"
$log  = Join-Path $repo "refresh_swaps.log"

function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Add-Content $log }

# Run a native command, appending merged stdout+stderr to the log.
# $ErrorActionPreference is relaxed for the duration of the call: under "Stop",
# PowerShell 5.1 wraps a native exe's redirected stderr in a NativeCommandError
# and treats it as terminating even when the exe exited 0. $LASTEXITCODE stays
# the source of truth for success/failure.
function Run($exe, [string[]]$argv) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $exe @argv 2>&1 | Add-Content $log }
    finally { $ErrorActionPreference = $prev }
}

Set-Location $repo
Log "=== run start ==="
try {
    Run "py" @("fetch_inflation_swaps.py")
    if ($LASTEXITCODE -ne 0) { Log "fetch failed (exit $LASTEXITCODE)"; exit 1 }

    git diff --quiet -- data/inflation_swaps.csv
    if ($LASTEXITCODE -eq 0) { Log "no data change"; exit 0 }

    Run "git" @("add", "data/inflation_swaps.csv")
    Run "git" @("commit", "-m", "data: inflation swaps (scheduled local capture)")
    Run "git" @("pull", "--no-rebase", "--no-edit")
    Run "git" @("push")
    if ($LASTEXITCODE -ne 0) { Log "push failed (exit $LASTEXITCODE)"; exit 1 }
    Log "pushed OK"
} catch {
    Log "ERROR: $_"
    exit 1
}
