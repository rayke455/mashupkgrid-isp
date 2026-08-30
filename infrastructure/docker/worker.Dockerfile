FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

# Every workspace manifest must be present before `pnpm install --frozen-lockfile`, or pnpm
# refuses the lockfile (it has an importer for each of these projects).
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/billing/package.json packages/billing/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/network/package.json packages/network/package.json
COPY packages/payments/package.json packages/payments/package.json
COPY packages/radius/package.json packages/radius/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sms/package.json packages/sms/package.json
COPY packages/support/package.json packages/support/package.json
COPY packages/whatsapp/package.json packages/whatsapp/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @mashupkgrid/database generate
RUN pnpm --filter @mashupkgrid/worker build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/worker
CMD ["node", "dist/index.js"]
