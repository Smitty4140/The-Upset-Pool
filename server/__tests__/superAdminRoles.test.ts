import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import type { Server } from "http";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, leagues, leagueMembers } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { runSuperAdminBackfill } from "../superAdminBackfill";
import { OWNER_SUPER_ADMIN_EMAILS, isOwnerSuperAdminEmail, isSuperAdmin } from "../superAdmin";

const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "test-password-123";

function testUser(slug: string) {
  return {
    email: `superadmin_test_${slug}_${RUN_ID}@example.com`,
    username: `sa_${slug}_${RUN_ID}`.slice(0, 25),
    password: PASSWORD,
  };
}

describe("super admin vs league admin separation", () => {
  let app: express.Express;
  let server: Server;
  let leagueId: number;

  const superAdmin = testUser("super");
  const secondSuper = testUser("super2");
  const leagueAdmin = testUser("leagueadm");
  const member = testUser("member");

  const userIds: string[] = [];

  async function registerAgent(u: { email: string; username: string; password: string }) {
    const agent = request.agent(app);
    const res = await agent.post("/api/register").send(u);
    expect(res.status).toBe(201);
    userIds.push(res.body.id);
    return { agent, userId: res.body.id as string };
  }

  let superAgent: request.SuperAgentTest;
  let superUserId: string;
  let secondSuperUserId: string;
  let leagueAdminAgent: request.SuperAgentTest;
  let leagueAdminUserId: string;
  let memberAgent: request.SuperAgentTest;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    server = await registerRoutes(app);

    // The column must exist before any of these routes can read it.
    await runSuperAdminBackfill(pool);

    const s = await registerAgent(superAdmin);
    const s2 = await registerAgent(secondSuper);
    const la = await registerAgent(leagueAdmin);
    const m = await registerAgent(member);

    superAgent = s.agent;
    superUserId = s.userId;
    secondSuperUserId = s2.userId;
    leagueAdminAgent = la.agent;
    leagueAdminUserId = la.userId;
    memberAgent = m.agent;

    await storage.setSuperAdmin(superUserId, true);

    const league = await storage.createLeague({
      name: `Super Admin Test League ${RUN_ID}`,
      createdBy: la.userId,
    } as any);
    leagueId = league.id;

    await storage.addLeagueMember({ leagueId, userId: la.userId, isAdmin: true } as any);
    await storage.addLeagueMember({ leagueId, userId: m.userId, isAdmin: false } as any);
  }, 60000);

  afterAll(async () => {
    if (leagueId) {
      await db.delete(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
      await db.delete(leagues).where(eq(leagues.id, leagueId));
    }
    if (userIds.length) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 60000);

  describe("GET /api/auth/super-user-status", () => {
    it("reports the database flag, not a hardcoded account", async () => {
      const asSuper = await superAgent.get("/api/auth/super-user-status");
      expect(asSuper.status).toBe(200);
      expect(asSuper.body.isSuperUser).toBe(true);

      const asLeagueAdmin = await leagueAdminAgent.get("/api/auth/super-user-status");
      expect(asLeagueAdmin.status).toBe(200);
      expect(asLeagueAdmin.body.isSuperUser).toBe(false);
    });
  });

  describe("site-wide routes reject league admins", () => {
    // Being an admin of a league confers nothing site-wide — that is the whole
    // point of the separation.
    const siteWideRequests: Array<[string, (agent: request.SuperAgentTest) => request.Test]> = [
      ["GET /api/admin/scheduler/status", (a) => a.get("/api/admin/scheduler/status")],
      ["GET /api/admin/super-admins", (a) => a.get("/api/admin/super-admins")],
      ["GET /api/users", (a) => a.get("/api/users")],
      [
        "POST /api/admin/games/fetch-results",
        (a) => a.post("/api/admin/games/fetch-results").send({ weekId: 1 }),
      ],
      [
        "POST /api/admin/games/fetch-from-api",
        (a) => a.post("/api/admin/games/fetch-from-api").send({ weekId: 1 }),
      ],
      [
        "POST /api/admin/week/1/toggle-lock",
        (a) => a.post("/api/admin/week/1/toggle-lock").send({ leagueId: 1, locked: true }),
      ],
      [
        "POST /api/admin/testing/fetch-preseason-games",
        (a) => a.post("/api/admin/testing/fetch-preseason-games").send({}),
      ],
      ["GET /api/admin/system/test-emails", (a) => a.get("/api/admin/system/test-emails")],
    ];

    for (const [label, send] of siteWideRequests) {
      it(`${label} is 403 for a league admin`, async () => {
        const res = await send(leagueAdminAgent);
        expect(res.status).toBe(403);
      });

      it(`${label} is 403 for an ordinary member`, async () => {
        const res = await send(memberAgent);
        expect(res.status).toBe(403);
      });
    }

    it("lets a super admin reach a site-wide route", async () => {
      const res = await superAgent.get("/api/admin/scheduler/status");
      expect(res.status).toBe(200);
    });
  });

  describe("league routes reject super admins who are not league admins", () => {
    it("does not let a super admin read another league's invite roster emails", async () => {
      const res = await superAgent.get(`/api/admin/league/${leagueId}/member-emails?status=all`);
      expect(res.status).toBe(403);
    });

    it("still lets the league's own admin read them", async () => {
      const res = await leagueAdminAgent.get(`/api/admin/league/${leagueId}/member-emails?status=all`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.emails)).toBe(true);
    });

    it("does not let an ordinary member read them", async () => {
      const res = await memberAgent.get(`/api/admin/league/${leagueId}/member-emails?status=all`);
      expect(res.status).toBe(403);
    });
  });

  describe("owner accounts", () => {
    // The owner set is configured server-side (SUPER_ADMIN_EMAILS, defaulting
    // to the site owner). These are the properties a deploy depends on.
    it("configures at least one owner", () => {
      expect(OWNER_SUPER_ADMIN_EMAILS.length).toBeGreaterThan(0);
    });

    it("matches owner emails case- and whitespace-insensitively", () => {
      const owner = OWNER_SUPER_ADMIN_EMAILS[0];
      expect(isOwnerSuperAdminEmail(owner)).toBe(true);
      expect(isOwnerSuperAdminEmail(owner.toUpperCase())).toBe(true);
      expect(isOwnerSuperAdminEmail(`  ${owner}  `)).toBe(true);
      expect(isOwnerSuperAdminEmail(superAdmin.email)).toBe(false);
      expect(isOwnerSuperAdminEmail(null)).toBe(false);
      expect(isOwnerSuperAdminEmail("")).toBe(false);
    });

    it("grants an owner account super admin at boot, and refuses to revoke it", async () => {
      const ownerEmail = OWNER_SUPER_ADMIN_EMAILS[0];

      // Stand in for the real owner: an account on the configured email that
      // starts with no flag at all.
      const ownerAccount = await storage.getUserByEmail(ownerEmail);
      const preExisting = Boolean(ownerAccount);
      let ownerId: string;

      if (ownerAccount) {
        ownerId = ownerAccount.id;
      } else {
        const created = await storage.createUser({
          id: `owner_test_${RUN_ID}`,
          email: ownerEmail,
          username: `owner_${RUN_ID}`.slice(0, 25),
          password: null,
          firstName: null,
          lastName: null,
          profileImageUrl: null,
          totalPoints: "0",
          emailVerified: false,
          receiveNotifications: true,
        } as any);
        ownerId = created.id;
        userIds.push(ownerId);
      }

      const wasSuper = Boolean((await storage.getUser(ownerId))?.isSuperUser);
      try {
        // Even starting from no flag, the owner is recognised immediately...
        await storage.setSuperAdmin(ownerId, false);
        expect(await isSuperAdmin(ownerId)).toBe(true);

        // ...and that first check persists the flag, so they show up in the
        // roster straight away instead of after the next deploy.
        expect((await storage.getUser(ownerId))?.isSuperUser).toBe(true);
        expect((await storage.getSuperAdmins()).map((u) => u.id)).toContain(ownerId);

        // A boot run is idempotent on top of that.
        const result = await runSuperAdminBackfill(pool);
        expect(result.ownersMissing).not.toContain(ownerEmail);
        expect((await storage.getUser(ownerId))?.isSuperUser).toBe(true);

        const roster = await superAgent.get("/api/admin/super-admins");
        expect(roster.status).toBe(200);
        const ownerRow = roster.body.find((u: any) => u.id === ownerId);
        expect(ownerRow?.isOwner).toBe(true);

        // Revoking an owner would only undo itself on the next deploy. The
        // caller here is a different super admin, so this is the owner guard
        // firing rather than the self-revoke or last-admin one.
        const revoke = await superAgent.delete(`/api/admin/super-admins/${ownerId}`);
        expect(revoke.status).toBe(400);
        expect(revoke.body.message).toMatch(/owner account/i);
        expect((await storage.getUser(ownerId))?.isSuperUser).toBe(true);
      } finally {
        if (preExisting) {
          await storage.setSuperAdmin(ownerId, wasSuper);
        }
      }
    });
  });

  describe("super admin management", () => {
    it("requires authentication", async () => {
      const res = await request(app).get("/api/admin/super-admins");
      expect(res.status).toBe(401);
    });

    it("adds a super admin by email and by username", async () => {
      const byEmail = await superAgent
        .post("/api/admin/super-admins")
        .send({ identifier: secondSuper.email });
      expect(byEmail.status).toBe(201);
      expect(byEmail.body.user.id).toBe(secondSuperUserId);
      expect(byEmail.body.user.isSuperUser).toBe(true);
      // Never ship the password hash back to the client.
      expect(byEmail.body.user.password).toBeUndefined();

      // The promoted account can now reach site-wide routes itself.
      const list = await superAgent.get("/api/admin/super-admins");
      expect(list.status).toBe(200);
      expect(list.body.map((u: any) => u.id)).toContain(secondSuperUserId);

      // Adding again is rejected rather than silently duplicated.
      const again = await superAgent
        .post("/api/admin/super-admins")
        .send({ identifier: secondSuper.username });
      expect(again.status).toBe(400);
    });

    it("rejects an unknown account", async () => {
      const res = await superAgent
        .post("/api/admin/super-admins")
        .send({ identifier: `nobody_${RUN_ID}@example.com` });
      expect(res.status).toBe(404);
    });

    it("rejects an empty identifier", async () => {
      const res = await superAgent.post("/api/admin/super-admins").send({ identifier: "  " });
      expect(res.status).toBe(400);
    });

    it("does not let a league admin grant super admin access", async () => {
      const res = await leagueAdminAgent
        .post("/api/admin/super-admins")
        .send({ identifier: leagueAdmin.email });
      expect(res.status).toBe(403);

      const stillNotSuper = await storage.getUser(leagueAdminUserId);
      expect(stillNotSuper?.isSuperUser).toBe(false);
    });

    it("refuses self-revocation", async () => {
      const res = await superAgent.delete(`/api/admin/super-admins/${superUserId}`);
      expect(res.status).toBe(400);

      const stillSuper = await storage.getUser(superUserId);
      expect(stillSuper?.isSuperUser).toBe(true);
    });

    it("refuses to revoke someone who is not a super admin", async () => {
      const res = await superAgent.delete(`/api/admin/super-admins/${leagueAdminUserId}`);
      expect(res.status).toBe(400);
    });

    it("removes another super admin, and their site-wide access goes with it", async () => {
      await storage.setSuperAdmin(secondSuperUserId, true);

      const secondAgent = request.agent(app);
      const login = await secondAgent
        .post("/api/login")
        .send({ email: secondSuper.email, password: PASSWORD });
      expect(login.status).toBe(200);
      expect((await secondAgent.get("/api/admin/scheduler/status")).status).toBe(200);

      const res = await superAgent.delete(`/api/admin/super-admins/${secondSuperUserId}`);
      expect(res.status).toBe(200);

      const demoted = await storage.getUser(secondSuperUserId);
      expect(demoted?.isSuperUser).toBe(false);

      // Access is re-checked per request, so the open session loses it too.
      expect((await secondAgent.get("/api/admin/scheduler/status")).status).toBe(403);
    });

    it("always leaves the site with at least one super admin", async () => {
      // Shrink the roster to exactly two, then remove one and confirm the
      // survivor cannot be removed — so the Site Admin page can never become
      // unreachable for everyone.
      const others = (await storage.getSuperAdmins()).filter(
        (u) => u.id !== superUserId && u.id !== secondSuperUserId,
      );
      try {
        for (const other of others) {
          await storage.setSuperAdmin(other.id, false);
        }
        await storage.setSuperAdmin(secondSuperUserId, true);

        const secondAgent = request.agent(app);
        const login = await secondAgent
          .post("/api/login")
          .send({ email: secondSuper.email, password: PASSWORD });
        expect(login.status).toBe(200);

        const removeFirst = await secondAgent.delete(`/api/admin/super-admins/${superUserId}`);
        expect(removeFirst.status).toBe(200);

        // One left, and they are the caller — the guards refuse.
        const removeLast = await secondAgent.delete(`/api/admin/super-admins/${secondSuperUserId}`);
        expect(removeLast.status).toBe(400);

        expect((await storage.getSuperAdmins()).map((u) => u.id)).toEqual([secondSuperUserId]);
      } finally {
        await storage.setSuperAdmin(superUserId, true);
        await storage.setSuperAdmin(secondSuperUserId, false);
        for (const other of others) {
          await storage.setSuperAdmin(other.id, true);
        }
      }
    });
  });
});
