---
name: delivered
description: Customer Care playbook for a sale or handover. Logs the sale, plans the handover, schedules the review and referral ask, and sets future reminders. Use when the user says a customer bought, signed or is collecting a car.
---

1. Update the customer card: status Bought, car, delivery date, next service date if known. Add a line to `brain/sales-log.md` (date, customer, car, gross, commission if the user gives them). Remove the car from `brain/stock.md`.
2. Run **at the same time**:
   - **delivery-planner**: handover checklist and confirmation message.
   - **review-requester**: draft the review and referral ask, dated 3-7 days after delivery.
   - **referral-tracker**: only if the customer came from a referral.
3. Ask the user whether the customer is happy to appear in a testimonial; if yes, set `consent: yes` on the card and run **story-maker**.
