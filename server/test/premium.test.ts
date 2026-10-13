import { describe, expect, it } from 'vitest';
import { revenueCatCheck } from '../src/premium.ts';

const subscriber = (expires: string | null) =>
  (async () => Response.json({ subscriber: { entitlements: { premium: { expires_date: expires } } } })) as unknown as typeof fetch;

describe('revenueCatCheck', () => {
  it('allows everyone when no secret key is configured', async () => {
    expect(await revenueCatCheck(undefined)(undefined)).toBe(true);
  });

  it('checks the premium entitlement is active', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(await revenueCatCheck('sk', subscriber(future))('user')).toBe(true);
    expect(await revenueCatCheck('sk', subscriber(null))('user')).toBe(true); // lifetime
    expect(await revenueCatCheck('sk', subscriber(past))('user')).toBe(false);
    expect(await revenueCatCheck('sk', subscriber(future))(undefined)).toBe(false);
  });
});
