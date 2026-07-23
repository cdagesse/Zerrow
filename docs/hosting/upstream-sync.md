---
title: "Syncing with Upstream"
description: "Pull updates and security fixes from the upstream inbox-zero project into this fork"
---

Zerrow is a fork of [elie222/inbox-zero](https://github.com/elie222/inbox-zero). Upstream regularly ships bug and security fixes that this fork does not receive automatically — sync periodically (monthly, or when a security fix lands upstream).

## One-time setup

```bash
git remote add upstream https://github.com/elie222/inbox-zero.git
```

## Syncing

```bash
git fetch upstream
git checkout -b sync-upstream main
git merge upstream/main
```

Resolve conflicts, which will concentrate in the files this fork customizes:

- `apps/web/components/Logo.tsx` — keep the Zerrow logo
- `apps/web/styles/globals.css` — keep the navy/orange theme tokens
- `apps/web/components/SideNav.tsx` — keep the inbox-first mail navigation
- `apps/web/env.ts` — keep `NEXT_PUBLIC_BRAND_NAME` defaulting to "Zerrow"
- `apps/web/app/(app)/[emailAccountId]/mail/` and `apps/web/components/email-list/` — keep the mail client customizations (viewport pinning, sent-view message selection, folder settings)
- `apps/web/next.config.ts` — keep `/` redirects pointing to `/mail`

Then verify before merging to `main`:

```bash
pnpm install
pnpm check
pnpm --filter inbox-zero-ai test -- --run
pnpm --filter inbox-zero-ai exec next build
```

Open a PR from `sync-upstream` to `main` so the Vercel deployment only picks it up after review.
