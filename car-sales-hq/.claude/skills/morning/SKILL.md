---
name: morning
description: Front Desk morning run. Builds today's brief, finds quiet leads and due reminders, and lists drafts waiting for approval. Use when the user says good morning, asks what's on today, or types /morning.
---

Run these three agents **at the same time** (one message, three agent calls):

1. **daily-briefer**: today's brief from `brain/`.
2. **cold-lead-reviver**: drafts check-ins for leads quiet 14+ days.
3. **reminder-scout**: drafts service, renewal and anniversary messages due in the next 14 days.

Then have **board-keeper** add a card under "Waiting on me" for each new draft.

Reply with the brief, then one line: "N drafts in the outbox. Say /approve to go through them."
