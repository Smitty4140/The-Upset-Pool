import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCountdown } from "@/hooks/useCountdown";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GolfTournament, GolfFieldEntry, GolfPickSession, GolfLeaderboardEntry, League } from "@/lib/types";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Clock,
  Flag,
  Search,
  CheckCircle2,
  Trophy,
  Lock,
  ChevronUp,
  ChevronDown,
  MapPin,
  Calendar,
  Users,
  Star,
} from "lucide-react";

interface GolfLeagueViewProps {
  leagueId: number;
  league: League;
  isSuperUser: boolean;
}

type GolfTab = "picks" | "leaderboard" | "admin";

export default function GolfLeagueView({ leagueId, league, isSuperUser }: GolfLeagueViewProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<GolfTab>("picks");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"owgr" | "name">("owgr");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
  const [hasLoadedPicks, setHasLoadedPicks] = useState(false);

  const tournamentId = league.golfTournamentId;

  // Fetch tournament info
  const { data: tournament, isLoading: isLoadingTournament } = useQuery<GolfTournament>({
    queryKey: [`/api/golf/tournaments/${tournamentId}`],
    enabled: !!tournamentId,
  });

  // Fetch tournament field
  const { data: field = [], isLoading: isLoadingField } = useQuery<GolfFieldEntry[]>({
    queryKey: [`/api/golf/tournaments/${tournamentId}/field`],
    enabled: !!tournamentId,
  });

  // Fetch user's current picks
  const { data: myPick, isLoading: isLoadingPick } = useQuery<GolfPickSession | null>({
    queryKey: [`/api/golf/leagues/${leagueId}/picks`],
    enabled: isAuthenticated,
  });

  // Pre-populate selections from saved picks (only on first load)
  useEffect(() => {
    if (!hasLoadedPicks && myPick?.selections) {
      setSelectedPlayerIds(new Set(myPick.selections.map(s => s.playerId)));
      setHasLoadedPicks(true);
    }
  }, [myPick, hasLoadedPicks]);

  // Fetch leaderboard
  const { data: leaderboard = [], isLoading: isLoadingLeaderboard } = useQuery<GolfLeaderboardEntry[]>({
    queryKey: [`/api/golf/leagues/${leagueId}/leaderboard`],
    enabled: activeTab === "leaderboard",
  });

  // Countdown
  const lockDate = useMemo(() => tournament?.picksLockAt ? new Date(tournament.picksLockAt) : null, [tournament?.picksLockAt]);
  const { days, hours, minutes, isExpired: isLocked } = useCountdown(lockDate);

  const picksRequired = tournament?.picksRequired ?? 4;

  // Submit picks mutation
  const submitPicksMutation = useMutation({
    mutationFn: async (playerIds: number[]) =>
      apiRequest("POST", `/api/golf/leagues/${leagueId}/picks`, { playerIds }),
    onSuccess: () => {
      toast({ title: "Picks saved!", description: `Your ${picksRequired} golfers have been locked in.` });
      queryClient.invalidateQueries({ queryKey: [`/api/golf/leagues/${leagueId}/picks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/golf/leagues/${leagueId}/leaderboard`] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save picks", variant: "destructive" });
    },
  });

  const togglePlayer = (playerId: number) => {
    if (isLocked) return;
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else if (next.size < picksRequired) {
        next.add(playerId);
      } else {
        toast({ title: "Too many picks", description: `You can only select ${picksRequired} golfers`, variant: "destructive" });
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (selectedPlayerIds.size !== picksRequired) {
      toast({ title: "Incomplete picks", description: `Please select exactly ${picksRequired} golfers`, variant: "destructive" });
      return;
    }
    submitPicksMutation.mutate(Array.from(selectedPlayerIds));
  };

  // Filter and sort field
  const filteredField = useMemo(() => {
    let list = [...field];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.country?.toLowerCase().includes(q)));
    }
    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Sort by OWGR (ranked players first, then amateurs/no-OWGR)
      list.sort((a, b) => {
        if (a.owgrAtLock === null && b.owgrAtLock === null) return a.name.localeCompare(b.name);
        if (a.owgrAtLock === null) return 1;
        if (b.owgrAtLock === null) return -1;
        return a.owgrAtLock - b.owgrAtLock;
      });
    }
    return list;
  }, [field, search, sortBy]);

  // Has results been entered?
  const hasResults = leaderboard.length > 0 && leaderboard.some(e => e.picks.some(p => p.resultStatus !== null));
  const hasSubmittedPicks = myPick && myPick.selections.length > 0;

  if (!tournamentId) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <p>This golf league has no linked tournament. Please contact the league admin.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoadingTournament) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (!tournament) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <p>Tournament not found. The linked tournament may have been deleted.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tabs: { id: GolfTab; label: string; icon: React.ReactNode; hidden?: boolean }[] = [
    { id: "picks", label: isLocked ? "My Picks" : "Make Picks", icon: <Flag className="h-4 w-4" /> },
    { id: "leaderboard", label: "Leaderboard", icon: <Trophy className="h-4 w-4" />, hidden: !isLocked },
    { id: "admin", label: "Golf Admin", icon: <Star className="h-4 w-4" />, hidden: !isSuperUser },
  ].filter(t => !t.hidden);

  return (
    <div className="space-y-6">
      {/* Tournament Header */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flag className="h-5 w-5 text-green-600" />
              <h2 className="text-2xl font-bold text-gray-900">{tournament.name}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mt-1">
              {tournament.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {tournament.location}
                </span>
              )}
              {tournament.startsAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(tournament.startsAt), "MMM d, yyyy")}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Pick {picksRequired} golfers
              </span>
            </div>
            <div className="mt-2">
              {tournament.status === 'completed' ? (
                <Badge variant="default" className="bg-green-700">Tournament Completed</Badge>
              ) : tournament.status === 'active' ? (
                <Badge variant="default" className="bg-blue-600">In Progress</Badge>
              ) : (
                <Badge variant="secondary">Upcoming</Badge>
              )}
            </div>
          </div>

          {/* Countdown / Lock status */}
          <div className={`rounded-lg px-5 py-4 shadow-sm flex items-center border ${
            isLocked
              ? "bg-red-50 border-red-200"
              : "bg-gradient-to-r from-green-100 to-emerald-100 border-green-200"
          }`}>
            {isLocked ? (
              <Lock className="h-6 w-6 text-red-500 mr-3" />
            ) : (
              <Clock className="h-6 w-6 text-green-600 mr-3" />
            )}
            <div>
              <div className="text-sm font-medium text-gray-700">
                {isLocked ? "Picks locked" : "Picks close:"}
              </div>
              {isLocked ? (
                <div className="font-bold text-red-600 text-lg">
                  {format(new Date(tournament.picksLockAt), "MMM d @ h:mm a")}
                </div>
              ) : (
                <div className="font-bold text-green-800 text-lg">
                  {days}d {hours}h {minutes}m
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg shadow border border-gray-200 overflow-visible">
        <div className="hidden sm:block border-b border-gray-200">
          <nav className="-mb-px flex">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? "bg-white border-primary text-primary"
                    : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
                } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
              >
                <span className={`mr-2 ${activeTab === tab.id ? "text-primary" : "text-gray-500"}`}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        {/* Mobile tab selector */}
        <div className="sm:hidden px-4 py-3">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id ? "bg-primary text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Picks Tab */}
      {activeTab === "picks" && (
        <PicksPanel
          field={filteredField}
          allField={field}
          isLocked={isLocked}
          isAuthenticated={isAuthenticated}
          picksRequired={picksRequired}
          selectedPlayerIds={selectedPlayerIds}
          myPick={myPick}
          isLoadingField={isLoadingField}
          isLoadingPick={isLoadingPick}
          search={search}
          setSearch={setSearch}
          sortBy={sortBy}
          setSortBy={setSortBy}
          onToggle={togglePlayer}
          onSubmit={handleSubmit}
          isSubmitting={submitPicksMutation.isPending}
        />
      )}

      {/* Leaderboard Tab */}
      {activeTab === "leaderboard" && isLocked && (
        <LeaderboardPanel
          leaderboard={leaderboard}
          isLoading={isLoadingLeaderboard}
          hasResults={hasResults}
          currentUserId={user?.id}
        />
      )}

      {/* Golf Admin Tab */}
      {activeTab === "admin" && isSuperUser && (
        <GolfAdminPanel
          tournamentId={tournamentId!}
          tournament={tournament}
          field={field}
          onFieldUpdated={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/golf/tournaments/${tournamentId}/field`] });
          }}
          onResultsUpdated={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/golf/leagues/${leagueId}/leaderboard`] });
          }}
          onTournamentUpdated={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/golf/tournaments/${tournamentId}`] });
          }}
        />
      )}
    </div>
  );
}

// ─── Picks Panel ─────────────────────────────────────────────────────────────

interface PicksPanelProps {
  field: GolfFieldEntry[];
  allField: GolfFieldEntry[];
  isLocked: boolean;
  isAuthenticated: boolean;
  picksRequired: number;
  selectedPlayerIds: Set<number>;
  myPick: GolfPickSession | null | undefined;
  isLoadingField: boolean;
  isLoadingPick: boolean;
  search: string;
  setSearch: (s: string) => void;
  sortBy: "owgr" | "name";
  setSortBy: (s: "owgr" | "name") => void;
  onToggle: (id: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function PicksPanel({
  field, allField, isLocked, isAuthenticated, picksRequired,
  selectedPlayerIds, myPick, isLoadingField, isLoadingPick,
  search, setSearch, sortBy, setSortBy,
  onToggle, onSubmit, isSubmitting,
}: PicksPanelProps) {
  const hasSubmitted = myPick && myPick.selections.length > 0;

  if (isLoadingField) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (allField.length === 0) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6 text-center">
          <Flag className="h-10 w-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-amber-800">Field not yet published</h3>
          <p className="text-amber-700 mt-1">The tournament field and player rankings haven't been published yet. Check back soon.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status bar */}
      {!isAuthenticated ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          Please <a href="/api/login" className="font-bold underline">log in</a> to make your picks.
        </div>
      ) : isLocked && !hasSubmitted ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">The picks deadline has passed and you did not submit picks for this tournament.</p>
        </div>
      ) : isLocked && hasSubmitted ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Lock className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-amber-800 font-medium text-sm">Your picks are locked in</p>
            <p className="text-amber-700 text-xs mt-0.5">Results will appear here once the tournament concludes.</p>
          </div>
        </div>
      ) : !isLocked && hasSubmitted ? (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800 text-sm font-medium">
            Picks submitted! You can change them until the deadline.
          </p>
        </div>
      ) : null}

      {/* Selected picks summary */}
      {!isLocked && selectedPlayerIds.size > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Your picks ({selectedPlayerIds.size}/{picksRequired})
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedPlayerIds).map(pid => {
              const p = allField.find(f => f.playerId === pid);
              if (!p) return null;
              return (
                <span key={pid} className="inline-flex items-center gap-1 bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-medium">
                  {p.name}
                  <span className="text-green-600 text-xs">({p.pointValue} pts)</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Field list */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search golfers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={sortBy === "owgr" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("owgr")}
            >
              By Ranking
            </Button>
            <Button
              variant={sortBy === "name" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("name")}
            >
              By Name
            </Button>
          </div>
        </div>

        <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
          {field.length === 0 ? (
            <p className="text-center text-gray-500 py-8 text-sm">No golfers match your search.</p>
          ) : (
            field.map(player => {
              const isSelected = selectedPlayerIds.has(player.playerId);
              const canSelect = !isLocked && isAuthenticated && (isSelected || selectedPlayerIds.size < picksRequired);

              return (
                <button
                  key={player.playerId}
                  onClick={() => canSelect && onToggle(player.playerId)}
                  disabled={(!canSelect && !isSelected) || isLocked}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left
                    ${isSelected
                      ? "bg-green-50 hover:bg-green-100"
                      : canSelect
                        ? "hover:bg-gray-50"
                        : "opacity-50"
                    }
                    ${(!canSelect && !isSelected) || isLocked ? "cursor-default" : "cursor-pointer"}
                  `}
                >
                  {/* Rank / Selection indicator */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                    isSelected ? "bg-green-600 border-green-600 text-white" : "border-gray-200 text-gray-500"
                  }`}>
                    {isSelected ? <CheckCircle2 className="h-4 w-4" /> : (player.owgrAtLock ?? "—")}
                  </div>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{player.name}</span>
                      {player.isAmateur && (
                        <Badge variant="secondary" className="text-xs">Amateur</Badge>
                      )}
                    </div>
                    {player.country && (
                      <p className="text-xs text-gray-500">{player.country}</p>
                    )}
                  </div>

                  {/* Points */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-bold text-gray-900">{player.pointValue} pts</div>
                    {player.owgrAtLock === null && (
                      <div className="text-xs text-gray-400">No OWGR</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Submit button */}
      {!isLocked && isAuthenticated && (
        <div className="flex justify-end">
          <Button
            onClick={onSubmit}
            disabled={selectedPlayerIds.size !== picksRequired || isSubmitting}
            size="lg"
            className="min-w-[160px]"
          >
            {isSubmitting ? "Saving..." : hasSubmitted ? "Update Picks" : `Lock In ${picksRequired} Picks`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard Panel ───────────────────────────────────────────────────────

interface LeaderboardPanelProps {
  leaderboard: GolfLeaderboardEntry[];
  isLoading: boolean;
  hasResults: boolean;
  currentUserId?: string;
}

function LeaderboardPanel({ leaderboard, isLoading, hasResults, currentUserId }: LeaderboardPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-gray-500">
          No picks have been submitted yet for this tournament.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!hasResults && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-amber-800 font-medium text-sm">Results Pending</p>
            <p className="text-amber-700 text-xs mt-0.5">Picks are locked in. Scores will appear once the tournament results are entered.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Standings
          </h3>
        </div>

        <div className="divide-y divide-gray-100">
          {leaderboard.map(entry => {
            const isCurrentUser = entry.userId === currentUserId;
            const isExpanded = expanded === entry.userId;

            return (
              <div key={entry.userId} className={isCurrentUser ? "bg-blue-50/50" : ""}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : entry.userId)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  {/* Rank */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${entry.rank === 1 ? "bg-yellow-400 text-yellow-900"
                      : entry.rank === 2 ? "bg-gray-300 text-gray-700"
                        : entry.rank === 3 ? "bg-amber-600 text-white"
                          : "bg-gray-100 text-gray-600"}`}>
                    {entry.rank}
                  </div>

                  {/* Avatar + name */}
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={entry.profileImageUrl || ""} />
                    <AvatarFallback className="text-xs">
                      {(entry.nickname || entry.username || "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {entry.nickname || entry.username}
                      </span>
                      {isCurrentUser && <Badge variant="secondary" className="text-xs">You</Badge>}
                    </div>
                    {hasResults && entry.tiebreakerOwgr !== null && (
                      <p className="text-xs text-gray-400">Tiebreaker: {entry.tiebreakerOwgr} OWGR</p>
                    )}
                  </div>

                  {/* Points */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">{entry.totalPoints}</span>
                    <span className="text-xs text-gray-500">pts</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded picks breakdown */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <div className="ml-11 space-y-2">
                      {entry.picks.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No picks submitted</p>
                      ) : (
                        entry.picks.map(pick => (
                          <div key={pick.playerId}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                              pick.topTen ? "bg-green-100" : pick.resultStatus ? "bg-gray-50" : "bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {pick.topTen && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />}
                              <span className={pick.topTen ? "font-medium text-green-800" : "text-gray-700"}>
                                {pick.playerName}
                              </span>
                              {pick.owgrAtLock === null && (
                                <Badge variant="secondary" className="text-xs">Amateur</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-right flex-shrink-0">
                              {pick.resultStatus ? (
                                <>
                                  {pick.resultStatus === 'finished' && pick.finalPosition && (
                                    <span className="text-gray-500 text-xs">T{pick.finalPosition}</span>
                                  )}
                                  {pick.resultStatus !== 'finished' && (
                                    <span className="text-gray-400 text-xs uppercase">{pick.resultStatus}</span>
                                  )}
                                  <span className={`font-bold ${pick.topTen ? "text-green-700" : "text-gray-400"}`}>
                                    {pick.pointsEarned > 0 ? `+${pick.pointsEarned}` : "0"} pts
                                  </span>
                                </>
                              ) : (
                                <span className="text-gray-400 text-xs">{pick.pointValue} pts possible</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Golf Admin Panel ────────────────────────────────────────────────────────

interface GolfAdminPanelProps {
  tournamentId: number;
  tournament: GolfTournament;
  field: GolfFieldEntry[];
  onFieldUpdated: () => void;
  onResultsUpdated: () => void;
  onTournamentUpdated: () => void;
}

function GolfAdminPanel({ tournamentId, tournament, field, onFieldUpdated, onResultsUpdated, onTournamentUpdated }: GolfAdminPanelProps) {
  const { toast } = useToast();
  const [adminTab, setAdminTab] = useState<"field" | "results" | "settings">("field");

  // Field entry state
  const [bulkInput, setBulkInput] = useState("");
  const [isAddingField, setIsAddingField] = useState(false);

  // Results entry state
  const [resultInputs, setResultInputs] = useState<Record<number, { position: string; status: string }>>({});
  const [isSavingResults, setIsSavingResults] = useState(false);

  // Settings state
  const [picksRequired, setPicksRequired] = useState(tournament.picksRequired.toString());
  const [status, setStatus] = useState(tournament.status);
  const [picksLockAt, setPicksLockAt] = useState(
    format(new Date(tournament.picksLockAt), "yyyy-MM-dd'T'HH:mm")
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const handleBulkAddField = async () => {
    const lines = bulkInput.trim().split("\n").filter(l => l.trim());
    if (lines.length === 0) return;

    const players: any[] = [];
    for (const line of lines) {
      const parts = line.split(",").map(s => s.trim());
      if (!parts[0]) continue;
      players.push({
        name: parts[0],
        country: parts[1] || null,
        owgrAtLock: parts[2] && parts[2].toLowerCase() !== 'amateur' && parts[2] !== '' ? parts[2] : null,
        isAmateur: parts[2]?.toLowerCase() === 'amateur' || !parts[2],
      });
    }

    if (players.length === 0) return;
    setIsAddingField(true);
    try {
      await apiRequest("POST", `/api/golf/tournaments/${tournamentId}/field`, { players });
      toast({ title: "Field updated", description: `${players.length} player(s) added/updated` });
      setBulkInput("");
      onFieldUpdated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsAddingField(false);
  };

  const handleSaveResults = async () => {
    const results = field.map(p => {
      const input = resultInputs[p.playerId] || {};
      const status = input.status || 'finished';
      const position = input.position ? parseInt(input.position) : null;
      return { playerId: p.playerId, finalPosition: position, status };
    }).filter(r => r.status !== 'finished' || r.finalPosition !== null);

    if (results.length === 0) {
      toast({ title: "No results entered", variant: "destructive" });
      return;
    }
    setIsSavingResults(true);
    try {
      await apiRequest("POST", `/api/golf/tournaments/${tournamentId}/results`, { results });
      toast({ title: "Results saved", description: `${results.length} results updated` });
      onResultsUpdated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsSavingResults(false);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await apiRequest("PATCH", `/api/golf/tournaments/${tournamentId}`, {
        picksRequired: parseInt(picksRequired),
        status,
        picksLockAt: new Date(picksLockAt).toISOString(),
      });
      toast({ title: "Settings saved" });
      onTournamentUpdated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsSavingSettings(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Star className="h-5 w-5 text-yellow-500" />
          Golf Admin — {tournament.name}
        </CardTitle>
        <div className="flex gap-2 mt-2">
          {(["field", "results", "settings"] as const).map(t => (
            <Button
              key={t}
              variant={adminTab === t ? "default" : "outline"}
              size="sm"
              onClick={() => setAdminTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Field management */}
        {adminTab === "field" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Bulk add players</p>
              <p className="text-xs text-gray-500 mb-2">
                One player per line: <code>Name, Country, OWGR</code> — leave OWGR blank or write "Amateur" for no-OWGR players (200 pts)
              </p>
              <textarea
                className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono h-36 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={"Scottie Scheffler, USA, 1\nRory McIlroy, IRL, 2\nLocal Amateur, USA, Amateur"}
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
              />
              <Button onClick={handleBulkAddField} disabled={isAddingField || !bulkInput.trim()} className="mt-2">
                {isAddingField ? "Adding..." : "Add to Field"}
              </Button>
            </div>

            {field.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Current field ({field.length} players)</p>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
                  {field.map(p => (
                    <div key={p.playerId} className="flex justify-between items-center px-3 py-2 text-sm">
                      <span className="font-medium">{p.name}</span>
                      <div className="flex items-center gap-2 text-gray-500">
                        {p.country && <span>{p.country}</span>}
                        <span className="font-mono">{p.owgrAtLock !== null ? `OWGR #${p.owgrAtLock}` : "Amateur (200 pts)"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results entry */}
        {adminTab === "results" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Enter each golfer's finishing position, or mark as MC / WD / DQ. Players not entered default to no result.
            </p>
            {field.length === 0 ? (
              <p className="text-gray-500 text-sm">No players in field yet.</p>
            ) : (
              <>
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
                  {field.map(p => {
                    const input = resultInputs[p.playerId] || { position: "", status: "finished" };
                    return (
                      <div key={p.playerId} className="flex items-center gap-3 px-3 py-2">
                        <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
                        <select
                          value={input.status}
                          onChange={e => setResultInputs(prev => ({
                            ...prev,
                            [p.playerId]: { ...input, status: e.target.value, position: e.target.value !== 'finished' ? "" : input.position }
                          }))}
                          className="border border-gray-200 rounded px-2 py-1 text-sm"
                        >
                          <option value="finished">Finished</option>
                          <option value="mc">MC</option>
                          <option value="wd">WD</option>
                          <option value="dq">DQ</option>
                        </select>
                        {input.status === 'finished' && (
                          <Input
                            type="number"
                            min={1}
                            placeholder="Pos"
                            value={input.position}
                            onChange={e => setResultInputs(prev => ({
                              ...prev,
                              [p.playerId]: { ...input, position: e.target.value }
                            }))}
                            className="w-16 h-8 text-sm"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <Button onClick={handleSaveResults} disabled={isSavingResults}>
                  {isSavingResults ? "Saving..." : "Save Results"}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Settings */}
        {adminTab === "settings" && (
          <div className="space-y-4 max-w-sm">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Picks Required</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={picksRequired}
                onChange={e => setPicksRequired(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">How many golfers each user must pick</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Picks Lock At</label>
              <Input
                type="datetime-local"
                value={picksLockAt}
                onChange={e => setPicksLockAt(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Tournament Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="upcoming">Upcoming</option>
                <option value="active">Active (In Progress)</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
              {isSavingSettings ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
