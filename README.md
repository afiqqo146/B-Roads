# B-Roads

**Waze for car clubs, minus the motorways.** B-Roads plans routes along back roads (B-roads) instead of highways, runs live group drives that time everyone from A to B, and lets drivers post pit-stop photos straight to Instagram or Facebook. **Premium** is for club organisers: events with sign-ups, convoy tools, a route library and club drive history.

| | Feature | Where |
|---|---|---|
| 1 | **B-road routing**: pick a start and destination; B-Roads avoids motorways, trunk roads and tolls, then ranks the alternatives by how twisty they are | `server/src/scenic.ts`, `app/src/app/index.tsx` |
| 2 | **Group drives**: the host creates a drive and shares a 6-character code. Everyone sees each other live on the map, the clock starts when the host starts the drive, and each driver's time stops when they arrive. When everyone is in, the drive summary shows the group's time and each driver's own time. Drivers aren't ranked, so it doesn't turn into a race on public roads | `server/src/drives.ts`, `app/src/app/drive/[code].tsx` |
| 3 | **Pit stop photos**: snap a photo, stamp it with your location and drive stats, and share it to an Instagram Story, Instagram post or Facebook in one tap | `app/src/app/pitstop.tsx`, `app/src/lib/pitstop.ts` |
| 4 | **Clubs (Premium)**: club events with sign-ups; convoy tools (lead car, back-marker, regroup points, falling-behind alerts); a shared route library; club drive history | `server/src/clubs.ts`, `app/src/app/club/` |

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
| `DATA_DIR` | `data` | Where clubs are saved (`clubs.json`) |
| `REVENUECAT_SECRET_KEY` | unset | When set, creating a club requires an active `premium` entitlement. Unset allows everyone (development) |

**App**

```bash
cd app
npm install
cp .env.example .env.local   # set EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.1.10:4000
npx expo run:ios             # or: npx expo run:android
```

### Quick live test with Expo Go

Everything except direct Instagram/Facebook posting and real payments works in [Expo Go](https://expo.dev/go), so you don't need a build to test routing and group drives:

```bash
cd app
echo "EXPO_PUBLIC_API_URL=https://your-server-url" > .env.local
npx expo start --tunnel      # everyone scans the QR code with Expo Go
```

For a real drive on mobile data, the server needs a public URL: deploy `server/` (e.g. Render, Railway, Fly.io) or expose your laptop with `cloudflared tunnel --url http://localhost:4000`. In Expo Go:

- the paywall shows a **dev unlock** switch instead of real purchases
- pit stop photos open the system share sheet (Instagram and Facebook are listed there) instead of jumping straight into Instagram Stories

### Development build

For one-tap Instagram/Facebook sharing and real payments, run a **development build** (`npx expo run:ios` locally, or `npx eas-cli build --profile development`). These features use native modules (`react-native-share`, `react-native-purchases`) that Expo Go doesn't include.

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
- **Finish** happens when every driver has arrived. The host can also *End for all*, and anyone not there yet is shown as "Didn't finish". Results are listed by name with no ranking or medals, because B-Roads is for driving together, not racing on public roads. If a driver leaves mid-drive, the group no longer waits for them.
- If a phone reconnects (tunnel, dead zone), it rejoins with the same member ID and keeps its place.
- **Drive solo** works the same way as a one-person group drive, so solo runs are timed too.
- Drives live in memory and are cleared 24 h after their last activity. For production, swap `DriveStore` for Redis or Postgres and run more than one instance behind the Socket.IO Redis adapter.

## Premium: club organiser tools

Joining a club, and every club feature a member uses, is free. Premium is what an organiser pays for to **create and run a club**.

- **Club events and sign-ups**: organisers post a drive with a date, meeting point and a route from the library. Members reply *Going*, *Maybe* or *Can't*. On the day, an organiser taps **Start drive** and members get a **Join the live drive** button on the event.
- **Convoy tools** (on club drives): the host taps a driver to make them **lead car** or **back-marker**, and long-presses the map to drop **regroup points**. Everyone sees how many cars have reached each point. Each car's progress along the route is measured. When a car falls more than 2 km (`CONVOY_GAP_M`) behind the lead car, or behind the front car if there's no lead, everyone sees an alert, and the host, lead and back-marker phones vibrate.
- **Route library**: organisers save a planned route to the club with notes. Any member can open it and drive it.
- **Club drive history**: finished club drives are saved with the route, distance, group time and who took part.
- Roles: the club **owner** (the person who created it) can make members **organisers**. Organisers manage events and routes and start club drives.
- There are no accounts. Joining a club gives the phone a secret token, which it sends with every request (`x-club-token`). Clubs are saved to `DATA_DIR/clubs.json`. For production, move them to a database.
- **Billing** goes through [RevenueCat](https://www.revenuecat.com/), which wraps App Store and Google Play subscriptions. Set up an entitlement called `premium`, attach your products to the current offering, and set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` in the app and `REVENUECAT_SECRET_KEY` on the server. Without keys, the paywall shows a **dev unlock** switch for testing. Premium is checked when a club is created. Pausing a club when the owner's subscription lapses isn't built yet.

## Pit stop photos

- The photo is stamped with the place name (reverse-geocoded on the phone), the drive name, time on the road and distance to go. The stamped image is what gets shared.
- **Instagram Story** uses Meta's official Stories sharing intent and needs a Meta App ID (`EXPO_PUBLIC_META_APP_ID`). **Instagram post** and **Facebook** open the app's composer with the photo attached.
- Instagram and Facebook don't let other apps pre-fill captions, so B-Roads copies a caption (📍 place, drive name, hashtags) to the clipboard for the driver to paste.

## Keys you'll need before shipping

| Key | Used for |
|---|---|
| `GOOGLE_MAPS_ANDROID_API_KEY` | Map tiles on Android (iOS uses Apple Maps) |
| `EXPO_PUBLIC_META_APP_ID` | Instagram/Facebook Stories sharing |
| `EXPO_PUBLIC_REVENUECAT_*_KEY` | Premium subscription (app) |
| `REVENUECAT_SECRET_KEY` | Checking Premium before a club is created (server) |
| `EXPO_PUBLIC_API_URL` | Your deployed B-Roads server |

## Not built yet

- **Background location**: tracking currently runs while the app is open (the screen is kept awake during a drive). To keep timing drivers while they use other apps, add `expo-task-manager` with background location permission.
- **Spoken turn-by-turn directions**: the drive screen shows the next manoeuvre and an off-route warning, but there's no voice guidance or automatic rerouting yet.
- **Accounts**: there's no login. A club membership lives on the phone (its token), so a member who switches phones rejoins with the invite code.
