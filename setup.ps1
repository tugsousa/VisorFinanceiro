<#
.SYNOPSIS
    Sets up VisorFinanceiro on this PC after cloning the project.

.DESCRIPTION
    1. Installs Go and Node.js with winget if they're missing or too old.
    2. Builds dist\VisorFinanceiro.exe (build-desktop.bat).
    3. Installs Claude Desktop if it's missing, and adds VisorFinanceiro to it as an MCP server.

    It can be run again at any time, for example after pulling changes, to rebuild the app.
    Run it with setup.bat, which takes the same parameters.

.PARAMETER SkipClaude
    Don't install or configure Claude Desktop.

.PARAMETER SkipLauncher
    Don't build the launcher ("Abrir VisorFinanceiro.exe"); the launcher passes it when it runs the setup.

.EXAMPLE
    setup.bat
#>
param(
    [switch]$SkipClaude,
    [switch]$SkipLauncher
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$exe = Join-Path $root 'dist\VisorFinanceiro.exe'
$launcherName = 'Abrir VisorFinanceiro.exe'
$dataDir = Join-Path $env:LOCALAPPDATA 'VisorFinanceiro'

$minGo = [version]'1.24'
$minNode = [version]'18.0'

function Write-Step([string]$message) {
    Write-Host ''
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Stop-Setup([string]$message) {
    Write-Host ''
    Write-Host "Setup failed: $message" -ForegroundColor Red
    exit 1
}

# Programs installed by winget are added to the PATH of new windows only; this updates this one.
function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

# Returns the version that "command argument" prints, or $null when the command isn't installed.
function Get-ToolVersion([string]$command, [string]$argument, [string]$pattern) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { return $null }
    try {
        $output = (& $command $argument) -join ' '
    } catch {
        return $null
    }
    if ($output -match $pattern) { return [version]$Matches[1] }
    return $null
}

function Get-GoVersion { Get-ToolVersion 'go' 'version' 'go(\d+\.\d+(\.\d+)?)' }
function Get-NodeVersion { Get-ToolVersion 'node' '--version' 'v(\d+\.\d+\.\d+)' }

function Invoke-Winget([string]$verb, [string]$id) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Stop-Setup "winget isn't available. Install 'App Installer' from the Microsoft Store, or install $id by hand, then run setup again."
    }
    & winget $verb --id $id --exact --silent --accept-package-agreements --accept-source-agreements | Out-Host
    $code = $LASTEXITCODE
    Update-SessionPath
    return $code
}

# Installs or upgrades a tool until it's at least the minimum version.
function Install-Tool([string]$name, [string]$wingetId, [scriptblock]$getVersion, [version]$minimum) {
    $version = & $getVersion
    if ($version -and $version -ge $minimum) {
        Write-Host "$name $version is installed."
        return
    }
    if ($version) {
        Write-Host "$name $version is older than $minimum; upgrading it with winget..."
        Invoke-Winget 'upgrade' $wingetId | Out-Null
    } else {
        Write-Host "$name isn't installed; installing it with winget (Windows may ask for permission)..."
        Invoke-Winget 'install' $wingetId | Out-Null
    }
    $version = & $getVersion
    if (-not $version -or $version -lt $minimum) {
        Stop-Setup "$name $minimum or newer is needed. Install it from its website, then open a new window and run setup again."
    }
    Write-Host "$name $version is installed."
}

# The folders where Claude Desktop may read its configuration: the one of the Microsoft Store
# version (inside its package folder) and the one of the other installer.
function Get-ClaudeConfigDirs {
    $dirs = @()
    $packages = Join-Path $env:LOCALAPPDATA 'Packages'
    if (Test-Path $packages) {
        Get-ChildItem $packages -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue | ForEach-Object {
            $dirs += Join-Path $_.FullName 'LocalCache\Roaming\Claude'
        }
    }
    $classic = Join-Path $env:APPDATA 'Claude'
    if ((Test-Path $classic) -or $dirs.Count -eq 0) { $dirs += $classic }
    return $dirs
}

function Test-ClaudeInstalled {
    if (Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue) { return $true }
    if (Test-Path (Join-Path $env:LOCALAPPDATA 'AnthropicClaude')) { return $true }
    if (Get-AppxPackage -Name '*Claude*' -ErrorAction SilentlyContinue) { return $true }
    return $false
}

# Adds VisorFinanceiro to claude_desktop_config.json, keeping everything else in it.
function Set-ClaudeMcpServer([string]$configDir) {
    $file = Join-Path $configDir 'claude_desktop_config.json'
    $config = $null
    if (Test-Path $file) {
        $text = Get-Content $file -Raw -Encoding UTF8
        if ($text -and $text.Trim()) {
            try {
                $config = $text | ConvertFrom-Json
            } catch {
                Write-Host "Skipped $file : it isn't valid JSON, so it was left as it is. Fix it, or add VisorFinanceiro by hand (see backend\README.md)." -ForegroundColor Yellow
                return $false
            }
        }
        Copy-Item $file "$file.bak" -Force
    }
    if (-not $config) { $config = [pscustomobject]@{} }
    if (-not $config.PSObject.Properties['mcpServers'] -or -not $config.mcpServers) {
        $config | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue ([pscustomobject]@{}) -Force
    }

    $entry = [pscustomobject]@{ command = $exe; args = @('mcp') }
    $config.mcpServers | Add-Member -NotePropertyName 'visorfinanceiro' -NotePropertyValue $entry -Force

    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
    $json = $config | ConvertTo-Json -Depth 32
    # Without a byte order mark, which JSON readers don't all accept.
    [IO.File]::WriteAllText($file, $json, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "Added VisorFinanceiro to $file"
    return $true
}

Write-Host 'VisorFinanceiro setup' -ForegroundColor Green
Write-Host "Project: $root"

# --- 1. Tools --------------------------------------------------------------------------------
Write-Step 'Checking Go and Node.js'
Update-SessionPath
Install-Tool 'Go' 'GoLang.Go' { Get-GoVersion } $minGo
Install-Tool 'Node.js' 'OpenJS.NodeJS.LTS' { Get-NodeVersion } $minNode

# --- 2. Build ----------------------------------------------------------------------------------
Write-Step 'Building dist\VisorFinanceiro.exe'
# A running copy (the app, or the MCP server started by Claude Desktop) locks the file.
$running = Get-Process -Name 'VisorFinanceiro' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host 'Closing the running VisorFinanceiro so it can be replaced (Claude Desktop starts it again when needed)...'
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
}
& cmd.exe /c "`"$(Join-Path $root 'build-desktop.bat')`""
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) {
    Stop-Setup 'the build failed; see the messages above.'
}

# The launcher can't replace itself while it's running this setup, so it skips this step.
if (-not $SkipLauncher) {
    Write-Step "Building $launcherName"
    Push-Location (Join-Path $root 'launcher')
    try {
        & go build -trimpath -ldflags '-s -w' -o (Join-Path $root $launcherName) .
        if ($LASTEXITCODE -ne 0) { Stop-Setup 'the launcher build failed; see the messages above.' }
    } finally {
        Pop-Location
    }
}

# --- 3. Claude Desktop -----------------------------------------------------------------------
if (-not $SkipClaude) {
    Write-Step 'Adding VisorFinanceiro to Claude Desktop'
    if (-not (Test-ClaudeInstalled)) {
        Write-Host "Claude Desktop isn't installed; installing it with winget..."
        Invoke-Winget 'install' 'Anthropic.Claude' | Out-Null
        if (-not (Test-ClaudeInstalled)) {
            Write-Host 'Claude Desktop could not be installed automatically. Install it from https://claude.ai/download and run setup again.' -ForegroundColor Yellow
        }
    }
    $configured = $false
    foreach ($dir in Get-ClaudeConfigDirs) {
        if (Set-ClaudeMcpServer $dir) { $configured = $true }
    }
    if ($configured -and (Get-Process -Name 'claude' -ErrorAction SilentlyContinue)) {
        Write-Host 'Claude Desktop is open: quit it (also from the system tray) and open it again to load VisorFinanceiro.' -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host "- The app: double-click $(Join-Path $root $launcherName). It rebuilds the app when the code changed, then opens it in the browser"
Write-Host "- Your data: $dataDir"
if (-not $SkipClaude) {
    Write-Host '- In Claude Desktop, VisorFinanceiro is under the tools ("+" > Connectors) of a new chat.'
}
if (-not (Test-Path (Join-Path $dataDir 'visorfinanceiro.db'))) {
    Write-Host '- There is no data yet: open the app and upload your broker exports.'
}
