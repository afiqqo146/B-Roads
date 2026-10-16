# Car Sales HQ

An office of AI agents for a car salesperson: **7 teams, 25 agents and one shared brain**. You give one command, typed or spoken. The Front Desk splits it across the teams, they work in parallel, and anything that goes to a customer or involves money waits for your OK.

It runs in [Claude Code](https://claude.com/claude-code). No servers, no code, just Markdown files.

## The office

| Team | What it does | Agents |
|---|---|---|
| **Front Desk** | Takes your command, routes it, gives you one answer | daily-briefer, board-keeper |
| **Leads Team** | Every enquiry becomes a scored customer card and a drafted reply | lead-catcher, lead-qualifier, follow-up-writer, cold-lead-reviver |
| **Showroom** | Stock matching, market prices, trade-in ranges, model questions | stock-matcher, price-checker, trade-in-estimator, model-expert |
| **Deal Desk** | Payment scenarios, quotes, paperwork, promos | payment-calculator, quote-builder, paperwork-checker, incentive-tracker |
| **Creative Studio** | Listings, social posts, video scripts, testimonials | listing-writer, social-writer, video-scripter, story-maker |
| **Customer Care** | Handover, reviews, referrals, service reminders | delivery-planner, review-requester, reminder-scout, referral-tracker |
| **Coach's Corner** | Your numbers, role-play practice, call reviews | numbers-tracker, objection-coach, call-reviewer |

## The 5 steps, and where each one lives

1. **One agent, one job.** Each agent is a short brief in `.claude/agents/` that says who it is, its one job and its hard limits.
2. **Only the tools it needs.** Each brief's `tools:` line. Writers can only edit files. Only price-checker, trade-in-estimator and model-expert can search the web. Only the two number-crunchers can run Python, and only for arithmetic. **No agent can send, post or pay.**
3. **The shared brain.** The `brain/` folder: who you are, the task board, one card per customer, your stock, promos, sales log and outbox. Every agent reads and writes it, so nobody starts from zero.
4. **Leads and sub-agents.** The Front Desk (`CLAUDE.md`) leads every team. The playbooks in `.claude/skills/` say which agents run side by side and how their work comes together.
5. **Human in the loop.** Everything for a customer or the public lands in `brain/outbox/` as a DRAFT. `/approve` takes you through them one at a time. Prices, discounts, trade-in figures and rates are always your call.

## Playbooks (your one-line commands)

| Command | What happens |
|---|---|
| `/morning` | Today's brief, plus check-ins drafted for quiet leads and reminders that are due |
| `/new-lead` + paste the enquiry | Customer card, then hot/warm/cold score, top 3 stock matches and a drafted reply |
| `/list-car` + the car | Price check, listing, a post per platform and a walkaround video script |
| `/deal` + customer | 3 payment scenarios, matching promos, paperwork checklist and a draft quote |
| `/delivered` + customer | Sale logged, handover checklist, review and referral ask, future reminders |
| `/weekly-review` | Scorecard against your target, stuck deals and one objection to practise |
| `/approve` | Go through the outbox: approve, edit or reject |

You don't have to use the commands. Talking normally works too ("Siti just messaged about a 7-seater under 150k, here's her message…").

## Setup (about 10 minutes)

1. Copy this `car-sales-hq` folder somewhere of its own. A **private** GitHub repo is best. Your customer data is never committed either way, because `brain/` is in `.gitignore`.
2. Open Claude Code in that folder (`cd car-sales-hq && claude`), or start a session on it from the Claude app.
3. Say **"set me up"**. The Front Desk copies `brain.example/` to `brain/` and asks you the questions in `me.md`: where you sell, your currency, finance rates, targets, and how you write to customers.
4. Add your current stock to `brain/stock.md`. You can paste a list and ask the Front Desk to put it in the table.
5. Try `/new-lead` with a real enquiry.

**Voice commands:** use the microphone in the Claude app, or your phone's dictation, and speak the command.

**Connecting tools (optional, later):** Claude Code can connect to Gmail, Google Calendar, Google Drive and other services over MCP. Only the Front Desk should use send-capable tools, and `CLAUDE.md` only lets it send drafts you approved in the conversation. Add read-only tools such as your calendar first.

## Ground rules

- Agents never invent customers, prices, specs or stock. If it isn't in `brain/`, they say what's missing.
- No ID numbers, bank details or document copies in `brain/`, only "received" or "missing".
- `do not contact` on a customer card is respected by every agent.
- No pressure tactics. The objection-coach won't teach anything that hides the true cost from a customer.
