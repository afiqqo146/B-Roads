import { join } from 'node:path';
import { createApp } from './app.ts';
import { ClubStore } from './clubs.ts';
import { revenueCatCheck } from './premium.ts';

const port = Number(process.env.PORT ?? 4000);
const { httpServer } = createApp({
  // The public FOSSGIS instances are fine for development; self-host or use a
  // paid provider before launch (see README).
  valhallaUrl: process.env.VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de',
  photonUrl: process.env.PHOTON_URL ?? 'https://photon.komoot.io',
  // Clubs are saved to disk so they survive restarts.
  clubs: new ClubStore({ file: join(process.env.DATA_DIR ?? 'data', 'clubs.json') }),
  premiumCheck: revenueCatCheck(process.env.REVENUECAT_SECRET_KEY),
});

httpServer.listen(port, () => {
  console.log(`B-Roads server listening on http://localhost:${port}`);
});
