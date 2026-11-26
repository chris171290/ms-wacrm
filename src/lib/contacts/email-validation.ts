export function isValidContactEmail(email: string): boolean {
  const value = email.trim();
  return /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]+$/.test(value);
}
