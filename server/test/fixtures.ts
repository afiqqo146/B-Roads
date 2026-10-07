import type { LatLng } from '../../shared/types.ts';
import { encodePolyline } from '../src/geo.ts';
import type { ValhallaTrip } from '../src/scenic.ts';

export const straightPath: LatLng[] = Array.from({ length: 40 }, (_, i) => ({ lat: 3 + i * 0.002, lng: 101 }));
export const twistyPath: LatLng[] = Array.from({ length: 40 }, (_, i) => ({
  lat: 3 + i * 0.002,
  lng: 101 + Math.sin(i) * 0.002,
}));

export function trip(path: LatLng[], opts: { highway?: boolean; time?: number } = {}): ValhallaTrip {
  const km = 8.7;
  return {
    summary: { length: km, time: opts.time ?? 600 },
    legs: [
      {
        shape: encodePolyline(path),
        maneuvers: [
          { instruction: 'Drive north.', length: km / 2, time: 300, begin_shape_index: 0, end_shape_index: 20, highway: opts.highway },
          { instruction: 'Turn left onto B23.', street_names: ['B23'], length: km / 2, time: 300, begin_shape_index: 20, end_shape_index: path.length - 1, highway: opts.highway },
          { instruction: 'You have arrived.', length: 0, time: 0, begin_shape_index: path.length - 1, end_shape_index: path.length - 1 },
        ],
      },
    ],
  };
}
