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
  --size Standard_B2s \
  --admin-username mashupadmin \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --public-ip-address-allocation static \
  --os-disk-size-gb 64
```

**Never enable Azure Spot.** The portal's create wizard offers a "Run with Azure Spot discount"
checkbox, and the discount is real — but a Spot VM is evicted whenever Azure wants the capacity
back. For this platform that means RADIUS auth failing for live customers, M-Pesa callbacks
arriving at a dead host (Safaricom retries, then stops, leaving paid-but-unmarked invoices), and
missed hourly billing jobs. `az vm create` does not use Spot unless you pass `--priority Spot`,
so the CLI path above is safe by default.

**Size:** `Standard_B2as_v2` or `Standard_B2ms` (both 2 vCPU / 8 GB) are the comfortable
choices — the Next.js production build runs inside Docker and OOMs on 4 GB of RAM with no swap.

**On an Azure for Students subscription, use `Standard_B2s` (2 vCPU / 4 GB) plus swap instead.**
Students gives a fixed $100 credit with no payment method attached; at roughly $60/month a
B2ms burns through it in about six weeks, and when the credit runs out Azure deallocates the
VM — billing, RADIUS, and M-Pesa callbacks all stop at once. B2s is roughly half that, and with
4 GB of swap the Docker build completes (slowly — expect 20–30 min on the first run).

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # confirm swap is live BEFORE the first docker build
```

> **Before onboarding real customers, move to Pay-As-You-Go.** A student credit is fine for
> getting the platform up and testing against the M-Pesa sandbox. It is not a footing for a
> system that holds customer records and takes live payments: the credit expires, and the
> subscription carries quota caps and no SLA. Migrating later is a subscription transfer, not a
> rebuild — but do it before the first paying customer, not after.

Check remaining credit any time at
[Cost Management → Credits](https://portal.azure.com/#view/Microsoft_Azure_GTM/ModernBillingMenuBlade).

**The static IP is not optional.** A dynamic public IP changes whenever the VM is deallocated,
and every DNS record below would silently break.

### Network Security Group

UFW on the VM is not enough — the Azure NSG sits in front of it and denies by default.

```bash
# The NSG name depends on how the VM was created: `az vm create` makes "<vm>NSG", the portal
# makes "<vm>-nsg". Look it up rather than guessing.
NSG=$(az network nsg list -g $RG --query "[0].name" -o tsv)
echo "NSG: $NSG"

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
3. In Cloudflare **DNS → Records**, add all eight. `68.210.187.104` is the Azure VM's static
   public IP — re-check it with `az vm show -d -g mashuphost-rg -n mashuphost-vm --query
   publicIps -o tsv` if the VM is ever rebuilt.

   | Type | Name     | Content           | Proxy status | TTL  |
   |------|----------|-------------------|--------------|------|
   | A    | `@`      | `68.210.187.104`  | DNS only     | Auto |
   | A    | `www`    | `68.210.187.104`  | DNS only     | Auto |
   | A    | `api`    | `68.210.187.104`  | DNS only     | Auto |
   | A    | `app`    | `68.210.187.104`  | DNS only     | Auto |
   | A    | `admin`  | `68.210.187.104`  | DNS only     | Auto |
   | A    | `wifi`   | `68.210.187.104`  | DNS only     | Auto |
   | A    | `portal` | `68.210.187.104`  | DNS only     | Auto |
   | A    | `*`      | `68.210.187.104`  | DNS only     | Auto |

   **Import with the proxy checkbox UNCHECKED, then turn the orange cloud on for the six web
   hosts only.** Final state: `@ www admin app wifi portal` proxied; **`api` and `*` DNS-only.**
   `api` stays direct so Cloudflare's WAF and Bot Fight Mode can never challenge a Safaricom
   M-Pesa callback — a challenged callback means the customer paid and the invoice stays open.
   `*` has no choice: proxied wildcards are an Enterprise-plan feature.

   The proxied hosts require **SSL/TLS → Overview → Full (strict)**. On the default "Flexible",
   Cloudflare speaks HTTP to the origin, Caddy redirects to HTTPS, and the result is an infinite
   redirect loop behind a valid-looking padlock. The Caddyfile reads `CF-Connecting-IP` on those
   hosts so `request.ip` stays the real visitor rather than a Cloudflare edge node.

   Note this leaves the origin IP public via `api.mashuphost.tech`, so Cloudflare hides traffic,
   not the server. Closing that would need ports 80/443 restricted to Cloudflare ranges, which is
   impossible while `api` must accept Safaricom on the same ports.

4. Create the API token Caddy will use: **My Profile → API Tokens → Create Token → Custom**
   - Permissions: `Zone` → `DNS` → `Edit`, **and** `Zone` → `Zone` → `Read`
   - Zone Resources: Include → Specific zone → `mashuphost.tech`

   Both permissions are required — DNS:Edit alone fails at zone lookup. Copy the token now;
   Cloudflare never shows it again.

---

## 3. GitHub — push the repo

The initial commit already exists locally (512 files, no secrets — `.env`, `.env.production`,
`.whatsapp-auth/` and `packages/database/*.cjs` are all gitignored). Only the remote is missing.

`gh` is not installed on this workstation, so create the repo in the browser: github.com → **New
repository** → name `mashupkgrid-isp` → **Private** → *do not* add a README, .gitignore or
licence (the repo already has them). Then:

```bash
git remote add origin https://github.com/<you>/mashupkgrid-isp.git
git push -u origin master
```

To re-verify before pushing:

```bash
git ls-files | grep -E '(^|/)\.env$|\.env\.production$|whatsapp-auth|database/[^/]*\.cjs' \
  && echo "STOP: secret file tracked" || echo "clean"
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

SSH in as `mashupadmin`, then:

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
