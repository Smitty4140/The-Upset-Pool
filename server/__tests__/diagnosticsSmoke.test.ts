import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the database layer: these diagnostics only ever select, and the smoke
// test cares about the reporting logic, not the rows.
const selectResult: any[] = [];
vi.mock("../db.js", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(selectResult) }),
    }),
  },
}));

import { diagnoseSpreads, diagnoseResults } from "../diagnostics";

const WEEK = {
  id: 1,
  weekNumber: 2,
  season: 2026,
  startDate: "2026-09-16",
  endDate: "2026-09-22",
  picksLockAt: new Date("2026-09-20T17:00:00Z"),
  active: true,
};

const TEAMS = [
  { id: 1, name: "Kansas City Chiefs", abbreviation: "KC", logoUrl: "", primaryColor: null, secondaryColor: null },
  { id: 2, name: "Los Angeles Chargers", abbreviation: "LAC", logoUrl: "", primaryColor: null, secondaryColor: null },
] as any[];

const storage = {
  getNFLWeek: async (id: number) => (id === 1 ? WEEK : undefined),
  getNFLWeeks: async () => [WEEK],
  getNFLTeams: async () => TEAMS,
} as any;

function mockFetch(body: any, init: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}) {
  const headers = new Map(Object.entries(init.headers ?? {}));
  global.fetch = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.ok === false ? "Error" : "OK",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    json: async () => body,
  }) as any;
}

beforeEach(() => {
  selectResult.length = 0;
  process.env.THE_ODDS_API_KEY = "test-key";
});

describe("diagnoseSpreads", () => {
  const inWeekGame = {
    commence_time: "2026-09-20T17:00:00Z", // Sunday 1:00 PM ET, inside week 2
    home_team: "Kansas City Chiefs",
    away_team: "Los Angeles Chargers",
    bookmakers: [{
      key: "draftkings",
      markets: [{ key: "spreads", outcomes: [{ name: "Kansas City Chiefs", point: -3.5 }] }],
    }],
  };

  it("reports a healthy pull with quota and ET kickoffs", async () => {
    mockFetch([inWeekGame], { headers: { "x-requests-remaining": "412", "x-requests-used": "88" } });
    const r = await diagnoseSpreads(storage, 1);

    expect(r.status).toBe("pass");
    expect(r.quota).toEqual({ remaining: "412", used: "88" });
    expect(r.gamesInSelectedWeek).toHaveLength(1);
    expect(r.gamesInSelectedWeek[0].kickoffET).toContain("1:00 PM ET");
    expect(r.gamesInSelectedWeek[0].spread).toBe(-3.5);
    expect(r.wouldCreate).toBe(1);
    expect(r.readOnly).toBe(true);
  });

  it("buckets an out-of-week game separately instead of calling it an error", async () => {
    const nextWeek = { ...inWeekGame, commence_time: "2026-10-04T17:00:00Z" };
    mockFetch([inWeekGame, nextWeek]);
    const r = await diagnoseSpreads(storage, 1);

    expect(r.status).toBe("pass"); // out-of-week is normal, not a failure
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0].reason).toBe("out-of-week");
  });

  it("warns on an unmatched team name", async () => {
    mockFetch([{ ...inWeekGame, home_team: "Kansas City Monarchs" }]);
    const r = await diagnoseSpreads(storage, 1);

    expect(r.status).toBe("fail"); // nothing matched the week at all
    expect(r.excluded[0].reason).toBe("unmatched-team");
  });

  it("flags a missing spreads market", async () => {
    mockFetch([{ ...inWeekGame, bookmakers: [{ key: "draftkings", markets: [] }] }]);
    const r = await diagnoseSpreads(storage, 1);

    expect(r.excluded[0].reason).toBe("no-spreads-market");
  });

  it("explains a 401 and a 429 rather than just failing", async () => {
    mockFetch({}, { ok: false, status: 401 });
    expect((await diagnoseSpreads(storage, 1)).summary).toContain("API key");

    mockFetch({}, { ok: false, status: 429 });
    expect((await diagnoseSpreads(storage, 1)).summary).toContain("quota");
  });

  it("says so when the key is missing, without calling out", async () => {
    delete process.env.THE_ODDS_API_KEY;
    global.fetch = vi.fn() as any;
    const r = await diagnoseSpreads(storage, 1);

    expect(r.summary).toContain("THE_ODDS_API_KEY");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("diagnoseResults", () => {
  const event = (state: string, completed: boolean, scores: [string, string]) => ({
    competitions: [{
      status: { type: { completed, state } },
      competitors: [
        { homeAway: "home", score: scores[1], team: { displayName: "Kansas City Chiefs", abbreviation: "KC" } },
        { homeAway: "away", score: scores[0], team: { displayName: "Los Angeles Chargers", abbreviation: "LAC" } },
      ],
    }],
  });

  it("builds the ESPN URL from the week's stored season and number", async () => {
    mockFetch({ events: [] });
    const r = await diagnoseResults(storage, 1);
    expect(r.espnUrl).toContain("dates=2026");
    expect(r.espnUrl).toContain("week=2");
    expect(r.espnUrl).toContain("seasontype=2");
  });

  it("passes pre-season while saying it only proves mapping", async () => {
    mockFetch({ events: [event("pre", false, ["0", "0"])] });
    const r = await diagnoseResults(storage, 1);

    expect(r.status).toBe("pass");
    expect(r.games[0].state).toBe("scheduled");
    expect(r.summary).toContain("not results handling");
    expect(r.readOnly).toBe(true);
  });

  it("warns when a team name does not map", async () => {
    const bad = event("post", true, ["17", "24"]);
    bad.competitions[0].competitors[0].team = { displayName: "Kansas City Monarchs", abbreviation: "KCM" } as any;
    mockFetch({ events: [bad] });
    const r = await diagnoseResults(storage, 1);

    expect(r.status).toBe("warn");
    expect(r.unmatchedTeams).toContain("Kansas City Monarchs");
  });

  it("reports a completed game as a proposal, never an update", async () => {
    selectResult.push({ id: 99, weekId: 1, homeTeamId: 1, awayTeamId: 2, completed: false, homeTeamScore: null, awayTeamScore: null });
    mockFetch({ events: [event("post", true, ["17", "24"])] });
    const r = await diagnoseResults(storage, 1);

    expect(r.games[0].state).toBe("completed");
    expect(r.games[0].proposedChange).toContain("would set 17-24");
    expect(r.games[0].proposedChange).toContain("Kansas City Chiefs");
  });

  it("notes an in-progress game without proposing a change", async () => {
    mockFetch({ events: [event("in", false, ["7", "10"])] });
    const r = await diagnoseResults(storage, 1);

    expect(r.games[0].state).toBe("in-progress");
    expect(r.games[0].proposedChange).toBeNull();
  });
});
