# Deploying MashupHost ISP to Azure

Target: a single Azure Ubuntu 24.04 LTS VM serving `mashuphost.tech`, with Caddy terminating
TLS in front of the Docker Compose stack (Postgres, Redis, API, worker, web).

```
Internet ──► Cloudflare DNS ──► Azure VM public IP
                                     │
                                  Caddy :443  (TLS, DNS-01 wildcard cert)
                                     ├─► localhost:3000  web   (Next.js)
                                     └─► localhost:4000  api   (Fastify)
                                            │
                              docker network │  (no published ports)
                                     ├─► postgres:5432
                                     └─► redis:6379
                                  worker  ──► :1812/:1813 udp (RADIUS, public)
```

Nothing but Caddy and RADIUS is reachable from the internet. Postgres and Redis publish no host
ports at all — this is the most important difference from `docker-compose.yml`, which is for
local development only and exposes both with weak default credentials.

---

## 1. Azure — create the VM

The Windows VM is not usable for this stack (no Redis build for Windows; the WireGuard and Caddy
tooling here is Linux). Delete it and create Ubuntu in its place.

```bash
az login

RG=mashuphost-rg
LOC=southafricanorth        # lowest-latency Azure region for Kenya
VM=mashuphost-vm

az group create --name $RG --location $LOC

az vm create \
  --resource-group $RG \
  --name $VM \
  --image Ubuntu2404 \
  --size Standard_B2ms \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --public-ip-address-allocation static \
  --os-disk-size-gb 64
```

**Size:** `Standard_B2ms` (2 vCPU / 8 GB). Do not go below this — the Next.js production build
runs inside Docker and reliably OOMs on 4 GB. If you must use `Standard_B2s`, add swap first:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**The static IP is not optional.** A dynamic public IP changes whenever the VM is deallocated,
and every DNS record below would silently break.

### Network Security Group

UFW on the VM is not enough — the Azure NSG sits in front of it and denies by default.

```bash
NSG=${VM}NSG

az network nsg rule create -g $RG --nsg-name $NSG -n allow-http   --priority 1001 \
  --destination-port-ranges 80  --protocol Tcp --access Allow
az network nsg rule create -g $RG --nsg-name $NSG -n allow-https  --priority 1002 \
  --destination-port-ranges 443 --protocol '*' --access Allow
az network nsg rule create -g $RG --nsg-name $NSG -n allow-radius --priority 1003 \
  --destination-port-ranges 1812 1813 --protocol Udp --access Allow \
  --source-address-prefixes '<YOUR_ROUTER_PUBLIC_IPS>'
az network nsg rule create -g $RG --nsg-name $NSG -n allow-wireguard --priority 1004 \
  --destination-port-ranges 51820 --protocol Udp --access Allow
```

Scope the RADIUS rule to your MikroTik routers' public IPs. Leaving 1812/1813 open to the world
invites shared-secret brute-forcing against your NAS clients.

Narrow the default SSH rule to your own address too:

```bash
az network nsg rule update -g $RG --nsg-name $NSG -n default-allow-ssh \
  --source-address-prefixes "$(curl -s ifconfig.me)/32"
```

Record the public IP — every DNS record needs it:

```bash
az vm show -d -g $RG -n $VM --query publicIps -o tsv
```

---

## 2. Cloudflare — DNS and the wildcard certificate

The `*.mashuphost.tech` tenant subdomains need a wildcard TLS certificate, and Let's Encrypt only
issues wildcards over the DNS-01 challenge. DNS-01 requires Caddy to write DNS records through an
API, which get.tech's own DNS panel does not offer. Hence Cloudflare — the free tier is enough.

1. Create a free Cloudflare account. **Add a site** → `mashuphost.tech` → Free plan. Cloudflare
   shows two nameservers, e.g. `ana.ns.cloudflare.com` / `bob.ns.cloudflare.com`.
2. In the **get.tech** control panel → your domain → **Nameservers** → *Custom*, replace both
   entries with Cloudflare's. Propagation is usually minutes, occasionally up to 24 h.
3. In Cloudflare **DNS → Records**, add (replace `<VM_IP>`):

   | Type | Name     | Content   | Proxy status |
   |------|----------|-----------|--------------|
   | A    | `@`      | `<VM_IP>` | DNS only     |
   | A    | `www`    | `<VM_IP>` | DNS only     |
   | A    | `api`    | `<VM_IP>` | DNS only     |
   | A    | `app`    | `<VM_IP>` | DNS only     |
   | A    | `admin`  | `<VM_IP>` | DNS only     |
   | A    | `wifi`   | `<VM_IP>` | DNS only     |
   | A    | `portal` | `<VM_IP>` | DNS only     |
   | A    | `*`      | `<VM_IP>` | DNS only     |

   **Set every record to "DNS only" (grey cloud), not proxied (orange cloud), for the first
   deploy.** Cloudflare's proxy terminates TLS itself, which fights Caddy for certificate
   issuance and hides the real client IP from the API's rate limiter. You can turn the proxy on
   for the web hosts later — but leave `api` unproxied, so M-Pesa callbacks reach Fastify
   untouched.

4. Create the API token Caddy will use: **My Profile → API Tokens → Create Token → Custom**
   - Permissions: `Zone` → `DNS` → `Edit`, **and** `Zone` → `Zone` → `Read`
   - Zone Resources: Include → Specific zone → `mashuphost.tech`

   Both permissions are required — DNS:Edit alone fails at zone lookup. Copy the token now;
   Cloudflare never shows it again.

---

## 3. GitHub — push the repo

The repo starts with **no commits and no remote**. From your workstation:

```bash
gh repo create mashupkgrid-isp --private --source=. --remote=origin
git add -A
git commit -m "Initial commit: MashupHost ISP platform"
git push -u origin master
```

Before pushing, confirm nothing secret is staged — `.env`, `.env.production`, `.whatsapp-auth/`
and `packages/database/*.cjs` are all gitignored:

```bash
git status --porcelain | grep -E '\.env$|\.env\.production|whatsapp-auth|database/.*\.cjs' \
  && echo "STOP: secret file staged" || echo "clean"
```

> The earlier `.env.production.example` committed real 32-byte hex values for
> `JWT_ACCESS_SECRET`, `JWT_REFRESH_PEPPER` and `ENCRYPTION_KEY`. They are placeholders now. If
> those same values are live in your local `.env`, **regenerate them** rather than carrying them
> into production.

On the VM, pull with a read-only deploy key:

```bash
ssh-keygen -t ed25519 -C "mashuphost-vm" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub    # → GitHub repo → Settings → Deploy keys → Add key (read-only)
```

---

## 4. Server — provision and deploy

SSH in as `azureuser`, then:

### 4.1 Dependencies

```bash
git clone git@github.com:<you>/mashupkgrid-isp.git /opt/mashuphost
cd /opt/mashuphost
bash infrastructure/scripts/azure-setup.sh
```

Log out and back in afterwards so docker group membership applies.

### 4.2 Production environment

```bash
cd /opt/mashuphost
cp .env.production.example .env.production
chmod 600 .env.production

for k in JWT_ACCESS_SECRET JWT_REFRESH_PEPPER ENCRYPTION_KEY; do
  echo "$k=$(openssl rand -hex 32)"
done

nano .env.production
```

Paste those three secrets, set a strong `POSTGRES_PASSWORD` (mirroring it into `DATABASE_URL`),
and fill in the live M-Pesa and SMS credentials. Every `CHANGE_ME` and `YOUR_*` must go.

### 4.3 Caddy

The Cloudflare token goes in a systemd override, not in the Caddyfile — the Caddyfile is in git.

```bash
sudo mkdir -p /etc/systemd/system/caddy.service.d
sudo nano /etc/systemd/system/caddy.service.d/override.conf
```

with:

```ini
[Service]
Environment="CLOUDFLARE_API_TOKEN=paste_the_token_here"
```

then:

```bash
sudo chmod 600 /etc/systemd/system/caddy.service.d/override.conf
sudo systemctl daemon-reload
sudo cp infrastructure/caddy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo journalctl -u caddy -f     # watch certificates issue; Ctrl-C when it goes quiet
```

### 4.4 Bring up the stack

First build takes 10–20 minutes.

```bash
cd /opt/mashuphost
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

The one-shot `migrate` service runs `prisma migrate deploy` and must exit 0 before `api` and
`worker` start. If they never come up, read its log first:

```bash
docker compose -f docker-compose.prod.yml logs migrate
```

Seed the first platform super-admin:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -w /repo/packages/database migrate pnpm tsx prisma/seed.ts
```

---

## 5. Verify

```bash
curl -sI https://mashuphost.tech          | head -1
curl -s  https://api.mashuphost.tech/health
curl -sI https://anytenant.mashuphost.tech | head -1   # proves the wildcard cert
echo | openssl s_client -connect api.mashuphost.tech:443 2>/dev/null \
  | openssl x509 -noout -dates -subject
```

Then in a browser: `https://mashuphost.tech` (dashboard), `https://app.mashuphost.tech`
(customer app), `https://wifi.mashuphost.tech` (captive portal).

Last, switch M-Pesa to production: in the Daraja portal set the STK callback and the C2B
validation/confirmation URLs to `https://api.mashuphost.tech/api/v1/portal/mpesa/callback` and
its matching C2B routes, and confirm `MPESA_ENVIRONMENT=live`.

---

## 6. Updating

```bash
cd /opt/mashuphost
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Rebuild `web` whenever `NEXT_PUBLIC_API_URL` changes — Next.js inlines it into the browser bundle
at build time, so changing it at runtime alone does nothing.

### Backups

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U mashupkgrid mashupkgrid_isp | gzip > ~/backup-$(date +%F).sql.gz
```

Put that in a daily cron and ship the output to Azure Blob Storage. The `postgres_data` volume
lives on the VM's OS disk — deleting the VM takes the database with it.

---

## 7. Known gaps

- **WireGuard remote access ships disabled** (`ENABLE_WIREGUARD_REMOTE_ACCESS=false`).
  [`wireguard-peer.service.ts`](../../packages/network/src/wireguard-peer.service.ts) shells out
  to `wg set`, which manages an interface in the *host* network namespace; from inside the
  bridged worker container that call cannot reach `wg0`. Enabling it needs the worker on the
  host, or a host-network sidecar with `NET_ADMIN`. Everything else runs without it.
- **`infrastructure/nginx/` and `infrastructure/pm2/` are unused** on this path — they describe
  an alternative non-Docker deployment. Caddy replaces nginx; Compose replaces PM2.
- **`infrastructure/scripts/windows-server-setup.ps1` is dead** for this deployment.
