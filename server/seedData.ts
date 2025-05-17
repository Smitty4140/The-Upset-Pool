import { db } from "./db";
import { nflWeeks } from "@shared/schema";

/**
 * Seed proper NFL week data
 */
export async function seedNFLWeeks() {
  // Clear existing weeks
  await db.delete(nflWeeks);
  
  // Create 18 weeks for the NFL 2025 season (adjust dates as needed)
  const weeks = [];
  
  // Week 1: Sept 4-9, 2025
  weeks.push({
    weekNumber: 1,
    season: 2025,
    startDate: "2025-09-04",
    endDate: "2025-09-09",
    active: true,
    picksLockAt: "2025-09-07T17:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 2: Sept 11-15, 2025
  weeks.push({
    weekNumber: 2,
    season: 2025,
    startDate: "2025-09-11",
    endDate: "2025-09-15",
    active: false,
    picksLockAt: "2025-09-14T17:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 3: Sept 18-22, 2025
  weeks.push({
    weekNumber: 3,
    season: 2025,
    startDate: "2025-09-18",
    endDate: "2025-09-22",
    active: false,
    picksLockAt: "2025-09-21T17:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 4: Sept 25-29, 2025
  weeks.push({
    weekNumber: 4,
    season: 2025,
    startDate: "2025-09-25",
    endDate: "2025-09-29",
    active: false,
    picksLockAt: "2025-09-28T17:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 5: Oct 2-6, 2025
  weeks.push({
    weekNumber: 5,
    season: 2025,
    startDate: "2025-10-02",
    endDate: "2025-10-06",
    active: false,
    picksLockAt: "2025-10-05T17:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 6: Oct 9-13, 2025
  weeks.push({
    weekNumber: 6,
    season: 2025,
    startDate: "2025-10-09",
    endDate: "2025-10-13",
    active: false,
    picksLockAt: "2025-10-12T17:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 7: Oct 16-20, 2025
  weeks.push({
    weekNumber: 7,
    season: 2025,
    startDate: "2025-10-16",
    endDate: "2025-10-20",
    active: false,
    picksLockAt: "2025-10-19T17:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 8: Oct 23-27, 2025
  weeks.push({
    weekNumber: 8,
    season: 2025,
    startDate: "2025-10-23",
    endDate: "2025-10-27",
    active: false,
    picksLockAt: "2025-10-26T17:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 9: Oct 30-Nov 3, 2025
  weeks.push({
    weekNumber: 9,
    season: 2025,
    startDate: "2025-10-30",
    endDate: "2025-11-03",
    active: false,
    picksLockAt: "2025-11-02T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 10: Nov 6-10, 2025
  weeks.push({
    weekNumber: 10,
    season: 2025,
    startDate: "2025-11-06",
    endDate: "2025-11-10",
    active: false,
    picksLockAt: "2025-11-09T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 11: Nov 13-17, 2025
  weeks.push({
    weekNumber: 11,
    season: 2025,
    startDate: "2025-11-13",
    endDate: "2025-11-17",
    active: false,
    picksLockAt: "2025-11-16T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 12: Nov 20-24, 2025
  weeks.push({
    weekNumber: 12,
    season: 2025,
    startDate: "2025-11-20",
    endDate: "2025-11-24",
    active: false,
    picksLockAt: "2025-11-23T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 13: Nov 27-Dec 1, 2025
  weeks.push({
    weekNumber: 13,
    season: 2025,
    startDate: "2025-11-27",
    endDate: "2025-12-01",
    active: false,
    picksLockAt: "2025-11-30T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 14: Dec 4-8, 2025
  weeks.push({
    weekNumber: 14,
    season: 2025,
    startDate: "2025-12-04",
    endDate: "2025-12-08",
    active: false,
    picksLockAt: "2025-12-07T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 15: Dec 11-15, 2025
  weeks.push({
    weekNumber: 15,
    season: 2025,
    startDate: "2025-12-11",
    endDate: "2025-12-15",
    active: false,
    picksLockAt: "2025-12-14T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 16: Dec 18-22, 2025
  weeks.push({
    weekNumber: 16,
    season: 2025,
    startDate: "2025-12-18",
    endDate: "2025-12-22",
    active: false,
    picksLockAt: "2025-12-21T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 17: Dec 25-29, 2025
  weeks.push({
    weekNumber: 17,
    season: 2025,
    startDate: "2025-12-25",
    endDate: "2025-12-29",
    active: false,
    picksLockAt: "2025-12-28T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Week 18: Jan 1-5, 2026
  weeks.push({
    weekNumber: 18,
    season: 2025,
    startDate: "2026-01-01",
    endDate: "2026-01-05",
    active: false,
    picksLockAt: "2026-01-04T18:00:00.000Z", // 1:00 PM EST on Sunday
  });
  
  // Insert all weeks
  await db.insert(nflWeeks).values(weeks);
  
  console.log(`Seeded ${weeks.length} NFL weeks for the 2025 season`);
  return weeks;
}