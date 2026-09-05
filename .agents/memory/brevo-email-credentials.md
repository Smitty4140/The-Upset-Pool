---
name: Brevo email credentials
description: Durable credential boundary for transactional email delivery.
---

Use protected Replit secrets for the Brevo REST API key and verified sender address. Do not depend on the managed Brevo connector for transactional delivery.

**Why:** The managed Brevo connector repeatedly forwarded an invalid credential even after reconnection. Direct REST authentication with protected secrets is reliable while still keeping credentials out of code and chat.

**How to apply:** Send transactional requests to Brevo's REST API using environment-provided credentials. Request replacements only through the secure secrets flow and never print or expose their values.

Brevo account IP security can reject an otherwise valid key with an “unrecognised IP address” 401. Treat that separately from “Key not found”: the former requires authorizing the app’s outbound IP or adjusting Brevo’s IP-security policy.