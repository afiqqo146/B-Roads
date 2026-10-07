import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 4000);
const { httpServer } = createApp({
  // The public FOSSGIS instances are fine for development; self-host or use a
  // paid provider before launch (see README).
  valhallaUrl: process.env.VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de',
  photonUrl: process.env.PHOTON_URL ?? 'https://photon.komoot.io',
});

httpServer.listen(port, () => {
  console.log(`B-Roads server listening on http://localhost:${port}`);
});
