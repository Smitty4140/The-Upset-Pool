import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import type { Server } from "http";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { db } from "../db";
import { users, leagues, leagueMembers } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "test-password-123";

function testUser(slug: string) {
  return {
    email: `member_default_${slug}_${RUN_ID}@example.com`,
    username: `md_${slug}_${RUN_ID}`.slice(0, 25),
    password: PASSWORD,
  };
}

describe("new member default status", () => {
  let app: express.Express;
  let server: Server;

  const leagueIds: number[] = [];
  const userIds: string[] = [];

  let defaultLeague: Awaited<ReturnType<typeof storage.createLeague>>;
  let inactiveLeague: Awaited<ReturnType<typeof storage.createLeague>>;
  let settingsLeague: Awaited<ReturnType<typeof storage.createLeague>>;
  let legacyLeague: Awaited<ReturnType<typeof storage.createLeague>>;
  let helperLeague: Awaited<ReturnType<typeof storage.createLeague>>;

  let adminAgent: request.SuperAgentTest;
  let memberAgent: request.SuperAgentTest;
  let inactiveAdminAgent: request.SuperAgentTest;
  let outsiderAgent: request.SuperAgentTest;
  let defaultJoinerAgent: request.SuperAgentTest;
  let inactiveJoinerAgent: request.SuperAgentTest;
  let legacyJoinerAgent: request.SuperAgentTest;
  let existingMemberId: string;
  let helperMemberId: string;
  let helperAdminId: string;

  async function registerAgent(slug: string) {
    const agent = request.agent(app);
    const res = await agent.post("/api/register").send(testUser(slug));
    expect(res.status).toBe(201);
    userIds.push(res.body.id);
    return { agent, userId: res.body.id as string };
  }

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    server = await registerRoutes(app);

    const admin = await registerAgent("admin");
    const member = await registerAgent("member");
    const inactiveAdmin = await registerAgent("inactive_admin");
    const outsider = await registerAgent("outsider");
    const defaultJoiner = await registerAgent("default_joiner");
    const inactiveJoiner = await registerAgent("inactive_joiner");
    const legacyJoiner = await registerAgent("legacy_joiner");
    const helperMember = await registerAgent("helper_member");
    const helperAdmin = await registerAgent("helper_admin");

    adminAgent = admin.agent;
    memberAgent = member.agent;
    inactiveAdminAgent = inactiveAdmin.agent;
    outsiderAgent = outsider.agent;
    defaultJoinerAgent = defaultJoiner.agent;
    inactiveJoinerAgent = inactiveJoiner.agent;
    legacyJoinerAgent = legacyJoiner.agent;
    existingMemberId = member.userId;
    helperMemberId = helperMember.userId;
    helperAdminId = helperAdmin.userId;

    defaultLeague = await storage.createLeague({
      name: `Default Active ${RUN_ID}`,
    } as any);
    inactiveLeague = await storage.createLeague({
      name: `Default Inactive ${RUN_ID}`,
      defaultMemberIsActive: false,
    } as any);
    settingsLeague = await storage.createLeague({
      name: `Settings ${RUN_ID}`,
    } as any);
    legacyLeague = await storage.createLeague({
      name: `Legacy Inactive ${RUN_ID}`,
      defaultMemberIsActive: false,
    } as any);
    helperLeague = await storage.createLeague({
      name: `Helper Inactive ${RUN_ID}`,
      defaultMemberIsActive: false,
    } as any);
    leagueIds.push(
      defaultLeague.id,
      inactiveLeague.id,
      settingsLeague.id,
      legacyLeague.id,
      helperLeague.id,
    );

    for (const league of [defaultLeague, inactiveLeague, settingsLeague]) {
      await storage.addLeagueMember({
        leagueId: league.id,
        userId: admin.userId,
        isAdmin: true,
        isActive: true,
      } as any);
    }
    await storage.addLeagueMember({
      leagueId: settingsLeague.id,
      userId: member.userId,
      isAdmin: false,
      isActive: true,
    } as any);
    await storage.addLeagueMember({
      leagueId: settingsLeague.id,
      userId: inactiveAdmin.userId,
      isAdmin: true,
      isActive: false,
    } as any);
  }, 60000);

  afterAll(async () => {
    if (leagueIds.length) {
      await db.delete(leagueMembers).where(inArray(leagueMembers.leagueId, leagueIds));
      await db.delete(leagues).where(inArray(leagues.id, leagueIds));
    }
    if (userIds.length) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 60000);

  it("uses Active by default for a new league and invite-code join", async () => {
    expect(defaultLeague.defaultMemberIsActive).toBe(true);

    const leaguesRes = await adminAgent.get("/api/user/leagues");
    expect(leaguesRes.status).toBe(200);
    expect(leaguesRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          leagueId: defaultLeague.id,
          league: expect.objectContaining({
            id: defaultLeague.id,
            defaultMemberIsActive: true,
          }),
        }),
      ]),
    );

    const res = await defaultJoinerAgent.post("/api/leagues/join").send({
      inviteCode: defaultLeague.inviteCode,
      nickname: "Active Joiner",
    });

    expect(res.status).toBe(200);
    expect(res.body.member.isActive).toBe(true);

    const joinedLeaguesRes = await defaultJoinerAgent.get("/api/user/leagues");
    expect(joinedLeaguesRes.status).toBe(200);
    expect(joinedLeaguesRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          leagueId: defaultLeague.id,
          isActive: true,
          league: expect.objectContaining({
            id: defaultLeague.id,
            defaultMemberIsActive: true,
          }),
        }),
      ]),
    );
  });

  it("applies an Inactive default to a new invite-code member", async () => {
    const res = await inactiveJoinerAgent.post("/api/leagues/join").send({
      inviteCode: inactiveLeague.inviteCode,
      nickname: "Inactive Joiner",
    });

    expect(res.status).toBe(200);
    expect(res.body.member.isActive).toBe(false);
  });

  it("applies the league default through the legacy join route", async () => {
    const res = await legacyJoinerAgent
      .post(`/api/leagues/${legacyLeague.id}/join`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.isAdmin).toBe(false);
    expect(res.body.isActive).toBe(false);
  });

  it("applies the league default through the storage helper while keeping admins active", async () => {
    const regularMember = await storage.addUserToLeague(
      helperLeague.id,
      helperMemberId,
      false,
    );
    const adminMember = await storage.addUserToLeague(
      helperLeague.id,
      helperAdminId,
      true,
    );

    expect(regularMember.isActive).toBe(false);
    expect(adminMember.isActive).toBe(true);
  });

  it("keeps a league creator active when the default is later changed to Inactive", async () => {
    const createRes = await adminAgent.post("/api/leagues").send({
      name: `Creator Active ${RUN_ID}`,
      sportType: "nfl",
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.defaultMemberIsActive).toBe(true);
    leagueIds.push(createRes.body.id);

    const leaguesRes = await adminAgent.get("/api/user/leagues");
    expect(leaguesRes.status).toBe(200);
    expect(leaguesRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          leagueId: createRes.body.id,
          isAdmin: true,
          isActive: true,
          league: expect.objectContaining({
            id: createRes.body.id,
            defaultMemberIsActive: true,
          }),
        }),
      ]),
    );

    const updateRes = await adminAgent
      .patch(`/api/leagues/${createRes.body.id}/default-member-status`)
      .send({ defaultMemberIsActive: false });
    expect(updateRes.status).toBe(200);

    const creatorMembership = await storage.getLeagueMember(
      createRes.body.id,
      userIds[0],
    );
    expect(creatorMembership?.isAdmin).toBe(true);
    expect(creatorMembership?.isActive).toBe(true);
  });

  it("rejects unauthenticated, non-admin, outsider, and inactive-admin updates", async () => {
    const path = `/api/leagues/${settingsLeague.id}/default-member-status`;
    const body = { defaultMemberIsActive: false };

    const unauthenticated = await request(app).patch(path).send(body);
    const member = await memberAgent.patch(path).send(body);
    const outsider = await outsiderAgent.patch(path).send(body);
    const inactiveAdmin = await inactiveAdminAgent.patch(path).send(body);

    expect(unauthenticated.status).toBe(401);
    expect(member.status).toBe(403);
    expect(outsider.status).toBe(403);
    expect(inactiveAdmin.status).toBe(403);
  });

  it("rejects a non-boolean setting value", async () => {
    const res = await adminAgent
      .patch(`/api/leagues/${settingsLeague.id}/default-member-status`)
      .send({ defaultMemberIsActive: "inactive" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("must be a boolean");
  });

  it("lets an active admin save the setting without changing existing members", async () => {
    const res = await adminAgent
      .patch(`/api/leagues/${settingsLeague.id}/default-member-status`)
      .send({ defaultMemberIsActive: false });

    expect(res.status).toBe(200);
    expect(res.body.league.defaultMemberIsActive).toBe(false);

    const savedLeague = await storage.getLeague(settingsLeague.id);
    const existingMember = await storage.getLeagueMember(
      settingsLeague.id,
      existingMemberId,
    );
    expect(savedLeague?.defaultMemberIsActive).toBe(false);
    expect(existingMember?.isActive).toBe(true);
  });
});