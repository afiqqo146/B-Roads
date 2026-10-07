# B-Roads

**Waze for car clubs, minus the motorways.** B-Roads plans routes along back roads (B-roads) instead of highways, runs live group drives that time everyone from A to B, and lets Premium drivers post pit-stop photos straight to Instagram or Facebook.

| | Feature | Where |
|---|---|---|
| 1 | **B-road routing**: pick a start and destination; B-Roads avoids motorways, trunk roads and tolls, then ranks the alternatives by how twisty they are | `server/src/scenic.ts`, `app/src/app/index.tsx` |
| 2 | **Group drives**: the host creates a drive and shares a 6-character code. Everyone sees each other live on the map, the clock starts when the host starts the drive, and each driver's time stops when they arrive. A results board appears once everyone is in | `server/src/drives.ts`, `app/src/app/drive/[code].tsx` |
| 3 | **Pit stop photos (Premium)**: snap a photo, stamp it with your location and drive stats, and share it to an Instagram Story, Instagram post or Facebook in one tap | `app/src/app/pitstop.tsx`, `app/src/lib/pitstop.ts` |

## Layout

```
app/      Expo (React Native) app for iOS and Android, using Expo Router
server/   Node + Express + Socket.IO API for routing, place search and live group drives
shared/   TypeScript types shared by both (the app imports them as types only)
```

## Running it locally

**Server**

```bash
cd server
npm install
npm run dev          # http://localhost:4000
npm test             # unit and socket integration tests
```

Environment variables (optional):

| Var | Default | |
|---|---|---|
| `PORT` | `4000` | |
| `VALHALLA_URL` | `https://valhalla1.openstreetmap.de` | Valhalla routing engine |
| `PHOTON_URL` | `https://photon.komoot.io` | Place search (OpenStreetMap) |

**App**

```bash
cd app
npm install
cp .env.example .env.local   # set EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.1.10:4000
npx expo run:ios             # or: npx expo run:android
```

The app uses native modules that Expo Go doesn't include (`react-native-share`, `react-native-purchases`), so run it as a **development build** (`npx expo run:*` locally, or `npx eas-cli build --profile development`).

## How the B-road routing works

1. The server asks [Valhalla](https://valhalla.github.io/valhalla/) for a car route with `use_highways` near 0, `use_tolls: 0` and `use_distance: 0`. That makes motorways and trunk roads a last resort and stops it optimising for the shortest path. It also asks for up to 3 alternates.
2. Each candidate is scored from 0 to 100 (`scenicScore`). The score blends:
   - **twistiness**: degrees of heading change per km, measured from the route geometry. A motorway scores about 10°/km and a good mountain road scores over 100°/km.
   - **big-road share**: the fraction of the distance flagged as highway or toll.
3. The app shows every candidate, labels the best one **MOST FUN**, and lets the driver pick.

The **Relaxed / Balanced / Wild** setting changes how hard highways are penalised, how much twistiness counts toward the score, and whether unpaved roads are allowed (Wild only).

> The public Valhalla and Photon servers are community-run and rate-limited, so they're fine for development only. Before launch, self-host them (both have Docker images) or switch to a commercial provider such as Stadia Maps, which hosts Valhalla.

## Group drives

- Live state goes over Socket.IO (`shared/types.ts` defines the event contract). Every phone streams its GPS position, and the server broadcasts the drive to everyone in it.
- **Arrival** happens when a driver gets within 150 m of the destination (`ARRIVAL_RADIUS_M`). The server timestamps it, so phone clocks don't matter.
- **Finish** happens when every driver has arrived. The host can also *End for all*, and anyone not there yet is marked DNF. If a driver leaves mid-drive, the group no longer waits for them.
- If a phone reconnects (tunnel, dead zone), it rejoins with the same member ID and keeps its place.
- **Drive solo** works the same way as a one-person group drive, so solo runs are timed too.
- Drives live in memory and are cleared 24 h after their last activity. For production, swap `DriveStore` for Redis or Postgres and run more than one instance behind the Socket.IO Redis adapter.

## Premium: pit stop photos

- The photo is stamped with the place name (reverse-geocoded on the phone), the drive name, time on the road and distance to go. The stamped image is what gets shared.
- **Instagram Story** uses Meta's official Stories sharing intent and needs a Meta App ID (`EXPO_PUBLIC_META_APP_ID`). **Instagram post** and **Facebook** open the app's composer with the photo attached.
- Instagram and Facebook don't let other apps pre-fill captions, so B-Roads copies a caption (📍 place, drive name, hashtags) to the clipboard for the driver to paste.
- **Billing** goes through [RevenueCat](https://www.revenuecat.com/), which wraps App Store and Google Play subscriptions. Set up an entitlement called `premium`, attach your products to the current offering, and set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Without keys, the paywall shows a **dev unlock** switch for testing.

## Keys you'll need before shipping

| Key | Used for |
|---|---|
| `GOOGLE_MAPS_ANDROID_API_KEY` | Map tiles on Android (iOS uses Apple Maps) |
| `EXPO_PUBLIC_META_APP_ID` | Instagram/Facebook Stories sharing |
| `EXPO_PUBLIC_REVENUECAT_*_KEY` | Premium subscription |
| `EXPO_PUBLIC_API_URL` | Your deployed B-Roads server |

## Not built yet

- **Background location**: tracking currently runs while the app is open (the screen is kept awake during a drive). To keep timing drivers while they use other apps, add `expo-task-manager` with background location permission.
- **Spoken turn-by-turn directions**: the drive screen shows the next manoeuvre and an off-route warning, but there's no voice guidance or automatic rerouting yet.
- **Accounts**: drivers are identified by name per drive, and there's no login or persistent club or history yet.
