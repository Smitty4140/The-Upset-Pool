---
name: Brevo email credentials
description: Durable credential boundary for transactional email delivery.
---

Use the Replit-managed Brevo connector for authenticated API requests rather than a direct Brevo API-key environment variable. Keep the verified sender address as ordinary environment configuration.

**Why:** The managed connection keeps the provider credential out of application code and centralizes credential repair, while Brevo still requires the application to name a verified sender for each transactional message.

**How to apply:** Route Brevo account checks and transactional sends through the connector. If Brevo reports a missing or revoked key, repair the existing Replit connection without asking for or exposing the key in chat.