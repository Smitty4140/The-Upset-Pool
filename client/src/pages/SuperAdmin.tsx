import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  Unlock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatWeeklyDate } from "@/lib/formatDate";
import { NFLWeek } from "@/lib/types";
import WeekSelector from "@/components/WeekSelector";
import GameResults from "@/components/GameResults";

interface SchedulerStatus {
  isRunning: boolean;
  jobCount: number;
}

interface SuperAdminUser {
  id: string;
  username: string | null;
  email: string | null;
  profileImageUrl: string | null;
  isSuperUser: boolean;
  createdAt: string | null;
}

// A labelled block of related site-wide controls.
function Section({
  title,
  tone,
  icon,
  blurb,
  children,
}: {
  title: string;
  tone: "blue" | "purple" | "green" | "amber";
  icon: React.ReactNode;
  blurb: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    purple: "bg-purple-50 border-purple-200 text-purple-800",
    green: "bg-green-50 border-green-200 text-green-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
  } as const;

  return (
    <div className="mb-6">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className={`${tones[tone]} border rounded-md p-3 mb-4 flex items-start`}>
        <span className="mt-0.5 mr-2 flex-shrink-0">{icon}</span>
        <div className="text-sm">{blurb}</div>
      </div>
      {children}
    </div>
  );
}

export default function SuperAdminPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { isSuperAdmin, isLoading: isLoadingStatus } = useSuperAdmin();

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [newSuperAdmin, setNewSuperAdmin] = useState("");

  const { data: currentWeek, refetch: refetchWeek } = useQuery<NFLWeek>({
    queryKey: ["/api/nfl-weeks/current"],
    enabled: isSuperAdmin,
  });

  const { data: schedulerStatus, isLoading: isLoadingScheduler } = useQuery<SchedulerStatus>({
    queryKey: ["/api/admin/scheduler/status"],
    enabled: isSuperAdmin,
    refetchInterval: 30000,
  });

  const { data: superAdmins, isLoading: isLoadingSuperAdmins } = useQuery<SuperAdminUser[]>({
    queryKey: ["/api/admin/super-admins"],
    enabled: isSuperAdmin,
  });

  const weekId = selectedWeekId ?? currentWeek?.id ?? null;
  const arePicksLocked = currentWeek ? new Date() > new Date(currentWeek.picksLockAt) : false;

  // Every site-wide button runs the same shape of request, so they share one
  // runner: it serialises actions, reports the server's message, and keeps the
  // spinner on exactly the button that was pressed.
  const runAction = async (
    key: string,
    url: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
      successTitle?: string;
      fallbackMessage?: string;
      onSuccess?: (data: any) => void | Promise<void>;
    } = {},
  ) => {
    const { method = "POST", body, successTitle = "Success", fallbackMessage = "Done", onSuccess } = options;
    setBusyAction(key);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        credentials: "include",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }
      toast({ title: successTitle, description: data?.message || fallbackMessage });
      await onSuccess?.(data);
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const addSuperAdminMutation = useMutation({
    mutationFn: async (identifier: string) => {
      const response = await apiRequest("POST", "/api/admin/super-admins", { identifier });
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Super admin added", description: data.message });
      setNewSuperAdmin("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/super-admins"] });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't add super admin",
        description: cleanApiError(error),
        variant: "destructive",
      });
    },
  });

  const removeSuperAdminMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/super-admins/${userId}`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Super admin removed", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/super-admins"] });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't remove super admin",
        description: cleanApiError(error),
        variant: "destructive",
      });
    },
  });

  if (isLoadingStatus) {
    return <div className="container mx-auto p-6 text-gray-500">Loading...</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto p-6 text-center">
        <p className="text-gray-600 mb-4">
          Site Admin is limited to super admins. League settings live on your league's Admin tab.
        </p>
        <Button variant="outline" onClick={() => setLocation("/")}>Go to My Leagues</Button>
      </div>
    );
  }

  const busy = (key: string) => busyAction === key;
  const anyBusy = busyAction !== null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <Helmet>
        <title>Site Admin | Upset Pool</title>
      </Helmet>

      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <ShieldCheck className="h-7 w-7 mr-2 text-primary" />
          Site Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Site-wide controls that affect every league. Settings for a single league — invite code,
          member status, and league defaults — live on that league's Admin tab.
        </p>
      </div>

      {/* ── NFL data ── */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Database className="h-5 w-5 mr-2 text-primary" />
            NFL Data
          </CardTitle>
          <CardDescription>
            Pull games and results from the external APIs
            {currentWeek ? ` — currently on Week ${currentWeek.weekNumber}` : ""}.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Section
            title="Pull Games & Spreads"
            tone="blue"
            icon={<Database className="h-5 w-5 text-blue-500" />}
            blurb="Populates this week's NFL games from The Odds API using DraftKings spreads. Existing games are updated with the latest odds."
          >
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={anyBusy || !currentWeek}
                onClick={() =>
                  runAction("pull-games", "/api/admin/games/fetch-from-api", {
                    body: { weekId: currentWeek?.id },
                    successTitle: "Games pulled",
                  })
                }
              >
                {busy("pull-games") ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Pulling...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Pull NFL Games from API</>
                )}
              </Button>
            </div>
          </Section>

          <Separator className="my-4" />

          <Section
            title="Pull Game Results"
            tone="green"
            icon={<CheckCircle className="h-5 w-5 text-green-600" />}
            blurb="Pulls completed game results from the ESPN API to update scores and recalculate everyone's points."
          >
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={anyBusy || !weekId}
                onClick={() =>
                  runAction("pull-results", "/api/admin/games/fetch-results", {
                    body: { weekId },
                    successTitle: "Results pulled",
                  })
                }
              >
                {busy("pull-results") ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Pulling...</>
                ) : (
                  <><Database className="h-4 w-4 mr-2" /> Pull Game Results from API</>
                )}
              </Button>
            </div>
          </Section>

          <Separator className="my-4" />

          <Section
            title="Lock / Unlock Picks"
            tone="amber"
            icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
            blurb={
              <>
                The pick deadline is shared by every league on the site, so this affects all of them.
                {arePicksLocked
                  ? " Unlocking restores the normal Sunday 1:00 PM ET deadline."
                  : " Locking closes picks immediately."}
              </>
            }
          >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
              <div className="mb-3 sm:mb-0">
                <div className="text-sm font-medium">
                  Current status:
                  <span className={arePicksLocked ? " text-red-600" : " text-green-600"}>
                    {arePicksLocked ? " Picks are locked" : " Picks are unlocked"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {currentWeek &&
                    `Week ${currentWeek.weekNumber}: ${formatWeeklyDate(currentWeek.startDate)} - ${formatWeeklyDate(currentWeek.endDate)}`}
                </div>
              </div>

              <Button
                variant={arePicksLocked ? "default" : "destructive"}
                size="sm"
                className="ml-auto"
                disabled={anyBusy || !currentWeek}
                onClick={() =>
                  runAction("toggle-lock", `/api/admin/week/${currentWeek?.id}/toggle-lock`, {
                    body: { locked: !arePicksLocked },
                    successTitle: "Pick lock updated",
                    onSuccess: async () => {
                      await refetchWeek();
                    },
                  })
                }
              >
                {busy("toggle-lock") ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating...</>
                ) : arePicksLocked ? (
                  <><Unlock className="h-4 w-4 mr-2" /> Unlock Picks</>
                ) : (
                  <><Lock className="h-4 w-4 mr-2" /> Lock Picks</>
                )}
              </Button>
            </div>
          </Section>
        </CardContent>
      </Card>

      {/* ── Manual result corrections ── */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold flex items-center mb-1">
          <CheckCircle className="h-5 w-5 mr-2 text-primary" />
          Correct Game Results
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Set or clear a winner by hand when the API gets a game wrong. Points are recalculated for
          every league.
        </p>
        <div className="mb-4">
          <WeekSelector
            currentWeekId={weekId}
            onWeekChange={(id) => setSelectedWeekId(id)}
            season={currentWeek?.season}
          />
        </div>
        {weekId ? (
          <GameResults weekId={weekId} />
        ) : (
          <p className="text-sm text-muted-foreground">Pick a week to see its games.</p>
        )}
      </div>

      {/* ── Scheduler & email ── */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Clock className="h-5 w-5 mr-2 text-primary" />
            Scheduler &amp; Notifications
          </CardTitle>
          <CardDescription>Automated data pulls and the email jobs that go with them.</CardDescription>
        </CardHeader>

        <CardContent>
          <Section
            title="Automated Data Scheduler"
            tone="purple"
            icon={<Clock className="h-5 w-5 text-purple-500" />}
            blurb="The scheduler pulls game data 8 hours before the first NFL game of a week and results 5 hours after the last one. Trigger a pull by hand if something looks stale."
          >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
              <div className="mb-3 sm:mb-0">
                <div className="text-sm font-medium">
                  Scheduler status:
                  <span className={schedulerStatus?.isRunning ? " text-green-600" : " text-red-600"}>
                    {isLoadingScheduler ? " Loading..." : schedulerStatus?.isRunning ? " Running" : " Stopped"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {schedulerStatus &&
                    `${schedulerStatus.jobCount || 0} scheduled job${schedulerStatus.jobCount !== 1 ? "s" : ""}`}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={anyBusy}
                  onClick={() =>
                    runAction("manual-pull", "/api/admin/scheduler/manual-pull", {
                      successTitle: "Manual pull triggered",
                    })
                  }
                >
                  {busy("manual-pull") ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Pulling...</>
                  ) : (
                    <><Activity className="h-4 w-4 mr-2" /> Manual Data Pull</>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={anyBusy}
                  onClick={() =>
                    runAction("test-job", "/api/admin/scheduler/test-job", { successTitle: "Test data pull run" })
                  }
                >
                  {busy("test-job") ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                  ) : (
                    <><Clock className="h-4 w-4 mr-2" /> Test Data Pull</>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={anyBusy}
                  onClick={() =>
                    runAction("test-results-job", "/api/admin/scheduler/test-results-job", {
                      successTitle: "Test results pull run",
                    })
                  }
                >
                  {busy("test-results-job") ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                  ) : (
                    <><CheckCircle className="h-4 w-4 mr-2" /> Test Results Pull</>
                  )}
                </Button>
              </div>
            </div>
          </Section>

          <Separator className="my-4" />

          <Section
            title="Email System Testing"
            tone="green"
            icon={<Mail className="h-5 w-5 text-green-600" />}
            blurb="Send the notification emails on demand. For safety, test emails go only to league admins."
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={anyBusy}
                onClick={() =>
                  runAction("test-weekly-emails", "/api/admin/scheduler/test-weekly-emails", {
                    successTitle: "Weekly reminders sent",
                  })
                }
              >
                {busy("test-weekly-emails") ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  "Test Weekly Reminders"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={anyBusy}
                onClick={() =>
                  runAction("test-picks-unlocked", "/api/admin/scheduler/test-picks-unlocked", {
                    successTitle: "Picks unlocked emails sent",
                  })
                }
              >
                {busy("test-picks-unlocked") ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  "Test Picks Unlocked"
                )}
              </Button>
            </div>
          </Section>

          <Separator className="my-4" />

          <Section
            title="Preseason Testing"
            tone="blue"
            icon={<Activity className="h-5 w-5 text-blue-600" />}
            blurb="Exercise the full game workflow with preseason games: pull games for the next 4 days, then schedule a results pull for tomorrow at 7 AM Eastern."
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                size="sm"
                disabled={anyBusy}
                onClick={() =>
                  runAction("preseason-games", "/api/admin/testing/fetch-preseason-games", {
                    successTitle: "Preseason games pulled",
                  })
                }
              >
                {busy("preseason-games") ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...</>
                ) : (
                  <><Database className="h-4 w-4 mr-2" /> Pull Preseason Games (Next 4 Days)</>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={anyBusy}
                onClick={() =>
                  runAction("preseason-results", "/api/admin/testing/schedule-preseason-results", {
                    successTitle: "Results pull scheduled",
                  })
                }
              >
                {busy("preseason-results") ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...</>
                ) : (
                  <><Clock className="h-4 w-4 mr-2" /> Schedule Results for Tomorrow 7 AM</>
                )}
              </Button>
            </div>
          </Section>
        </CardContent>
      </Card>

      {/* ── Super admin roster ── */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Shield className="h-5 w-5 mr-2 text-primary" />
            Super Admins
          </CardTitle>
          <CardDescription>
            Super admins can reach this page and everything on it. League admins cannot — their
            authority stops at their own league.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center mb-4"
            onSubmit={(event) => {
              event.preventDefault();
              const identifier = newSuperAdmin.trim();
              if (identifier) addSuperAdminMutation.mutate(identifier);
            }}
          >
            <Input
              value={newSuperAdmin}
              onChange={(event) => setNewSuperAdmin(event.target.value)}
              placeholder="Email address or username"
              aria-label="Email address or username of the new super admin"
              className="sm:max-w-sm"
              disabled={addSuperAdminMutation.isPending}
            />
            <Button type="submit" disabled={!newSuperAdmin.trim() || addSuperAdminMutation.isPending}>
              {addSuperAdminMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...</>
              ) : (
                <><Shield className="h-4 w-4 mr-2" /> Add Super Admin</>
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mb-4">
            The person needs an Upset Pool account already — adding them promotes an existing account
            rather than creating one.
          </p>

          {isLoadingSuperAdmins ? (
            <div className="text-sm text-gray-500">Loading super admins...</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {superAdmins?.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell className="font-medium">
                        {admin.username || admin.email || admin.id}
                        {admin.id === user?.id && (
                          <Badge variant="secondary" className="ml-2">You</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{admin.email || "No email"}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={
                            admin.id === user?.id ||
                            (superAdmins?.length ?? 0) <= 1 ||
                            removeSuperAdminMutation.isPending
                          }
                          title={
                            admin.id === user?.id
                              ? "Another super admin has to remove your access"
                              : (superAdmins?.length ?? 0) <= 1
                                ? "The last super admin can't be removed"
                                : "Remove super admin access"
                          }
                          onClick={() => {
                            const label = admin.username || admin.email || "this user";
                            if (window.confirm(`Remove super admin access from ${label}?`)) {
                              removeSuperAdminMutation.mutate(admin.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {superAdmins?.length === 0 && (
                <div className="text-center py-8 text-gray-500">No super admins found.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// apiRequest throws `${status}: ${body}` — show the server's sentence, not the
// status code and JSON envelope around it.
function cleanApiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutStatus = raw.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(withoutStatus);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return withoutStatus || "Please try again.";
}
