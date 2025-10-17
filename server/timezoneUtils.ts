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
