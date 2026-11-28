import { describe, expect, it } from 'vitest';
import { balanceOf, equalSplit, formatAmount, isZeroDecimal, parseAmountToMinor, percentSplit, simplify } from './logic';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('equalSplit', () => {
  it('splits evenly when it divides', () => {
    expect(equalSplit(900, 3, 0)).toEqual([300, 300, 300]);
  });
  it('gives the whole remainder to the payer', () => {
    // Bagel brunch: S$60.43 between 6, payer is the 3rd participant.
    expect(equalSplit(6043, 6, 2)).toEqual([1007, 1007, 1008, 1007, 1007, 1007]);
    expect(equalSplit(1000, 3, 1)).toEqual([333, 334, 333]);
  });
  it('falls back to the first participant when the payer is not in the split', () => {
    expect(equalSplit(1000, 3, -1)).toEqual([334, 333, 333]);
    expect(equalSplit(1000, 3, 7)).toEqual([334, 333, 333]);
  });
  it('always sums to the total', () => {
    for (const [t, n, p] of [[1, 3, 0], [9999, 7, 4], [100003, 11, 10]]) {
      expect(sum(equalSplit(t, n, p))).toBe(t);
    }
  });
  it('returns nothing for no participants', () => {
    expect(equalSplit(1000, 0)).toEqual([]);
  });
});

describe('percentSplit', () => {
  it('splits by percentage', () => {
    expect(percentSplit(10000, [50, 30, 20])).toEqual([5000, 3000, 2000]);
  });
  it('hands leftover cents to the largest fractional parts', () => {
    const out = percentSplit(1000, [33.33, 33.33, 33.34]);
    expect(sum(out)).toBe(1000);
    expect(out).toEqual([333, 333, 334]);
  });
  it('always sums to the total', () => {
    expect(sum(percentSplit(101, [33.3, 33.3, 33.4]))).toBe(101);
  });
});

describe('balanceOf', () => {
  it('is paid - share + sent - received', () => {
    expect(balanceOf({ memberId: 'a', paid: 3000, share: 1000, sent: 0, received: 0 })).toBe(2000);
    expect(balanceOf({ memberId: 'b', paid: 0, share: 1000, sent: 1000, received: 0 })).toBe(0);
    expect(balanceOf({ memberId: 'c', paid: 3000, share: 1000, sent: 0, received: 2000 })).toBe(0);
  });
});

describe('simplify', () => {
  it('matches debtors to creditors, largest first', () => {
    const out = simplify([
      { memberId: 'a', balance: 2000 },
      { memberId: 'b', balance: -1500 },
      { memberId: 'c', balance: -500 },
    ], 'SGD');
    expect(out).toEqual([
      { fromMemberId: 'b', toMemberId: 'a', amountMinor: 1500, currency: 'SGD' },
      { fromMemberId: 'c', toMemberId: 'a', amountMinor: 500, currency: 'SGD' },
    ]);
  });
  it('settles everything and never invents money', () => {
    const balances = [
      { memberId: 'a', balance: 700 }, { memberId: 'b', balance: 300 },
      { memberId: 'c', balance: -400 }, { memberId: 'd', balance: -600 },
    ];
    const out = simplify(balances, 'MYR');
    const net = new Map(balances.map(b => [b.memberId, b.balance]));
    for (const s of out) {
      net.set(s.fromMemberId, net.get(s.fromMemberId)! + s.amountMinor);
      net.set(s.toMemberId, net.get(s.toMemberId)! - s.amountMinor);
    }
    expect([...net.values()].every(v => v === 0)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(balances.length - 1);
  });
  it('returns nothing when everyone is settled', () => {
    expect(simplify([{ memberId: 'a', balance: 0 }], 'SGD')).toEqual([]);
  });
});

describe('amounts', () => {
  it('knows the whole-unit currencies', () => {
    expect(['JPY', 'KRW', 'VND'].every(isZeroDecimal)).toBe(true);
    expect(isZeroDecimal('SGD')).toBe(false);
  });
  it('parses to minor units', () => {
    expect(parseAmountToMinor('12.34', 'SGD')).toBe(1234);
    expect(parseAmountToMinor('1,234.5', 'USD')).toBe(123450);
    expect(parseAmountToMinor('6100', 'JPY')).toBe(6100);
    expect(parseAmountToMinor('0.1', 'SGD')).toBe(10);
  });
  it('rejects zero, negatives and junk', () => {
    for (const bad of ['0', '-5', 'abc', '', '  ']) expect(parseAmountToMinor(bad, 'SGD')).toBeNull();
  });
  it('formats with symbol and decimals', () => {
    expect(formatAmount(123456, 'SGD')).toBe('S$1,234.56');
    expect(formatAmount(-500, 'USD')).toBe('-$5.00');
    expect(formatAmount(6100, 'JPY')).toBe('¥6,100');
    expect(formatAmount(1000, 'CHF')).toBe('CHF 10.00');
  });
  it('formats in a given locale', () => {
    expect(formatAmount(123456, 'SGD', 'de-DE')).toBe('S$1.234,56');
    expect(formatAmount(12345600, 'INR', 'en-IN')).toBe('₹1,23,456.00');
    expect(formatAmount(6100, 'JPY', 'de-DE')).toBe('¥6.100');
    expect(formatAmount(123456, 'SGD', 'en-SG')).toBe('S$1,234.56');
  });
});
