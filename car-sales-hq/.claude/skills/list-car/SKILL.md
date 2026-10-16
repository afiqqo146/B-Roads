---
name: list-car
description: Creative Studio playbook. Takes a car (from stock or dictated details) and produces the listing, social posts, a video script and a market price check. Use when the user wants to advertise or post about a car.
---

1. If the car isn't in `brain/stock.md` yet, add it from what the user gave you (ask only for what's missing: make, model, year, mileage, price, key features).
2. Run **at the same time**:
   - **price-checker**: is the asking price in line with the market?
   - **listing-writer**: marketplace/website listing.
   - **social-writer**: one post per platform in `brain/me.md`.
   - **video-scripter**: 30-60 second walkaround script and shot list.
3. If price-checker says the price is well outside the market range, tell the user before anything else. Don't change the price yourself.

Reply: price check in one line, then the list of drafts in the outbox.
