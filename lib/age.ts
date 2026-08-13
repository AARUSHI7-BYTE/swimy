export function ageFromDateOfBirth(raw: string): number | undefined {
  const digits = raw.match(/\d+/g);
  if (!digits || digits.length < 3) return undefined;
  const [dayStr, monthStr, yearStr] = digits;
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr.length === 2 ? `20${yearStr}` : yearStr, 10);
  if (!day || !month || !year) return undefined;

  const dob = new Date(year, month - 1, day);
  if (Number.isNaN(dob.getTime())) return undefined;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear = today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;

  return age >= 0 && age < 130 ? age : undefined;
}
