/**
 * Format a date string for display in a weekly format
 * @param dateStr Date string to format
 */
export function formatWeeklyDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format a date for displaying the game time in Eastern Time
 * @param dateStr Date string to format
 */
export function formatGameTime(dateStr: string): string {
  // The database stores times in Eastern Time, but without timezone info
  // If the string doesn't already have timezone info, add EST to treat it as Eastern
  let date: Date;
  if (dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('EST') || dateStr.includes('EDT')) {
    // Already has timezone info, parse as-is
    date = new Date(dateStr);
  } else {
    // No timezone info, assume it's Eastern Time
    date = new Date(dateStr + ' EST');
  }
  
  return date.toLocaleTimeString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short'
  });
}

/**
 * Get relative time display (e.g., "Today", "Tomorrow", "in 3 days")
 * @param dateStr Date string to check
 */
export function getRelativeTimeDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  
  // Reset time to midnight for date comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) return `in ${diffDays} days`;
  
  return formatWeeklyDate(dateStr);
}
