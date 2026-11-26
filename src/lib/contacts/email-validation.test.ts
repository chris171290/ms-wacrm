import { describe, expect, it } from 'vitest';
import { isValidContactEmail } from './email-validation';

describe('isValidContactEmail', () => {
  it('accepts a standard email address with surrounding whitespace', () => {
    expect(isValidContactEmail(' jane@example.com ')).toBe(true);
  });

  it.each(['', 'not-an-email', 'name@domain', 'name@domain..com'])(
    'rejects invalid address %j',
    (email) => {
      expect(isValidContactEmail(email)).toBe(false);
    },
  );
});
