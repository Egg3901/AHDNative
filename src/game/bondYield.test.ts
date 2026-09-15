import { describe, expect, it } from 'vitest';
import {
  annualCouponPerUnit,
  bondTurnsRemaining,
  bondYieldToMaturityPercent,
  ownershipShare,
  priceVsParLabel,
} from './bondYield';

describe('bondYield display math (source-grounded, no history)', () => {
  it('par bond yields its coupon rate', () => {
    // Engine golden: coupon 5%, price 1.0, 48 turns (1yr) => ~5%.
    expect(bondYieldToMaturityPercent(5, 1.0, 48)).toBeCloseTo(5.0, 6);
  });

  it('matches the genuine fixture issue: 3.75% at par with 10 turns left', () => {
    expect(bondYieldToMaturityPercent(3.75, 1, 10)).toBeCloseTo(3.75, 6);
  });

  it('ranks premium below par and discount above par', () => {
    const par = bondYieldToMaturityPercent(5, 1.0, 48);
    expect(bondYieldToMaturityPercent(5, 1.1, 48)).toBeLessThan(par);
    expect(bondYieldToMaturityPercent(5, 0.9, 48)).toBeGreaterThan(par);
  });

  it('returns 0 when there is no time or price left (matured/empty)', () => {
    expect(bondYieldToMaturityPercent(5, 1.0, 0)).toBe(0);
    expect(bondYieldToMaturityPercent(5, 0, 48)).toBe(0);
  });

  it('clamps turns remaining at zero past maturity', () => {
    expect(bondTurnsRemaining(108, 98)).toBe(10);
    expect(bondTurnsRemaining(108, 108)).toBe(0);
    expect(bondTurnsRemaining(108, 120)).toBe(0);
  });

  it('derives the annual coupon per unit from face and coupon', () => {
    expect(annualCouponPerUnit(1000, 3.75)).toBeCloseTo(37.5, 6);
  });

  it('labels price against par without inventing bands', () => {
    expect(priceVsParLabel(1, false)).toBe('At par');
    expect(priceVsParLabel(1.02, false)).toBe('Above par');
    expect(priceVsParLabel(0.9, false)).toBe('Below par');
    expect(priceVsParLabel(0.1, true)).toBe('Recovery price');
  });

  it('splits outstanding units between the player and the public float', () => {
    expect(ownershipShare(1, 19)).toEqual({ total: 20, playerPct: 5 });
    expect(ownershipShare(0, 0)).toEqual({ total: 0, playerPct: 0 });
  });
});
