/**
 * Timezone utility functions for consistent Eastern Time to UTC conversions
 */

/**
 * Convert a date/time in Eastern Time to UTC
 * @param year - Full year (e.g., 2025)
 * @param month - Month (1-12)
 * @param day - Day of month (1-31)
 * @param hour - Hour in 24-hour format (0-23)
 * @param minute - Minute (0-59)
 * @returns Date object representing the UTC time
 */
export function easternTimeToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0
): Date {
  // Create a date string in ISO format for the target Eastern Time
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const hourStr = String(hour).padStart(2, '0');
  const minuteStr = String(minute).padStart(2, '0');
  
  // Try both EDT (UTC-4) and EST (UTC-5) offsets
  const edtTime = new Date(`${year}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}:00-04:00`);
  const estTime = new Date(`${year}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}:00-05:00`);
  
  // Use Intl.DateTimeFormat to check which one gives us the correct hour in ET
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
  });
  
  const edtHour = parseInt(formatter.format(edtTime));
  const estHour = parseInt(formatter.format(estTime));
  
  // Return whichever gives us the target hour
  if (edtHour === hour) {
    return edtTime;
  } else if (estHour === hour) {
    return estTime;
  } else {
    // Fallback to EDT if neither matches (shouldn't happen)
    console.warn(`[TimezoneUtils] Neither EDT nor EST matched target hour ${hour}, using EDT`);
    return edtTime;
  }
}

/**
 * Get picks lock time for an NFL Sunday (1:00 PM Eastern Time)
 * @param sundayDate - The Sunday date (any time, will be set to 1 PM ET)
 * @returns Date object representing 1:00 PM ET on that Sunday in UTC
 */
export function getPicksLockTimeForSunday(sundayDate: Date): Date {
  const year = sundayDate.getFullYear();
  const month = sundayDate.getMonth() + 1; // JS months are 0-indexed
  const day = sundayDate.getDate();
  
  return easternTimeToUTC(year, month, day, 13, 0); // 13:00 = 1 PM
}

/**
 * Format a Date to Eastern Time string for logging
 * @param date - The date to format
 * @returns Formatted string showing date/time in ET
 */
export function formatDateInEasternTime(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Format a picks-lock timestamp the way members read it in email, e.g.
 * "Sunday, September 7 at 1:00 PM ET".
 */
export function formatPicksLockAt(date: Date): string {
  const formatted = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  // "Sunday, September 7 at 1:00 PM" — en-US puts a comma before the time
  return `${formatted.replace(/, (\d{1,2}:\d{2})/, ' at $1')} ET`;
}

/**
 * Just the clock portion of a picks-lock timestamp, e.g. "1:00 PM ET".
 * Used inline in email copy where the date is already established.
 */
export function formatPicksLockTimeOnly(date: Date): string {
  const formatted = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${formatted} ET`;
}

/**
 * The calendar date a timestamp falls on in Eastern Time, as YYYY-MM-DD.
 *
 * NFL weeks are bucketed by ET date, not UTC date. A Sunday night kickoff at
 * 8:20 PM ET is already Monday in UTC, and a Monday night one is Tuesday — so
 * bucketing on `toISOString()` pushes those games into the next week's window
 * or out of the schedule entirely.
 */
export function easternDateString(date: Date): string {
  // en-CA renders as YYYY-MM-DD, which compares correctly as a plain string.
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * A `date` column (start_date / end_date) as YYYY-MM-DD.
 *
 * Drizzle hands these back as strings, but a driver or a test fixture can
 * produce a Date at UTC midnight; converting that one to ET would walk it back
 * a day, so it is read in UTC while a real string is just trimmed.
 */
export function calendarDateString(value: string | Date): string {
  return typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
}

/**
 * The NFL week a kickoff belongs to, or null if it falls outside every week's
 * date range.
 *
 * Shared by the odds puller and the spreads diagnostic so the preflight
 * reports what a real pull would actually do rather than agreeing with a
 * second copy of the rule.
 */
export function findWeekForKickoff<T extends { startDate: string | Date; endDate: string | Date }>(
  weeks: T[],
  kickoff: Date
): T | null {
  const kickoffDate = easternDateString(kickoff);
  for (const week of weeks) {
    if (
      kickoffDate >= calendarDateString(week.startDate) &&
      kickoffDate <= calendarDateString(week.endDate)
    ) {
      return week;
    }
  }
  return null;
}
