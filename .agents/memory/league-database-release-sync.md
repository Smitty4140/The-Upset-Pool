---
name: League database release sync
description: Why league schema and backfill setup must cover two development database targets before publishing.
---

League schema and data backfills must run against both the application development database and Replit's managed development database.

**Why:** The development server can use a custom development connection, but Replit Publish computes production schema changes from the managed development database. Updating only the app's development database can make local tests pass while production remains structurally outdated.

**How to apply:** For league-related schema releases, verify the application development database for runtime tests and the managed development database for the pending Publish diff. Keep production schema mutation in the supported Publish flow.