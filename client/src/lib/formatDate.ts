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
 * Format a date for displaying the game time
 * @param dateStr Date string to format
 */
export function formatGameTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
