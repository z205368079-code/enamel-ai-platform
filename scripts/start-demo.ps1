$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktopFolder = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Enamel AI 演示'
$linksPath = Join-Path $desktopFolder '演示入口.html'

function Wait-Docker {
  $deadline = (Get-Date).AddSeconds(90)

  while ((Get-Date) -lt $deadline) {
    & docker info *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 3
  }

  throw 'Docker Desktop 未能在 90 秒内启动。请打开 Docker Desktop，等左下角显示 Engine running 后再双击本启动器。'
}

function Wait-Http {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        return $true
      }
    } catch {
      # 服务仍在启动；继续等待。
    }
    Start-Sleep -Seconds 3
  }

  return $false
}

function Get-LocalEnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $envPath = Join-Path $repoRoot '.env'
  if (-not (Test-Path -LiteralPath $envPath)) {
    return $null
  }

  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match "^$([regex]::Escape($Name))=(.*)$") {
      return $matches[1].Trim('"')
    }
  }

  return $null
}

function Get-WidgetUrl {
  $accountId = Get-LocalEnvValue -Name 'CHATWOOT_ACCOUNT_ID'
  $apiToken = Get-LocalEnvValue -Name 'CHATWOOT_API_TOKEN'

  if (-not $accountId -or -not $apiToken) {
    return 'http://127.0.0.1:3002/'
  }

  try {
    $headers = @{ api_access_token = $apiToken }
    $inboxes = Invoke-RestMethod -Uri "http://127.0.0.1:3002/api/v1/accounts/$accountId/inboxes" -Headers $headers -TimeoutSec 10
    $inbox = @($inboxes.payload | Where-Object { $_.website_token }) | Select-Object -First 1

    if ($inbox -and $inbox.website_token) {
      $token = [uri]::EscapeDataString([string]$inbox.website_token)
      return "http://127.0.0.1:3002/widget?website_token=$token#/messages"
    }
  } catch {
    # 没有 Widget Token 时仍可从 Chatwoot 后台进入。
  }

  return 'http://127.0.0.1:3002/'
}

function Write-DemoLinks {
  param([Parameter(Mandatory = $true)][string]$WidgetUrl)

  New-Item -ItemType Directory -Force -Path $desktopFolder | Out-Null

  $html = @"
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Enamel AI 演示入口</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; max-width: 760px; margin: 48px auto; color: #172033; background: #f6f8fc; }
    h1 { margin-bottom: 8px; } p { color: #586174; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 28px; }
    a { display: block; padding: 22px; border-radius: 12px; background: white; color: #125cc6; text-decoration: none; box-shadow: 0 2px 10px #d9e0ef; font-weight: 700; }
    a small { display: block; margin-top: 8px; color: #586174; font-weight: 400; }
  </style>
</head>
<body>
  <h1>Enamel AI Platform 演示入口</h1>
  <p>本页由“启动 Enamel AI 演示”自动生成。Dashboard 仅供本机演示，客户聊天入口由 Chatwoot 提供。</p>
  <div class="grid">
    <a href="http://127.0.0.1:3001/">运营 Dashboard<small>统计、Knowledge Gap、架构说明</small></a>
    <a href="http://127.0.0.1:3002/">Chatwoot 管理后台<small>人工客服与会话管理</small></a>
    <a href="$WidgetUrl">客户聊天入口<small>模拟客户发起咨询</small></a>
    <a href="http://127.0.0.1:8080/">MaxKB 管理后台<small>知识库与 RAG 应用</small></a>
    <a href="http://127.0.0.1:3001/#overview">系统健康状态<small>可视化展示 Gateway 连通性、延迟和运行指标</small></a>
    <a href="https://github.com/z205368079-code/enamel-ai-platform">GitHub 项目仓库<small>代码、架构和面试文档</small></a>
  </div>
</body>
</html>
"@

  Set-Content -LiteralPath $linksPath -Value $html -Encoding UTF8
}

Write-Host '== Enamel AI Platform 演示启动器 ==' -ForegroundColor Cyan

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  $dockerDesktop = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
  if (-not (Test-Path -LiteralPath $dockerDesktop)) {
    throw '未找到 Docker Desktop。请先安装或手动启动 Docker Desktop。'
  }

  Write-Host '正在启动 Docker Desktop…'
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
}

Wait-Docker
Set-Location $repoRoot

Write-Host '正在启动 Gateway 与 PostgreSQL…'
& docker compose --env-file .env -f infra/docker-compose.yml up -d
if ($LASTEXITCODE -ne 0) { throw 'Gateway Compose 启动失败。' }

Write-Host '正在启动 Chatwoot…'
& docker compose -f infra/chatwoot-compose.yml up -d
if ($LASTEXITCODE -ne 0) { throw 'Chatwoot Compose 启动失败。' }

$maxkbState = & docker inspect -f '{{.State.Running}}' enamel-maxkb 2>$null
if ($LASTEXITCODE -eq 0 -and $maxkbState -ne 'true') {
  Write-Host '正在启动已有 MaxKB 容器…'
  & docker start enamel-maxkb | Out-Null
} elseif ($LASTEXITCODE -ne 0) {
  Write-Warning '未找到名为 enamel-maxkb 的本地容器；入口页仍会保留 MaxKB 地址。'
}

if (-not (Wait-Http -Url 'http://127.0.0.1:3000/health' -TimeoutSeconds 75)) {
  throw 'Gateway 未能正常启动。请检查 Docker Desktop 和本地 .env。'
}

if (-not (Wait-Http -Url 'http://127.0.0.1:3002/' -TimeoutSeconds 75)) {
  throw 'Chatwoot 未能正常启动。请检查 Docker 容器日志。'
}

if (-not (Wait-Http -Url 'http://127.0.0.1:3001/' -TimeoutSeconds 3)) {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'apps\dashboard\dist\server.js'))) {
    Write-Host '首次启动 Dashboard，正在构建…'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard 构建失败。' }
  }

  Write-Host '正在启动 Dashboard…'
  Start-Process -FilePath 'node.exe' -ArgumentList 'apps/dashboard/dist/server.js' -WorkingDirectory $repoRoot -WindowStyle Hidden
  if (-not (Wait-Http -Url 'http://127.0.0.1:3001/' -TimeoutSeconds 30)) {
    throw 'Dashboard 未能正常启动。请确认 .env 中已配置 INTERNAL_API_TOKEN。'
  }
}

$widgetUrl = Get-WidgetUrl
Write-DemoLinks -WidgetUrl $widgetUrl

Write-Host ''
Write-Host '演示服务已就绪。正在打开桌面入口页。' -ForegroundColor Green
Write-Host "Dashboard: http://127.0.0.1:3001/"
Write-Host "Chatwoot:  http://127.0.0.1:3002/"
Write-Host "MaxKB:     http://127.0.0.1:8080/"
Start-Process -FilePath $linksPath
