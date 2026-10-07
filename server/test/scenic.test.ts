import { describe, expect, it } from 'vitest';
import { buildValhallaRequest, findScenicRoutes, rankRoutes, RoutingError } from '../src/scenic.ts';
import { straightPath, trip, twistyPath } from './fixtures.ts';

describe('scenic routing', () => {
  it('asks Valhalla to avoid highways and tolls', () => {
    const req = buildValhallaRequest({ start: { lat: 1, lng: 2 }, end: { lat: 3, lng: 4 }, adventure: 1 });
    expect(req.costing_options.auto.use_highways).toBe(0);
    expect(req.costing_options.auto.use_tolls).toBe(0);
    expect(req.locations[0]).toEqual({ lat: 1, lon: 2 });
    expect(req.alternates).toBeGreaterThan(0);
  });

  it('ranks twisty back roads above a straight highway even if slower', () => {
    const routes = rankRoutes({
      trip: trip(straightPath, { highway: true, time: 400 }),
      alternates: [{ trip: trip(twistyPath, { time: 900 }) }],
    });
    expect(routes[0].id).toBe('r1');
    expect(routes[0].highwayShare).toBe(0);
    expect(routes[1].highwayShare).toBe(1);
    expect(routes[0].scenicScore).toBeGreaterThan(routes[1].scenicScore);
  });

  it('maps manoeuvres to steps on the path', () => {
    const [route] = rankRoutes({ trip: trip(twistyPath) });
    expect(route.path).toHaveLength(twistyPath.length);
    expect(route.steps[1]).toMatchObject({ instruction: 'Turn left onto B23.', streetNames: ['B23'], pathIndex: 20 });
    expect(route.steps[1].location.lat).toBeCloseTo(twistyPath[20].lat, 5);
  });

  it('surfaces "no route" errors from Valhalla', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: 'No path could be found for input' }), { status: 400 })) as typeof fetch;
    const err = await findScenicRoutes({ start: { lat: 0, lng: 0 }, end: { lat: 1, lng: 1 } }, 'http://v', fakeFetch).catch((e) => e);
    expect(err).toBeInstanceOf(RoutingError);
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/No path/);
  });
});
