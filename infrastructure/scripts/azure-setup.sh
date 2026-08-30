#!/usr/bin/env bash
# ==============================================================================
# MashupHost ISP -- Azure Ubuntu 24.04 LTS production provisioner
#
# Run ONCE on a fresh VM, as a normal sudo-capable user (not root):
#   curl -fsSL <raw-url>/azure-setup.sh -o azure-setup.sh && bash azure-setup.sh
#
# Installs Docker, Caddy (with the Cloudflare DNS module, required for the
# *.mashuphost.tech wildcard certificate), and the host firewall. It does NOT
# deploy the app -- see docs/deployment/README.md for that.
# ==============================================================================
set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

if [[ $EUID -eq 0 ]]; then
  echo "Run as a normal sudo user, not root (the docker group add needs a real user)." >&2
  exit 1
fi

log "Updating base system"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y \
  curl wget git unzip htop ufw ca-certificates gnupg \
  debian-keyring debian-archive-keyring apt-transport-https

log "Installing Docker Engine + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
  echo "NOTE: log out and back in for docker group membership to take effect."
else
  echo "Docker already installed: $(docker --version)"
fi

log "Installing Caddy"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi

log "Adding the Cloudflare DNS module to Caddy (needed for the wildcard cert)"
# Replaces the caddy binary in place with one built to include the module.
sudo caddy add-package github.com/caddy-dns/cloudflare
caddy list-modules | grep -q 'dns.providers.cloudflare' \
  && echo "cloudflare DNS module present" \
  || { echo "FAILED: cloudflare DNS module missing -- the wildcard cert will not issue." >&2; exit 1; }

log "Configuring the host firewall (UFW)"
sudo ufw allow 22/tcp        comment 'SSH'
sudo ufw allow 80/tcp        comment 'HTTP (redirect to HTTPS)'
sudo ufw allow 443/tcp       comment 'HTTPS'
sudo ufw allow 443/udp       comment 'HTTP/3'
sudo ufw allow 1812/udp      comment 'FreeRADIUS auth'
sudo ufw allow 1813/udp      comment 'FreeRADIUS accounting'
sudo ufw allow 51820/udp     comment 'WireGuard VPN'
sudo ufw --force enable
sudo ufw status verbose

log "Done"
cat <<'NEXT'
Dependencies are installed. UFW is only half the story -- the Azure Network
Security Group must allow the same ports, or traffic never reaches this VM.

Next, follow docs/deployment/README.md:
  1. Clone the repo to /opt/mashuphost
  2. cp .env.production.example .env.production  and fill in every CHANGE_ME
  3. Put the Cloudflare API token in /etc/systemd/system/caddy.service.d/override.conf
  4. sudo cp infrastructure/caddy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl restart caddy
  5. docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
NEXT
