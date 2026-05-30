import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCountdown } from "@/hooks/useCountdown";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GolfTournament, GolfFieldEntry, GolfPickSession, GolfLeaderboardEntry, GolfResult, League } from "@/lib/types";
import { format, formatDistanceToNow } from "date-fns";

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
  MapPin,
  Calendar,
  Users,
  Star,
  Copy,
  UserCheck,
  UserX,
  ShieldCheck,
  Radio,
  RefreshCw,
  Activity,
} from "lucide-react";

interface GolfLeagueViewProps {
  leagueId: number;
  league: League;
  isSuperUser: boolean;
  isAdmin?: boolean;
}

type GolfTab = "picks" | "leaderboard" | "admin";

export default function GolfLeagueView({ leagueId, league, isSuperUser, isAdmin = false }: GolfLeagueViewProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<GolfTab>("picks");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"owgr" | "name" | "odds">("odds");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
  const [hasLoadedPicks, setHasLoadedPicks] = useState(false);

  const tournamentId = league.golfTournamentId;

  // Fetch tournament info — auto-refresh every 5 min when active so lastPollAt stays current
  const { data: tournament, isLoading: isLoadingTournament } = useQuery<GolfTournament>({
    queryKey: [`/api/golf/tournaments/${tournamentId}`],
    enabled: !!tournamentId,
    refetchInterval: (query) =>
      query.state.data?.status === "active" ? 5 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
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

  // Countdown — must be declared before queries that depend on isLocked
  const lockDate = useMemo(() => tournament?.picksLockAt ? new Date(tournament.picksLockAt) : null, [tournament?.picksLockAt]);
  const { days, hours, minutes, isExpired: isLocked } = useCountdown(lockDate);

  // Fetch leaderboard — auto-refresh every 2 min when the tournament is live
  const isLiveTournament = tournament?.status === "active";
  const { data: leaderboard = [], isLoading: isLoadingLeaderboard } = useQuery<GolfLeaderboardEntry[]>({
    queryKey: [`/api/golf/leagues/${leagueId}/leaderboard`],
    enabled: activeTab === "leaderboard",
    refetchInterval: isLiveTournament ? 2 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });

  // Fetch tournament results for the tournament leaderboard view on the picks tab
  // Only fetch once picks are locked; auto-refresh every 2 min when live
  const { data: tournamentResults = [], isLoading: isLoadingResults } = useQuery<GolfResult[]>({
    queryKey: [`/api/golf/tournaments/${tournamentId}/results`],
    enabled: !!tournamentId && isLocked,
    refetchInterval: isLiveTournament ? 2 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });

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
    } else if (sortBy === "odds") {
      // Sort by odds ascending (lowest point value = favorites = first), nulls last
      list.sort((a, b) => {
        if (a.odds === null && b.odds === null) return a.name.localeCompare(b.name);
        if (a.odds === null) return 1;
        if (b.odds === null) return -1;
        return a.odds - b.odds;
      });
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

  const canSeeAdmin = isSuperUser || isAdmin;

  const tabs = ([
    { id: "picks" as GolfTab, label: isLocked ? "My Picks" : "Make Picks", icon: <Flag className="h-4 w-4" /> },
    { id: "leaderboard" as GolfTab, label: "Leaderboard", icon: <Trophy className="h-4 w-4" />, hidden: !isLocked },
    { id: "admin" as GolfTab, label: "Admin", icon: <ShieldCheck className="h-4 w-4" />, hidden: !canSeeAdmin },
  ] as { id: GolfTab; label: string; icon: React.ReactNode; hidden?: boolean }[]).filter(t => !t.hidden);

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
          tournamentResults={tournamentResults}
          isLoadingResults={isLoadingResults}
          isLiveTournament={isLiveTournament}
          tournament={tournament}
        />
      )}

      {/* Leaderboard Tab */}
      {activeTab === "leaderboard" && isLocked && (
        <LeaderboardPanel
          leaderboard={leaderboard}
          isLoading={isLoadingLeaderboard}
          hasResults={hasResults}
          currentUserId={user?.id}
          tournament={tournament}
        />
      )}

      {/* Golf Admin Tab */}
      {activeTab === "admin" && canSeeAdmin && (
        <GolfAdminPanel
          leagueId={leagueId}
          league={league}
          tournamentId={tournamentId!}
          tournament={tournament}
          field={field}
          isSuperUser={isSuperUser}
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
  sortBy: "owgr" | "name" | "odds";
  setSortBy: (s: "owgr" | "name" | "odds") => void;
  onToggle: (id: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  tournamentResults: GolfResult[];
  isLoadingResults: boolean;
  isLiveTournament: boolean;
  tournament?: GolfTournament;
}

function formatOdds(odds: number | null): string {
  if (odds === null) return "—";
  return odds >= 0 ? `+${odds}` : `${odds}`;
}

function GolferRow({
  player, isSelected, canSelect, isLocked, onToggle,
}: {
  player: GolfFieldEntry;
  isSelected: boolean;
  canSelect: boolean;
  isLocked: boolean;
  onToggle: (id: number) => void;
}) {
  const clickable = (canSelect || isSelected) && !isLocked;

  return (
    <tr className={`border-b border-gray-100 last:border-0 transition-colors ${isSelected ? "bg-green-50" : canSelect ? "hover:bg-gray-50" : "opacity-60"}`}>
      {/* Avatar */}
      <td className="pl-4 pr-2 py-3 w-12">
        <div className={`relative w-10 h-10 rounded-full overflow-hidden mx-auto ${isSelected ? "bg-green-100" : "bg-gray-100"}`}>
          {player.photoUrl ? (
            <img
              src={player.photoUrl}
              alt={player.name}
              className="w-full h-full object-cover object-top"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-sm font-bold text-gray-400">
                {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </span>
            </div>
          )}
          {isSelected && (
            <div className="absolute inset-0 bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-green-600 drop-shadow" />
            </div>
          )}
        </div>
      </td>

      {/* Name + Country */}
      <td className="px-2 py-3">
        <p className={`font-semibold text-sm leading-tight ${isSelected ? "text-green-900" : "text-gray-900"}`}>
          {player.name}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {player.country || "—"}
          {player.isAmateur && <span className="ml-1 text-amber-600 font-medium">(Am)</span>}
        </p>
      </td>

      {/* OWGR — hidden on mobile to prevent horizontal scroll */}
      <td className="hidden sm:table-cell px-2 py-3 text-center w-20">
        {player.owgrAtLock !== null ? (
          <span className={`text-sm font-bold ${isSelected ? "text-green-800" : "text-gray-700"}`}>
            #{player.owgrAtLock}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      {/* Pts */}
      <td className="px-2 py-3 text-center w-20">
        <span className={`text-sm font-bold ${player.pointValue > 0 ? (isSelected ? "text-green-800" : "text-gray-700") : "text-gray-400"}`}>
          {player.pointValue > 0 ? player.pointValue : "0"}
        </span>
      </td>

      {/* Select / deselect */}
      <td className="pl-2 pr-4 py-3 text-center w-24">
        {!isLocked ? (
          <button
            onClick={() => clickable && onToggle(player.playerId)}
            disabled={!clickable}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors w-full
              ${isSelected
                ? "bg-green-500 text-white hover:bg-green-600"
                : canSelect
                  ? "bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-800 cursor-pointer"
                  : "bg-gray-50 text-gray-300 cursor-not-allowed"
              }
            `}
          >
            {isSelected ? "✓ Remove" : "Select"}
          </button>
        ) : isSelected ? (
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700">
            ✓ Picked
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function SelectedPicksTray({
  picksRequired,
  selectedPlayerIds,
  allField,
  onToggle,
  onSubmit,
  isSubmitting,
  hasSubmitted,
  readOnly = false,
  leaderboardPicks,
  isLive = false,
}: {
  picksRequired: number;
  selectedPlayerIds: Set<number>;
  allField: GolfFieldEntry[];
  onToggle: (id: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  hasSubmitted: boolean;
  readOnly?: boolean;
  leaderboardPicks?: GolfLeaderboardEntry["picks"];
  isLive?: boolean;
}) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const selectedPlayers = Array.from(selectedPlayerIds)
    .map(id => allField.find(p => p.playerId === id))
    .filter(Boolean) as GolfFieldEntry[];

  const slots = Array.from({ length: picksRequired }, (_, i) => selectedPlayers[i] ?? null);
  const allPicked = selectedPlayerIds.size === picksRequired;

  return (
    <div className="mb-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        My Picks ({selectedPlayerIds.size}/{picksRequired})
      </p>
      <div
        className="grid gap-2 grid-cols-2"
        style={isMobile ? undefined : { gridTemplateColumns: `repeat(${picksRequired}, minmax(0, 1fr))` }}
      >
        {/* When locked with results, use the same card design as the leaderboard */}
        {readOnly && leaderboardPicks && leaderboardPicks.length > 0
          ? leaderboardPicks.map(pick => (
              <GolferPickCard key={pick.playerId} pick={pick} isLive={isLive} />
            ))
          : slots.map((player, i) =>
          player ? (
            <div
              key={player.playerId}
              className="relative bg-white border border-green-300 rounded-xl p-2 flex flex-col items-center gap-1 shadow-sm"
            >
              {/* × button — hidden in read-only mode */}
              {!readOnly && (
                <button
                  onClick={() => onToggle(player.playerId)}
                  className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors text-xs font-bold leading-none"
                  aria-label={`Remove ${player.name}`}
                >
                  ×
                </button>
              )}

              {/* Photo */}
              <div className="w-10 h-10 rounded-full overflow-hidden bg-green-100 flex-shrink-0">
                {player.photoUrl ? (
                  <img
                    src={player.photoUrl}
                    alt={player.name}
                    className="w-full h-full object-cover object-top"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-xs font-bold text-green-600">
                      {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Name */}
              <p className="text-xs font-semibold text-gray-800 text-center leading-tight line-clamp-2 w-full px-0.5">
                {player.name}
              </p>

              {/* Points */}
              {player.pointValue > 0 && (
                <span className="text-xs font-bold text-green-700 bg-green-50 rounded px-1.5 py-0.5">
                  {player.pointValue}
                </span>
              )}
            </div>
          ) : (
            <div
              key={`empty-${i}`}
              className="border-2 border-dashed border-gray-200 rounded-xl p-2 flex flex-col items-center justify-center gap-1 min-h-[100px]"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-gray-300">{i + 1}</span>
              </div>
              <p className="text-xs text-gray-300 font-medium">Empty</p>
            </div>
          )
        )}
      </div>

      {/* Submit button in tray — hidden in read-only mode */}
      {!readOnly && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {allPicked
              ? "Ready to save your picks"
              : `${picksRequired - selectedPlayerIds.size} more pick${picksRequired - selectedPlayerIds.size === 1 ? "" : "s"} needed`}
          </p>
          <Button
            onClick={onSubmit}
            disabled={!allPicked || isSubmitting}
            size="sm"
            className="flex-shrink-0"
          >
            {isSubmitting ? "Saving…" : hasSubmitted ? "Update Picks" : `Submit Picks`}
          </Button>
        </div>
      )}
    </div>
  );
}

function PicksPanel({
  field, allField, isLocked, isAuthenticated, picksRequired,
  selectedPlayerIds, myPick, isLoadingField, isLoadingPick,
  search, setSearch, sortBy, setSortBy,
  onToggle, onSubmit, isSubmitting,
  tournamentResults, isLoadingResults, isLiveTournament, tournament,
}: PicksPanelProps) {
  const hasSubmitted = myPick && myPick.selections.length > 0;
  const myPickIds = new Set((myPick?.selections ?? []).map(s => s.playerId));
  const hasResults = tournamentResults.length > 0;

  // When locked and there are results (or tournament is live), show the tournament leaderboard
  if (isLocked && (hasResults || isLiveTournament)) {
    return (
      <div className="space-y-4">
        {/* My Picks tray — always visible once locked */}
        {isAuthenticated && hasSubmitted && (
          <SelectedPicksTray
            picksRequired={picksRequired}
            selectedPlayerIds={myPickIds}
            allField={allField}
            onToggle={() => {}}
            onSubmit={() => {}}
            isSubmitting={false}
            hasSubmitted={true}
            readOnly
            isLive={isLiveTournament}
            leaderboardPicks={(() => {
              if (!tournamentResults.length) return undefined;
              return Array.from(myPickIds).map(playerId => {
                const fieldEntry = allField.find(f => f.playerId === playerId);
                const result = tournamentResults.find(r => r.playerId === playerId);
                const pointValue = fieldEntry?.pointValue ?? 0;
                const topTen = result?.topTen ?? false;
                return {
                  playerId,
                  playerName: fieldEntry?.name ?? "",
                  photoUrl: fieldEntry?.photoUrl ?? null,
                  owgrAtLock: fieldEntry?.owgrAtLock ?? null,
                  pointValue,
                  topTen,
                  pointsEarned: topTen ? pointValue : 0,
                  resultStatus: result?.status ?? null,
                  finalPosition: result?.finalPosition ?? null,
                  scoreToPar: result?.scoreToPar ?? null,
                };
              });
            })()}
          />
        )}
        {isAuthenticated && !hasSubmitted && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm">You did not submit picks before the deadline.</p>
          </div>
        )}
        <TournamentLeaderboard
          tournamentResults={tournamentResults}
          isLoading={isLoadingResults}
          isLiveTournament={isLiveTournament}
          myPickIds={myPickIds}
          field={allField}
          tournament={tournament}
          hasSubmittedPicks={!!hasSubmitted}
        />
      </div>
    );
  }

  if (isLoadingField) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (allField.length === 0) {
    const isUpcoming = tournament?.status === "upcoming";
    return (
      <Card className={isUpcoming ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}>
        <CardContent className="pt-6 text-center">
          <Flag className={`h-10 w-10 mx-auto mb-3 ${isUpcoming ? "text-green-500" : "text-amber-400"}`} />
          <h3 className={`text-lg font-semibold ${isUpcoming ? "text-green-800" : "text-amber-800"}`}>
            {isUpcoming ? "Picks opening soon" : "Field not yet published"}
          </h3>
          <p className={`mt-1 ${isUpcoming ? "text-green-700" : "text-amber-700"}`}>
            {isUpcoming
              ? "Field and odds are pulled on the Sunday before the tournament begins. Check back then to make your picks."
              : "The tournament field and player rankings haven't been published yet. Check back soon."}
          </p>
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
            Picks saved! You can change them anytime before the deadline.
          </p>
        </div>
      ) : null}

      {/* Selected picks tray */}
      {!isLocked && isAuthenticated && (
        <SelectedPicksTray
          picksRequired={picksRequired}
          selectedPlayerIds={selectedPlayerIds}
          allField={allField}
          onToggle={onToggle}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          hasSubmitted={!!hasSubmitted}
        />
      )}

      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search golfers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <span className="text-xs text-gray-500 self-center mr-1">Sort:</span>
          {(["owgr", "odds", "name"] as const).map(opt => (
            <Button
              key={opt}
              variant={sortBy === opt ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs px-3"
              onClick={() => setSortBy(opt)}
            >
              {opt === "owgr" ? "Ranking" : opt === "odds" ? "Odds" : "A–Z"}
            </Button>
          ))}
        </div>
      </div>

      {/* Golfer rows table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {field.length === 0 ? (
          <p className="text-center text-gray-500 py-10 text-sm">No golfers match your search.</p>
        ) : (
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="pl-4 pr-2 py-2 w-12 text-left" />
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Golfer</th>
                  <th className="hidden sm:table-cell px-2 py-2 w-20 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">OWGR</th>
                  <th className="px-2 py-2 w-20 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Pts</th>
                  <th className="pl-2 pr-4 py-2 w-24 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Pick</th>
                </tr>
              </thead>
              <tbody>
                {field.map(player => {
                  const isSelected = selectedPlayerIds.has(player.playerId);
                  const canSelect = !isLocked && isAuthenticated && (isSelected || selectedPlayerIds.size < picksRequired);
                  return (
                    <GolferRow
                      key={player.playerId}
                      player={player}
                      isSelected={isSelected}
                      canSelect={canSelect}
                      isLocked={isLocked}
                      onToggle={onToggle}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submit button */}
      {!isLocked && isAuthenticated && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            {selectedPlayerIds.size === picksRequired
              ? "You're all set — submit your picks below"
              : `Select ${picksRequired - selectedPlayerIds.size} more golfer${picksRequired - selectedPlayerIds.size === 1 ? "" : "s"}`
            }
          </p>
          <Button
            onClick={onSubmit}
            disabled={selectedPlayerIds.size !== picksRequired || isSubmitting}
            size="lg"
            className="min-w-[160px]"
          >
            {isSubmitting ? "Saving..." : hasSubmitted ? "Update Picks" : `Submit ${picksRequired} Picks`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tournament Leaderboard (picks tab, tournament in progress) ──────────────

interface TournamentLeaderboardProps {
  tournamentResults: GolfResult[];
  isLoading: boolean;
  isLiveTournament: boolean;
  myPickIds: Set<number>;
  field: GolfFieldEntry[];
  tournament?: GolfTournament;
  hasSubmittedPicks: boolean;
}

function TournamentLeaderboard({
  tournamentResults,
  isLoading,
  isLiveTournament,
  myPickIds,
  field,
  tournament,
  hasSubmittedPicks,
}: TournamentLeaderboardProps) {
  // Build a photo / odds lookup from field entries
  const fieldMap = useMemo(() => {
    const m = new Map<number, GolfFieldEntry>();
    for (const f of field) m.set(f.playerId, f);
    return m;
  }, [field]);

  // Sort results: active players by position first, then DNF (mc/wd/dq)
  const sorted = useMemo(() => {
    const playing = tournamentResults
      .filter(r => r.status === "finished" && r.finalPosition !== null)
      .sort((a, b) => (a.finalPosition ?? 999) - (b.finalPosition ?? 999));
    const dnf = tournamentResults
      .filter(r => r.status !== "finished")
      .sort((a, b) => a.player.name.localeCompare(b.player.name));
    return [...playing, ...dnf];
  }, [tournamentResults]);

  const lastUpdatedText = tournament?.lastPollAt
    ? `Updated ${formatDistanceToNow(new Date(tournament.lastPollAt), { addSuffix: true })}`
    : null;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (tournamentResults.length === 0) {
    return (
      <div className="space-y-4">
        {/* Live header */}
        {isLiveTournament && (
          <div className="bg-gradient-to-r from-red-600 to-rose-500 text-white rounded-lg px-4 py-3 flex items-center justify-between shadow">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                </span>
                <span className="font-bold text-sm tracking-wider uppercase">Live</span>
              </div>
              <div className="h-4 w-px bg-white/40" />
              <span className="text-white/90 text-sm">Tournament in progress</span>
            </div>
            {lastUpdatedText && (
              <div className="flex items-center gap-1.5 text-white/80 text-xs flex-shrink-0">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{lastUpdatedText}</span>
              </div>
            )}
          </div>
        )}
        <Card>
          <CardContent className="pt-6 text-center">
            <Activity className="h-10 w-10 text-blue-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-700">Scores not yet available</h3>
            <p className="text-gray-500 mt-1 text-sm">
              {isLiveTournament
                ? "The tournament is underway. Scores will appear here once they are pulled from ESPN."
                : "No results have been entered for this tournament yet."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live header */}
      {isLiveTournament ? (
        <div className="bg-gradient-to-r from-red-600 to-rose-500 text-white rounded-lg px-4 py-3 flex items-center justify-between shadow">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
              </span>
              <span className="font-bold text-sm tracking-wider uppercase">Live</span>
            </div>
            <div className="h-4 w-px bg-white/40" />
            <div className="flex items-center gap-1.5 text-white/90 text-sm">
              <Activity className="h-4 w-4" />
              <span>Tournament leaderboard — scores update every 2 min</span>
            </div>
          </div>
          {lastUpdatedText && (
            <div className="flex items-center gap-1.5 text-white/80 text-xs flex-shrink-0 ml-4">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{lastUpdatedText}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <p className="text-gray-700 text-sm font-medium">Tournament results</p>
        </div>
      )}

      {!hasSubmittedPicks && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-amber-700 text-sm">You didn't submit picks — your golfers won't be highlighted below.</p>
        </div>
      )}

      {/* Leaderboard table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="pl-4 pr-2 py-2 w-12 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pos</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Golfer</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((result, idx) => {
                const isMyPick = myPickIds.has(result.playerId);
                const fieldEntry = fieldMap.get(result.playerId);
                const isDnf = result.status === "mc" || result.status === "wd" || result.status === "dq";
                const pos = result.finalPosition;

                // Check for tie (same position as adjacent)
                const prevPos = idx > 0 ? sorted[idx - 1].finalPosition : null;
                const nextPos = idx < sorted.length - 1 ? sorted[idx + 1].finalPosition : null;
                const isTied = pos !== null && (pos === prevPos || pos === nextPos);
                const posLabel = isDnf
                  ? result.status.toUpperCase()
                  : pos !== null
                    ? isTied ? `T${pos}` : `${pos}`
                    : "—";

                return (
                  <tr
                    key={result.playerId}
                    className={`border-b border-gray-100 last:border-0 transition-colors ${
                      isMyPick
                        ? isDnf
                          ? "bg-red-50"
                          : result.topTen
                            ? "bg-green-50"
                            : "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {/* Position */}
                    <td className="pl-4 pr-2 py-3 w-14">
                      <span className={`text-sm font-bold ${
                        isDnf ? "text-gray-400" : pos === 1 ? "text-yellow-600" : "text-gray-700"
                      }`}>
                        {posLabel}
                      </span>
                    </td>

                    {/* Golfer info */}
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        {/* Photo */}
                        <div className={`flex-shrink-0 w-9 h-9 rounded-full overflow-hidden ${
                          isMyPick && !isDnf ? (result.topTen ? "bg-green-100 ring-2 ring-green-400" : "bg-blue-100 ring-2 ring-blue-400") : "bg-gray-100"
                        }`}>
                          {fieldEntry?.photoUrl ? (
                            <img
                              src={fieldEntry.photoUrl}
                              alt={result.player.name}
                              className="w-full h-full object-cover object-top"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-xs font-bold text-gray-400">
                                {result.player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                              </span>
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-semibold leading-tight ${
                              isMyPick ? (result.topTen ? "text-green-900" : isDnf ? "text-red-800" : "text-blue-900") : "text-gray-900"
                            }`}>
                              {result.player.name}
                            </span>
                            {isMyPick && (
                              <Badge
                                variant="outline"
                                className={`text-xs py-0 px-1.5 ${
                                  result.topTen
                                    ? "border-green-400 text-green-700 bg-green-50"
                                    : isDnf
                                      ? "border-red-300 text-red-600 bg-red-50"
                                      : "border-blue-400 text-blue-700 bg-blue-50"
                                }`}
                              >
                                ✓ Your Pick
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {result.player.country ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Status / Score */}
                    <td className="px-3 py-3 text-right">
                      {isDnf ? (
                        <span className="text-xs font-semibold text-gray-400 uppercase">
                          {result.status}
                        </span>
                      ) : result.scoreToPar !== null && result.scoreToPar !== undefined ? (
                        <span className={`text-sm font-semibold ${
                          result.scoreToPar < 0
                            ? "text-green-600"
                            : result.scoreToPar === 0
                              ? "text-gray-500"
                              : "text-red-500"
                        }`}>
                          {result.scoreToPar < 0
                            ? String(result.scoreToPar)
                            : result.scoreToPar === 0
                              ? "E"
                              : `+${result.scoreToPar}`}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Golfer Pick Card ─────────────────────────────────────────────────

interface GolferPickCardProps {
  pick: GolfLeaderboardEntry["picks"][number];
  isLive: boolean;
}

function GolferPickCard({ pick, isLive }: GolferPickCardProps) {
  const hasResult = pick.resultStatus !== null;
  const initials = pick.playerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // Card border / background
  let borderColor = "border-gray-200";
  let bgColor = "bg-white";
  if (pick.topTen) {
    borderColor = "border-green-400";
    bgColor = "bg-green-50";
  } else if (isLive && hasResult) {
    borderColor = "border-blue-300";
    bgColor = "bg-blue-50";
  }

  // Position label for upper-right corner badge
  let posLabel: string | null = null;
  let posBadgeColor = "bg-gray-200 text-gray-600";
  if (hasResult) {
    if ((pick.resultStatus === "finished" || pick.resultStatus === "in_progress") && pick.finalPosition !== null) {
      posLabel = `T${pick.finalPosition}`;
      posBadgeColor = pick.topTen
        ? "bg-green-200 text-green-800"
        : pick.resultStatus === "in_progress"
          ? "bg-blue-200 text-blue-800"
          : "bg-gray-200 text-gray-600";
    } else if (pick.resultStatus === "mc") {
      posLabel = "CUT";
      posBadgeColor = "bg-red-100 text-red-700";
    } else if (pick.resultStatus === "wd") {
      posLabel = "WD";
    } else if (pick.resultStatus === "dq") {
      posLabel = "DQ";
    }
  }

  // Points chip — green+bold if scoring, grey if not
  const chipBg   = pick.topTen ? "bg-green-200"  : "bg-gray-200";
  const chipText = pick.topTen ? "text-green-800 font-bold" : "text-gray-600 font-medium";
  const chipValue = pick.topTen
    ? pick.pointsEarned.toLocaleString()
    : pick.pointValue.toLocaleString();

  // Score-to-par display
  let scoreLabel: string | null = null;
  let scoreColor = "text-gray-500";
  if (hasResult && pick.scoreToPar !== null && pick.scoreToPar !== undefined) {
    if (pick.scoreToPar < 0) {
      scoreLabel = String(pick.scoreToPar);
      scoreColor = "text-green-600 font-semibold";
    } else if (pick.scoreToPar === 0) {
      scoreLabel = "E";
      scoreColor = "text-gray-500";
    } else {
      scoreLabel = `+${pick.scoreToPar}`;
      scoreColor = "text-red-500 font-semibold";
    }
  }

  return (
    <div className={`relative flex flex-col items-center rounded-lg border p-1.5 w-full h-28 flex-shrink-0 ${bgColor} ${borderColor}`}>
      {/* Position badge — upper-right corner */}
      {posLabel && (
        <span className={`absolute top-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded leading-none ${posBadgeColor}`}>
          {posLabel}
        </span>
      )}

      <Avatar className="h-6 w-6 flex-shrink-0">
        {pick.photoUrl ? <AvatarImage src={pick.photoUrl} alt={pick.playerName} /> : null}
        <AvatarFallback className="text-[9px] font-semibold">{initials}</AvatarFallback>
      </Avatar>

      {/* Name — always 2-line height */}
      <div className="h-7 w-full flex items-center justify-center mt-0.5">
        <p className="text-[10px] font-medium text-gray-800 text-center leading-tight line-clamp-2 w-full">
          {pick.playerName}
        </p>
      </div>

      {/* Score-to-par chip */}
      {scoreLabel !== null ? (
        <span className={`text-[10px] ${scoreColor} leading-none mb-0.5`}>
          {scoreLabel}
        </span>
      ) : (
        <span className="h-[14px] mb-0.5" />
      )}

      {/* Points chip */}
      <span className={`text-[10px] ${chipText} ${chipBg} px-1.5 py-0.5 rounded-full leading-none`}>
        {chipValue}
      </span>

    </div>
  );
}

// ─── Leaderboard Panel ───────────────────────────────────────────────────────

interface LeaderboardPanelProps {
  leaderboard: GolfLeaderboardEntry[];
  isLoading: boolean;
  hasResults: boolean;
  currentUserId?: string;
  tournament?: GolfTournament;
}

function LeaderboardPanel({ leaderboard, isLoading, hasResults, currentUserId, tournament }: LeaderboardPanelProps) {
  const isLive = tournament?.status === "active";

  const lastUpdatedText = tournament?.lastPollAt
    ? `Updated ${formatDistanceToNow(new Date(tournament.lastPollAt), { addSuffix: true })}`
    : null;

  const liveBanner = isLive && (
    <div className="bg-gradient-to-r from-red-600 to-rose-500 text-white rounded-lg px-4 py-3 flex items-center justify-between shadow">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
          <span className="font-bold text-sm tracking-wider uppercase">Live</span>
        </div>
        <div className="h-4 w-px bg-white/40" />
        <div className="flex items-center gap-1.5 text-white/90 text-sm">
          <Radio className="h-4 w-4" />
          <span>Tournament in progress — scores update every 2 min</span>
        </div>
      </div>
      {lastUpdatedText && (
        <div className="flex items-center gap-1.5 text-white/80 text-xs flex-shrink-0 ml-4">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{lastUpdatedText}</span>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {liveBanner}
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="space-y-4">
        {liveBanner}
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            No picks have been submitted yet for this tournament.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {liveBanner}

      {!hasResults && !isLive && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-amber-800 font-medium text-sm">Results Pending</p>
            <p className="text-amber-700 text-xs mt-0.5">Picks are locked in. Scores will appear once the tournament results are entered.</p>
          </div>
        </div>
      )}
      {!hasResults && isLive && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-blue-800 font-medium text-sm">Scores Loading</p>
            <p className="text-blue-700 text-xs mt-0.5">The tournament is underway. Live scores will appear here as they are pulled from ESPN.</p>
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

        {/* ── Mobile: stacked cards with 2×2 pick grid ── */}
        <div className="md:hidden divide-y divide-gray-100">
          {leaderboard.map(entry => {
            const isCurrentUser = entry.userId === currentUserId;
            const sortedPicks = [...entry.picks].sort((a, b) => a.pointValue - b.pointValue);
            const possiblePoints = entry.picks.reduce((sum, p) => sum + p.pointValue, 0);

            return (
              <div key={entry.userId} className={`p-4 ${isCurrentUser ? "bg-blue-50/60" : ""}`}>
                {/* Header row: rank + avatar + name + points */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                    ${entry.rank === 1 ? "bg-yellow-400 text-yellow-900"
                      : entry.rank === 2 ? "bg-gray-300 text-gray-700"
                        : entry.rank === 3 ? "bg-amber-600 text-white"
                          : "bg-gray-100 text-gray-600"}`}>
                    {entry.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 text-sm truncate">{entry.nickname || entry.username}</span>
                      {isCurrentUser && <Badge variant="secondary" className="text-xs py-0">You</Badge>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-xl font-bold leading-none ${entry.totalPoints > 0 ? "text-green-700" : "text-gray-400"}`}>
                      {entry.totalPoints.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{possiblePoints.toLocaleString()} possible</p>
                  </div>
                </div>

                {/* 2×2 pick grid */}
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const pick = sortedPicks[i];
                    return pick ? (
                      <GolferPickCard key={i} pick={pick} isLive={isLive} />
                    ) : (
                      <div key={i} className="h-24 rounded-lg border border-dashed border-gray-200 flex items-center justify-center">
                        <span className="text-xs text-gray-300">—</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Desktop: horizontally scrollable table ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-2 font-medium w-10">Place</th>
                <th className="text-left px-3 py-2 font-medium w-36">Pooler</th>
                <th className="text-center px-2 py-2 font-medium" colSpan={4}>Picks (favorites → longshots)</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Possible</th>
                <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaderboard.map(entry => {
                const isCurrentUser = entry.userId === currentUserId;
                const sortedPicks = [...entry.picks].sort((a, b) => a.pointValue - b.pointValue);
                const possiblePoints = entry.picks.reduce((sum, p) => sum + p.pointValue, 0);

                return (
                  <tr
                    key={entry.userId}
                    className={`align-middle ${isCurrentUser ? "bg-blue-50/60" : "hover:bg-gray-50/50"} transition-colors`}
                  >
                    {/* Rank */}
                    <td className="px-4 py-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                        ${entry.rank === 1 ? "bg-yellow-400 text-yellow-900"
                          : entry.rank === 2 ? "bg-gray-300 text-gray-700"
                            : entry.rank === 3 ? "bg-amber-600 text-white"
                              : "bg-gray-100 text-gray-600"}`}>
                        {entry.rank}
                      </div>
                    </td>

                    {/* User */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={entry.profileImageUrl || ""} />
                          <AvatarFallback className="text-xs">
                            {(entry.nickname || entry.username || "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-gray-900 text-sm truncate max-w-24">
                              {entry.nickname || entry.username}
                            </span>
                            {isCurrentUser && <Badge variant="secondary" className="text-xs py-0">You</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 4 Pick cards (sorted lowest → highest point value) */}
                    {Array.from({ length: 4 }).map((_, i) => {
                      const pick = sortedPicks[i];
                      return (
                        <td key={i} className="px-1.5 py-3 w-28">
                          {pick ? (
                            <GolferPickCard pick={pick} isLive={isLive} />
                          ) : (
                            <div className="w-full h-24 rounded-lg border border-dashed border-gray-200 flex items-center justify-center">
                              <span className="text-xs text-gray-300">—</span>
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Possible Points */}
                    <td className="px-3 py-3 text-right">
                      <p className="text-sm font-semibold text-gray-700">{possiblePoints.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">possible</p>
                    </td>

                    {/* Current Points */}
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xl font-bold ${entry.totalPoints > 0 ? "text-green-700" : "text-gray-400"}`}>
                        {entry.totalPoints.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── League Admin Section ─────────────────────────────────────────────────────

interface LeagueAdminSectionProps {
  leagueId: number;
  league: League;
}

function LeagueAdminSection({ leagueId, league }: LeagueAdminSectionProps) {
  const { toast } = useToast();
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const { data: members = [], isLoading: isLoadingMembers, refetch: refetchMembers } = useQuery<any[]>({
    queryKey: [`/api/leagues/${leagueId}/members`],
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(league.inviteCode);
      toast({ title: "Copied!", description: "Invite code copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Please copy the code manually.", variant: "destructive" });
    }
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setTogglingUserId(userId);
    try {
      const res = await fetch(`/api/admin/league/${leagueId}/member/${userId}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update member");
      }
      const result = await res.json();
      toast({ title: result.isActive ? "Member activated" : "Member deactivated", description: result.message });
      refetchMembers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTogglingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Invite Code */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">League Invite Code</p>
        <p className="text-xs text-gray-500 mb-3">
          Share this code with anyone you want to invite to your league.
        </p>
        <div className="flex items-center gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-3 flex-shrink-0">
            <span className="font-mono text-2xl font-bold tracking-widest text-primary">
              {league.inviteCode}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyCode} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy Code
          </Button>
        </div>
      </div>

      {/* Member Management */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Members</p>
        <p className="text-xs text-gray-500 mb-3">
          Activate members to allow them to make picks. Deactivate to prevent them from participating.
        </p>
        {isLoadingMembers ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-500">No members yet.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {members.map((member: any) => {
              const displayName = member.nickname || member.user?.username || member.userId;
              const isToggling = togglingUserId === member.userId;
              return (
                <div key={member.userId} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={member.user?.profileImageUrl || ""} />
                      <AvatarFallback className="text-xs">
                        {displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                      <p className="text-xs text-gray-400 truncate">{member.user?.email || ""}</p>
                    </div>
                    {member.isAdmin && (
                      <span className="flex-shrink-0 text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-2 py-0.5 font-medium">
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium ${member.isActive ? "text-green-600" : "text-gray-400"}`}>
                      {member.isActive ? "Active" : "Inactive"}
                    </span>
                    <Button
                      size="sm"
                      variant={member.isActive ? "outline" : "default"}
                      className={`gap-1 h-8 ${!member.isActive ? "bg-green-600 hover:bg-green-700 text-white border-0" : ""}`}
                      onClick={() => handleToggleActive(member.userId, member.isActive)}
                      disabled={isToggling}
                    >
                      {isToggling ? (
                        <span className="text-xs">...</span>
                      ) : member.isActive ? (
                        <><UserX className="h-3.5 w-3.5" /> Deactivate</>
                      ) : (
                        <><UserCheck className="h-3.5 w-3.5" /> Activate</>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Golf Admin Panel ────────────────────────────────────────────────────────

interface GolfAdminPanelProps {
  leagueId: number;
  league: League;
  tournamentId: number;
  tournament: GolfTournament;
  field: GolfFieldEntry[];
  isSuperUser: boolean;
  onFieldUpdated: () => void;
  onResultsUpdated: () => void;
  onTournamentUpdated: () => void;
}

function GolfAdminPanel({ leagueId, league, tournamentId, tournament, field, isSuperUser, onFieldUpdated, onResultsUpdated, onTournamentUpdated }: GolfAdminPanelProps) {
  const { toast } = useToast();
  const [adminTab, setAdminTab] = useState<"league" | "field" | "results" | "settings">("league");

  // Field entry state
  const [bulkInput, setBulkInput] = useState("");
  const [isAddingField, setIsAddingField] = useState(false);
  const [isPullingField, setIsPullingField] = useState(false);
  const [isPullingEnrichment, setIsPullingEnrichment] = useState(false);

  // Results entry state
  const [resultInputs, setResultInputs] = useState<Record<number, { position: string; status: string }>>({});
  const [isSavingResults, setIsSavingResults] = useState(false);
  const [isPullingResults, setIsPullingResults] = useState(false);

  // Settings state
  const [picksRequired, setPicksRequired] = useState(tournament.picksRequired.toString());
  const [status, setStatus] = useState(tournament.status);
  const [picksLockAt, setPicksLockAt] = useState(
    format(new Date(tournament.picksLockAt), "yyyy-MM-dd'T'HH:mm")
  );
  const [oddsApiSportKey, setOddsApiSportKey] = useState(tournament.oddsApiSportKey ?? "");
  const [espnEventId, setEspnEventId] = useState(tournament.espnEventId ?? "");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // ESPN search state
  const [espnSearchQuery, setEspnSearchQuery] = useState("");
  const [espnSearchResults, setEspnSearchResults] = useState<{ id: string; name: string; date: string }[]>([]);
  const [isEspnSearching, setIsEspnSearching] = useState(false);
  const [showEspnDropdown, setShowEspnDropdown] = useState(false);
  const espnSearchRef = useRef<HTMLDivElement>(null);
  const espnDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced ESPN search
  useEffect(() => {
    if (espnDebounceRef.current) clearTimeout(espnDebounceRef.current);
    const trimmed = espnSearchQuery.trim();
    if (!trimmed) {
      setEspnSearchResults([]);
      setShowEspnDropdown(false);
      return;
    }
    espnDebounceRef.current = setTimeout(async () => {
      setIsEspnSearching(true);
      try {
        const res = await fetch(`/api/golf/espn-search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          setEspnSearchResults([]);
          setShowEspnDropdown(true);
          return;
        }
        const data: { id: string; name: string; date: string }[] = await res.json();
        if (Array.isArray(data)) {
          setEspnSearchResults(data);
          setShowEspnDropdown(true);
        } else {
          setEspnSearchResults([]);
        }
      } catch {
        setEspnSearchResults([]);
      } finally {
        setIsEspnSearching(false);
      }
    }, 400);
    return () => { if (espnDebounceRef.current) clearTimeout(espnDebounceRef.current); };
  }, [espnSearchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (espnSearchRef.current && !espnSearchRef.current.contains(e.target as Node)) {
        setShowEspnDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePullField = async () => {
    setIsPullingField(true);
    try {
      const res = await apiRequest("POST", `/api/golf/tournaments/${tournamentId}/pull-field`, {});
      const data = await res.json();
      toast({ title: "Field pulled", description: data.message });
      onFieldUpdated();
    } catch (err: any) {
      toast({ title: "Pull failed", description: err.message, variant: "destructive" });
    }
    setIsPullingField(false);
  };

  const handlePullEnrichment = async () => {
    setIsPullingEnrichment(true);
    try {
      const res = await apiRequest("POST", `/api/golf/tournaments/${tournamentId}/pull-enrichment`, {});
      const data = await res.json();
      toast({ title: "Photos & rankings refreshed", description: data.message });
      onFieldUpdated();
    } catch (err: any) {
      toast({ title: "Enrichment failed", description: err.message, variant: "destructive" });
    }
    setIsPullingEnrichment(false);
  };

  const handlePullResults = async () => {
    setIsPullingResults(true);
    try {
      const res = await apiRequest("POST", `/api/golf/tournaments/${tournamentId}/pull-results`, {});
      const data = await res.json();
      const stateLabel = data.espnState === 'in' ? 'Live' : data.espnState === 'post' ? 'Final' : data.espnState;
      toast({ title: `Results pulled (${stateLabel})`, description: data.message });
      onResultsUpdated();
      onTournamentUpdated();
    } catch (err: any) {
      toast({ title: "Pull failed", description: err.message, variant: "destructive" });
    }
    setIsPullingResults(false);
  };

  const handleBulkAddField = async () => {
    const lines = bulkInput.trim().split("\n").filter(l => l.trim());
    if (lines.length === 0) return;

    const players: any[] = [];
    for (const line of lines) {
      const parts = line.split(",").map(s => s.trim());
      if (!parts[0]) continue;
      const owgrRaw = parts[2] || "";
      const oddsRaw = parts[3] || "";
      players.push({
        name: parts[0],
        country: parts[1] || null,
        owgrAtLock: owgrRaw && owgrRaw.toLowerCase() !== 'amateur' ? owgrRaw : null,
        isAmateur: owgrRaw.toLowerCase() === 'amateur' || !owgrRaw,
        odds: oddsRaw ? oddsRaw.replace(/\+/g, "") : null,
        photoUrl: parts[4] || null,
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
        oddsApiSportKey: oddsApiSportKey.trim() || null,
        espnEventId: espnEventId.trim() || null,
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
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          League Admin
        </CardTitle>
        <div className="flex gap-2 mt-2 flex-wrap">
          <Button
            variant={adminTab === "league" ? "default" : "outline"}
            size="sm"
            onClick={() => setAdminTab("league")}
          >
            League
          </Button>
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

        {/* League management */}
        {adminTab === "league" && (
          <LeagueAdminSection leagueId={leagueId} league={league} />
        )}

        {/* Field management */}
        {adminTab === "field" && (
          <div className="space-y-4">

            {/* API pull — super user only */}
            {isSuperUser && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-blue-900">Pull Field &amp; Odds from API</p>
                <p className="text-xs text-blue-700">
                  Fetches the full tournament field and betting odds from The Odds API. Set the <strong>Odds API Sport Key</strong> in Settings first (e.g. <code>golf_pga_championship_winner</code>).
                </p>
                <Button
                  size="sm"
                  onClick={handlePullField}
                  disabled={isPullingField || !tournament.oddsApiSportKey}
                  title={!tournament.oddsApiSportKey ? "Set Odds API Sport Key in Settings first" : ""}
                >
                  {isPullingField ? "Pulling..." : "Pull Field & Odds"}
                </Button>
                {!tournament.oddsApiSportKey && (
                  <p className="text-xs text-amber-600">⚠ No Odds API sport key configured — go to Settings to add one.</p>
                )}
              </div>
            )}

            {/* Photo + OWGR enrichment — all admins */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-purple-900">Refresh Photos &amp; Rankings</p>
              <p className="text-xs text-purple-700">
                Pulls player headshots from ESPN and world rankings (OWGR) from DataGolf. Run this after pulling the field. Requires the ESPN Event ID in Settings. OWGR also requires a <code>DATAGOLF_API_KEY</code> server secret (free at datagolf.com) — photos will still be pulled without it.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="border-purple-300 text-purple-800 hover:bg-purple-100"
                onClick={handlePullEnrichment}
                disabled={isPullingEnrichment || !tournament.espnEventId}
                title={!tournament.espnEventId ? "Set ESPN Event ID in Settings first" : ""}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isPullingEnrichment ? "animate-spin" : ""}`} />
                {isPullingEnrichment ? "Refreshing..." : "Refresh Photos & Rankings"}
              </Button>
              {!tournament.espnEventId && (
                <p className="text-xs text-amber-600">⚠ No ESPN Event ID configured — go to Settings to add one.</p>
              )}
            </div>

            {/* Bulk add — super user only */}
            {isSuperUser && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Bulk add players manually</p>
                <p className="text-xs text-gray-500 mb-2">
                  One player per line: <code>Name, Country, OWGR, Odds, PhotoURL</code> — Odds e.g. +1400; PhotoURL optional
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
            )}

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

            {/* API pull */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-blue-900">Pull Scores from ESPN</p>
              <p className="text-xs text-blue-700">
                Fetches live or final scores from ESPN. Works during and after the tournament. Set the <strong>ESPN Event ID</strong> in Settings first.
                {tournament.lastPollAt && (
                  <span className="ml-1 text-blue-600">Last updated: {new Date(tournament.lastPollAt).toLocaleString()}</span>
                )}
              </p>
              <Button
                size="sm"
                onClick={handlePullResults}
                disabled={isPullingResults || !tournament.espnEventId}
                title={!tournament.espnEventId ? "Set ESPN Event ID in Settings first" : ""}
              >
                {isPullingResults ? "Pulling..." : "Pull Scores from ESPN"}
              </Button>
              {!tournament.espnEventId && (
                <p className="text-xs text-amber-600">⚠ No ESPN Event ID configured — go to Settings to add one.</p>
              )}
            </div>

            <p className="text-sm text-gray-500">
              Or enter each golfer's finishing position manually, or mark as MC / WD / DQ.
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
                <option value="active">Active (In Progress — starts hourly score polling)</option>
                <option value="completed">Completed</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">Setting to Active triggers automatic hourly score updates from ESPN</p>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">API Integration</p>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Odds API Sport Key</label>
                  <Input
                    placeholder="golf_pga_championship_winner"
                    value={oddsApiSportKey}
                    onChange={e => setOddsApiSportKey(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    From The Odds API — used to pull field &amp; odds. Active keys: <code>golf_pga_championship_winner</code>, <code>golf_us_open_winner</code>, <code>golf_the_open_championship_winner</code>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">ESPN Event ID</label>
                  <Input
                    placeholder="401811942"
                    value={espnEventId}
                    onChange={e => setEspnEventId(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">ESPN numeric event ID — used to pull live scores and final results</p>
                  {/* ESPN search */}
                  <div className="relative mt-2" ref={espnSearchRef}>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Search ESPN by name to auto-fill ID</label>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          className="pl-8 text-sm"
                          placeholder="e.g. PGA Championship…"
                          value={espnSearchQuery}
                          onChange={e => setEspnSearchQuery(e.target.value)}
                          onFocus={() => { if (espnSearchResults.length > 0) setShowEspnDropdown(true); }}
                        />
                      </div>
                      {isEspnSearching && (
                        <span className="text-xs text-gray-400 whitespace-nowrap">Searching…</span>
                      )}
                    </div>
                    {showEspnDropdown && espnSearchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                        {espnSearchResults.map(evt => (
                          <button
                            key={evt.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2 text-sm"
                            onClick={() => {
                              setEspnEventId(evt.id);
                              setEspnSearchQuery("");
                              setShowEspnDropdown(false);
                              setEspnSearchResults([]);
                            }}
                          >
                            <span className="font-medium truncate">{evt.name}</span>
                            <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                              {evt.date ? new Date(evt.date).toLocaleDateString() : ''} · ID: {evt.id}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {showEspnDropdown && espnSearchResults.length === 0 && !isEspnSearching && espnSearchQuery.trim() && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-sm text-gray-500">
                        No matching ESPN events found
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
