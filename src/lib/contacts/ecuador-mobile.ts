import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function isValidEcuadorianMobile(phone: string): boolean {
  const value = phone.trim();
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return false;

  const digits = value.replace(/\D/g, '');
  const isNationalFormat = /^09\d{8}$/.test(digits);
  const isInternationalFormat = /^5939\d{8}$/.test(digits);
  if (!isNationalFormat && !isInternationalFormat) return false;

  const parsed = isInternationalFormat
    ? parsePhoneNumberFromString(`+${digits}`)
    : parsePhoneNumberFromString(digits, 'EC');

  return parsed?.country === 'EC' && parsed.isValid();
}
