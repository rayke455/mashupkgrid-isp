# ==============================================================================
# MashupHost ISP - Automated Windows Server Azure VM Setup Script
# Run in PowerShell as Administrator on your Azure Windows Server
# ==============================================================================

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "🚀 Starting MashupHost ISP Windows Server Setup..." -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Enable TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# 2. Install Chocolatey Package Manager (if not installed)
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "📦 Installing Chocolatey package manager..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 3. Install Git, Node.js LTS, pnpm, Caddy, and PostgreSQL
Write-Host "📦 Installing Git, Node.js, pnpm, Caddy & dependencies..." -ForegroundColor Yellow
choco install -y git nodejs-lts caddy postgresql16

# Install pnpm globally
npm install -g pnpm pm2

# 4. Open Windows Defender Firewall Ports
Write-Host "🛡️ Configuring Windows Defender Firewall Rules..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "HTTP (Port 80)" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "HTTPS (Port 443)" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "Fastify API (Port 4000)" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "Next.js Web (Port 3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "FreeRADIUS Auth (Port 1812)" -Direction Inbound -LocalPort 1812 -Protocol UDP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "FreeRADIUS Acct (Port 1813)" -Direction Inbound -LocalPort 1813 -Protocol UDP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "WireGuard VPN (Port 51820)" -Direction Inbound -LocalPort 51820 -Protocol UDP -Action Allow -ErrorAction SilentlyContinue

Write-Host "=======================================================" -ForegroundColor Green
Write-Host "✅ Windows Server dependencies installed successfully!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Clone your project: git clone <REPO_URL>" -ForegroundColor White
Write-Host "2. Run: pnpm install && pnpm build" -ForegroundColor White
Write-Host "3. Start with PM2: pm2 start infrastructure/pm2/ecosystem.config.cjs" -ForegroundColor White
Write-Host "4. Start Caddy: caddy run --config infrastructure/caddy/Caddyfile" -ForegroundColor White
Write-Host "=======================================================" -ForegroundColor Green
