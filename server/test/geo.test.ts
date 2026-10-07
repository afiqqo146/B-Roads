import { describe, expect, it } from 'vitest';
import { decodePolyline, distanceM, encodePolyline, twistiness } from '../src/geo.ts';

describe('geo', () => {
  it('measures distance', () => {
    // KL Tower -> Petronas Towers is roughly 1.3 km
    const d = distanceM({ lat: 3.1528, lng: 101.7038 }, { lat: 3.1579, lng: 101.7116 });
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1100);
  });

  it('round-trips polyline6', () => {
    const pts = [
      { lat: 3.139003, lng: 101.686855 },
      { lat: 3.140001, lng: 101.690002 },
      { lat: -33.8688, lng: 151.2093 },
    ];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
  });

  it('scores a zig-zag as twistier than a straight line', () => {
    const straight = Array.from({ length: 50 }, (_, i) => ({ lat: 3 + i * 0.001, lng: 101 }));
    const zigzag = Array.from({ length: 50 }, (_, i) => ({ lat: 3 + i * 0.001, lng: 101 + (i % 2) * 0.0007 }));
    expect(twistiness(straight)).toBeLessThan(1);
    expect(twistiness(zigzag)).toBeGreaterThan(200);
  });
});
