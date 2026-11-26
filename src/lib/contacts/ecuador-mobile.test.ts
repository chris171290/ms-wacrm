import { describe, expect, it } from 'vitest';

import { isValidEcuadorianMobile } from './ecuador-mobile';

describe('isValidEcuadorianMobile', () => {
  it.each([
    '0999178675',
    '593999178675',
    '+593999178675',
    '0999 178 675',
    '+593 99 917 8675',
  ])('accepts valid Ecuadorian mobile format: %s', (phone) => {
    expect(isValidEcuadorianMobile(phone)).toBe(true);
  });

  it.each([
    '999178675',
    '59399917867',
    '+14155550123',
    '0223456789',
    '09abc178675',
  ])('rejects invalid Ecuadorian mobile format: %s', (phone) => {
    expect(isValidEcuadorianMobile(phone)).toBe(false);
  });
});
