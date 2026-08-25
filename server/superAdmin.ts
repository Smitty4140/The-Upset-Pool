import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import { storage } from "./storage";

/**
 * Accounts that are super admins even before anyone has been granted the
 * `users.is_super_user` flag. They exist only to bootstrap an empty database
 * (and the historical single-owner deployment) — once a real super admin
 * exists in the table, membership is entirely DB-driven and manageable from
 * the Site Admin page.
 */
export const BOOTSTRAP_SUPER_USER_IDS = [
  "user_1753731196994_qfjmyp5i2",
  "42820911",
];

/**
 * Site-wide authority: results corrections, API pulls, the scheduler, and
 * granting the same authority to others. Deliberately separate from league
 * admin (`league_members.is_admin`), which only applies inside one league.
 */
export async function isSuperAdmin(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false;

  const [user] = await db
    .select({ isSuperUser: users.isSuperUser })
    .from(users)
    .where(eq(users.id, userId));

  if (user?.isSuperUser) return true;

  // The bootstrap accounts only count while nobody holds the flag, so
  // revoking the last real super admin can't silently hand the site back to
  // an account the current owners chose to remove.
  if (!BOOTSTRAP_SUPER_USER_IDS.includes(userId)) return false;
  return (await countSuperAdmins()) === 0;
}

export async function countSuperAdmins(): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isSuperUser, true));
  return rows.length;
}

/** Express middleware: reject anyone who is not a site-wide super admin. */
export async function requireSuperAdmin(req: any, res: any, next: any) {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    if (!(await isSuperAdmin(req.user.id))) {
      return res.status(403).json({ message: "Super admin access required" });
    }
  } catch (error) {
    console.error("Error checking super admin status:", error);
    return res.status(500).json({ message: "Failed to verify super admin access" });
  }

  next();
}

/**
 * League-scoped authority. Super admins are intentionally NOT granted it
 * implicitly: league settings belong to that league's admins, and a super
 * admin who wants them can add themselves to the league.
 */
export async function isLeagueAdmin(leagueId: number, userId: string | undefined | null): Promise<boolean> {
  if (!userId || isNaN(leagueId)) return false;
  const member = await storage.getLeagueMember(leagueId, userId);
  return Boolean(member?.isAdmin && member?.isActive);
}

/**
 * Express middleware factory for routes whose league id lives in the path.
 * `paramName` is the route parameter holding the league id.
 */
export function requireLeagueAdmin(paramName = "leagueId") {
  return async (req: any, res: any, next: any) => {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const leagueId = parseInt(req.params[paramName]);
    if (isNaN(leagueId)) {
      return res.status(400).json({ message: "Invalid league ID" });
    }

    try {
      if (!(await isLeagueAdmin(leagueId, req.user.id))) {
        return res.status(403).json({ message: "League admin access required" });
      }
    } catch (error) {
      console.error("Error checking league admin status:", error);
      return res.status(500).json({ message: "Failed to verify league admin access" });
    }

    next();
  };
}
