---
name: deal
description: Deal Desk playbook. Builds payment scenarios, a draft quote, the paperwork checklist and applicable promos for a customer who is ready to buy. Use when the user says a customer wants numbers, a quote or to go ahead.
---

You need from the user (ask only for what's missing): customer, car, agreed price, deposit, trade-in value they've agreed, finance rate and term.

1. Run **at the same time**:
   - **payment-calculator**: 3 monthly payment scenarios.
   - **incentive-tracker**: which promos apply.
   - **paperwork-checker**: documents needed and missing.
2. Then **quote-builder**: draft the quote with the figures the user gave and the scenario they prefer.
3. **board-keeper**: move the customer to "Waiting on me".

Every figure here is the user's decision. Show the scenarios and promos, and do not suggest discounts unless asked.
