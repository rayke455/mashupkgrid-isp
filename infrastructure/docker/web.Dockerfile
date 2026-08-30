FROM node:22-alpine AS base
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
# Next.js inlines NEXT_PUBLIC_* at build time, so the production API origin has to be passed
# as a build arg -- setting it only at runtime leaves the browser bundle pointing at localhost.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @mashupkgrid/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
