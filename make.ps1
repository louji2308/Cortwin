param(
    [Parameter(Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Target = "help"
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebDir = Join-Path $Root "web"
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$Python = if (Test-Path $VenvPython) { $VenvPython } else { "python" }

function Write-LoudError([string]$Message) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
}

function Assert-Producer([string]$RelativePath, [string]$TargetName, [string]$Owner) {
    if (-not (Test-Path (Join-Path $Root $RelativePath))) {
        Write-LoudError "'make $TargetName' is not implemented yet (owner: $Owner): missing $RelativePath"
        exit 1
    }
}

function Invoke-Data {
    Assert-Producer "pipeline\fetch_data.py" "data" "B0-2"
    & $Python (Join-Path $Root "pipeline\fetch_data.py")
    exit $LASTEXITCODE
}

function Invoke-Reproduce {
    Assert-Producer "pipeline\reproduce.py" "reproduce" "B0-2"
    & $Python (Join-Path $Root "pipeline\reproduce.py")
    exit $LASTEXITCODE
}

function Invoke-Export {
    Assert-Producer "pipeline/export_model.py" "export" "B0-2"
    & $Python (Join-Path $Root "pipeline\export_model.py")
    exit $LASTEXITCODE
}

function Invoke-Test {
    & $Python -m pytest -q
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Push-Location $WebDir
    try {
        npm run test
        $Code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    exit $Code
}

function Invoke-Web {
    Push-Location $WebDir
    try {
        npm run dev
        $Code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    exit $Code
}

function Invoke-Build {
    Push-Location $WebDir
    try {
        npm run build
        $Code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    exit $Code
}

function Invoke-Preview {
    Push-Location $WebDir
    try {
        npm run preview
        $Code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    exit $Code
}

function Invoke-Lint {
    & $Python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('ruff') else 1)"
    if ($LASTEXITCODE -ne 0) {
        Write-LoudError "ruff not found - install with 'pip install -r requirements.txt' (lint toolchain owner: B0-1)"
        exit 1
    }
    & $Python -m ruff check .
    exit $LASTEXITCODE
}

function Show-Help {
    Write-Host "CorTwin make targets (Windows shim, decision D-03):"
    Write-Host "  .\make.ps1 data       fetch + checksum the dataset (owner: B0-2)"
    Write-Host "  .\make.ps1 reproduce  retrain + validate -> results.json, model.json, fixtures (owner: B0-2)"
    Write-Host "  .\make.ps1 export     export the runtime model bundle (owner: B0-2)"
    Write-Host "  .\make.ps1 test       pytest + vitest"
    Write-Host "  .\make.ps1 web        vite dev server"
    Write-Host "  .\make.ps1 build      production web build -> web/dist"
    Write-Host "  .\make.ps1 serve      serve the production build (alias: preview)"
    Write-Host "  .\make.ps1 lint       ruff check ."
}

switch ($Target) {
    "help" { Show-Help }
    "data" { Invoke-Data }
    "reproduce" { Invoke-Reproduce }
    "export" { Invoke-Export }
    "test" { Invoke-Test }
    "web" { Invoke-Web }
    "build" { Invoke-Build }
    "serve" { Invoke-Preview }
    "preview" { Invoke-Preview }
    "lint" { Invoke-Lint }
    default {
        Write-LoudError "unknown target '$Target'. Run '.\make.ps1 help' for the target list."
        exit 1
    }
}
