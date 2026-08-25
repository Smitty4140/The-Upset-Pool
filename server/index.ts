import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runLeagueDataBackfills } from "./leagueDataBackfill";
import { runSuperAdminBackfill } from "./superAdminBackfill";
import { pool } from "./db";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const leagueBackfillResult = await runLeagueDataBackfills(pool);
  log(
    `League data verified (${leagueBackfillResult.leaguesUpdated} leagues, ` +
      `${leagueBackfillResult.membershipsUpdated} memberships, ` +
      `${leagueBackfillResult.nicknamesUpdated} nicknames updated)`,
  );

  const superAdminResult = await runSuperAdminBackfill(pool);
  log(
    `Super admins verified (${superAdminResult.superAdmins} total` +
      `${superAdminResult.bootstrapped > 0 ? `, ${superAdminResult.bootstrapped} bootstrapped` : ""}` +
      `${superAdminResult.columnAdded ? ", is_super_user column added" : ""})`,
  );

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Any /api path not claimed by a registered route must fail as JSON.
  // Without this, unknown API paths fall through to the SPA catch-all and
  // come back as index.html with a 200 — which clients then fail to parse,
  // hiding the real problem (usually a server running an older build).
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ message: "API endpoint not found" });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);

    // Start the game scheduler after server is running
    try {
      const { gameScheduler } = await import("./scheduler.js");
      gameScheduler.start();
      log("NFL Game Data Scheduler started");
    } catch (error) {
      console.error("Failed to start game scheduler:", error);
    }

    // Start the golf score scheduler
    try {
      const { startGolfScheduler } = await import("./golfScheduler.js");
      const { storage } = await import("./storage.js");
      startGolfScheduler(storage);
      log("Golf Score Scheduler started");
    } catch (error) {
      console.error("Failed to start golf scheduler:", error);
    }
  });
})();
