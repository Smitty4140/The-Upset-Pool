---
name: Autoscale scheduler reliability
description: Reliability constraint for time-critical background jobs on the published web app.
---

Do not rely on an in-process cron timer for time-critical production work while the web deployment uses autoscale.

**Why:** An odds pull was logged as scheduled shortly before its target time, but the autoscale instance stopped and no execution log appeared. The database remained unchanged.

**How to apply:** Use a durable scheduled trigger for exact-time jobs, while keeping the operation idempotent and exposing a safe manual retry. Startup catch-up is useful recovery but not a timing guarantee.