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
    email: `archive_test_${slug}_${RUN_ID}@example.com`,
    username: `arch_${slug}_${RUN_ID}`.slice(0, 25),
    password: PASSWORD,
  };
}

describe("PATCH /api/leagues/:leagueId/archive authorization", () => {
  let app: express.Express;
  let server: Server;
  let leagueId: number;

  const admin = testUser("admin");
  const member = testUser("member");
  const outsider = testUser("outsider");
  const inactiveAdmin = testUser("inactadm");

  const userIds: string[] = [];

  // Register a user via the real registration endpoint and return a
  // logged-in supertest agent plus the created user id.
  async function registerAgent(u: { email: string; username: string; password: string }) {
    const agent = request.agent(app);
    const res = await agent.post("/api/register").send(u);
    expect(res.status).toBe(201);
    userIds.push(res.body.id);
    return { agent, userId: res.body.id as string };
  }

  let adminAgent: request.SuperAgentTest;
  let memberAgent: request.SuperAgentTest;
  let outsiderAgent: request.SuperAgentTest;
  let inactiveAdminAgent: request.SuperAgentTest;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    server = await registerRoutes(app);

    const a = await registerAgent(admin);
    const m = await registerAgent(member);
    const o = await registerAgent(outsider);
    const ia = await registerAgent(inactiveAdmin);
    adminAgent = a.agent;
    memberAgent = m.agent;
    outsiderAgent = o.agent;
    inactiveAdminAgent = ia.agent;

    const league = await storage.createLeague({
      name: `Archive Test League ${RUN_ID}`,
      createdBy: a.userId,
    } as any);
    leagueId = league.id;

    await storage.addLeagueMember({ leagueId, userId: a.userId, isAdmin: true } as any);
    await storage.addLeagueMember({ leagueId, userId: m.userId, isAdmin: false } as any);
    await storage.addLeagueMember({ leagueId, userId: ia.userId, isAdmin: true } as any);
    await storage.updateLeagueMember(leagueId, ia.userId, { isActive: false } as any);
  }, 60000);

  afterAll(async () => {
    // Clean up test data
    if (leagueId) {
      await db.delete(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
      await db.delete(leagues).where(eq(leagues.id, leagueId));
    }
    if (userIds.length) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 60000);

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app)
      .patch(`/api/leagues/${leagueId}/archive`)
      .send({ isArchived: true });
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated non-member with 403", async () => {
    const res = await outsiderAgent
      .patch(`/api/leagues/${leagueId}/archive`)
      .send({ isArchived: true });
    expect(res.status).toBe(403);
  });

  it("rejects a non-admin league member with 403", async () => {
    const res = await memberAgent
      .patch(`/api/leagues/${leagueId}/archive`)
      .send({ isArchived: true });
    expect(res.status).toBe(403);
  });

  it("rejects an inactive league admin with 403", async () => {
    const res = await inactiveAdminAgent
      .patch(`/api/leagues/${leagueId}/archive`)
      .send({ isArchived: true });
    expect(res.status).toBe(403);
  });

  it("allows an active league admin to archive (200) and unarchive", async () => {
    const res = await adminAgent
      .patch(`/api/leagues/${leagueId}/archive`)
      .send({ isArchived: true });
    expect(res.status).toBe(200);
    expect(res.body.league.isArchived).toBe(true);

    // League stays archived when a non-admin tries to unarchive
    const denied = await memberAgent
      .patch(`/api/leagues/${leagueId}/archive`)
      .send({ isArchived: false });
    expect(denied.status).toBe(403);

    // Admin can unarchive (restore state)
    const undo = await adminAgent
      .patch(`/api/leagues/${leagueId}/archive`)
      .send({ isArchived: false });
    expect(undo.status).toBe(200);
    expect(undo.body.league.isArchived).toBe(false);
  });
});
