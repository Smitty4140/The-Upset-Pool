#!/bin/bash
set -e

npm install --no-audit --no-fund

# drizzle-kit push opens terminal-only prompts for existing multi-column
# constraints and can exit successfully without applying changes in headless
# post-merge runs. Keep the release-critical league schema sync explicit.
NODE_ENV=development npx tsx scripts/sync-development-league-schema.ts
