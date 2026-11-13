$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$frontendRoot = Join-Path $projectRoot 'frontend'
$pythonPath = Join-Path $backendRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    Push-Location $backendRoot
    try {
        py -3.13 -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.13 with: py install 3.13' }
        & $pythonPath -m pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies could not be installed.' }
    } finally { Pop-Location }
}
Push-Location $backendRoot
try {
    & $pythonPath bootstrap.py
    if ($LASTEXITCODE -ne 0) { throw 'Local setup failed.' }
    & $pythonPath -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
} finally { Pop-Location }
$apiListener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $apiListener) {
    Start-Process -FilePath $pythonPath -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000','--no-access-log' -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $backendRoot 'server.log') -RedirectStandardError (Join-Path $backendRoot 'server-error.log') | Out-Null
}
Push-Location $frontendRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) { npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Frontend dependencies could not be installed.' } }
    Write-Host 'Open http://127.0.0.1:5173/connect in your browser.'
    if (-not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) {
        $viteEntry = Join-Path $frontendRoot 'node_modules\vite\bin\vite.js'
        $nodePath = (Get-Command node.exe).Source
        Start-Process -FilePath $nodePath -ArgumentList ('"' + $viteEntry + '"'),'--host','127.0.0.1','--port','5173','--strictPort' -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $frontendRoot 'server.log') -RedirectStandardError (Join-Path $frontendRoot 'server-error.log') | Out-Null
    } else { Write-Host 'The frontend is already running.' }
} finally { Pop-Location }
