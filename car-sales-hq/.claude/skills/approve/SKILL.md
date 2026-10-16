---
name: approve
description: Go through drafts in brain/outbox/ one at a time so the user can approve, edit or reject them. Use when the user types /approve or asks what's waiting for them.
---

List every file in `brain/outbox/` with `status: DRAFT`, oldest first. For each, show who it's for, the type and the text, then ask: **approve, edit or reject?**

- approve: set `status: APPROVED`. If the user has a connected tool for that channel and says "send it", send it and set `status: SENT`. Otherwise tell them it's ready to copy and paste.
- edit: apply their changes, show it again.
- reject: set `status: REJECTED` with their reason, so the writers learn from it.

Never approve on the user's behalf, never batch-approve unless they explicitly say "approve all".
