$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDir

function Stop-WithMessage([string]$message) {
    Write-Host "`n[页间] $message" -ForegroundColor Red
    Write-Host "请按任意键关闭窗口……"
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Stop-WithMessage '没有找到 Node.js。请先安装 Node.js 22 或更高版本。'
}

$nodeMajor = [int]((& node.exe --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
    Stop-WithMessage 'Node.js 版本过低，请升级到 Node.js 22 或更高版本。'
}

if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules\.bin\vinext.cmd'))) {
    Write-Host '[页间] 第一次启动，正在安装运行组件，请稍候……' -ForegroundColor Cyan
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage '运行组件安装失败，请检查网络后重试。' }
}

if (Get-NetTCPConnection -LocalPort 3010 -State Listen -ErrorAction SilentlyContinue) {
    Stop-WithMessage '3010 端口已被占用。请关闭已运行的页间或占用该端口的程序后再启动。'
}
Write-Host '[页间] 正在启动本地阅读器……' -ForegroundColor Green
$server = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $projectDir -NoNewWindow -PassThru
$url = 'http://localhost:3010/'
$ready = $false

for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($server.HasExited) { Stop-WithMessage '阅读器没有成功启动，请查看上方错误信息。' }
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready = $true; break }
    } catch {}
}

if (-not $ready) {
    if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    Stop-WithMessage '等待启动超时，请确认 3010 端口没有被其他程序占用。'
}

Start-Process $url
Write-Host "[页间] 已在浏览器打开 $url" -ForegroundColor Green
Write-Host '[页间] 阅读时请保留此窗口；关闭窗口即可停止服务。'
Wait-Process -Id $server.Id
