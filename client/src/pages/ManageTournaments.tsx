import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Helmet } from "react-helmet";
import {
  Loader2, Search, CheckCircle, AlertTriangle, Trophy, Calendar,
  Users, Pencil, X, ChevronDown, ChevronUp
} from "lucide-react";

type EspnEvent = { id: string; name: string; date: string };
type OddsSport = { key: string; title: string };
type GolfTournament = {
  id: number;
  name: string;
  status: string;
  season: number;
  startsAt: string | null;
  picksLockAt: string;
  oddsApiSportKey: string | null;
  espnEventId: string | null;
  picksRequired: number;
  location: string | null;
};

const NONE_SENTINEL = "__none__";

function fuzzyMatchSport(eventName: string, sports: OddsSport[]): { sport: OddsSport | null; score: number } {
  if (!sports.length) return { sport: null, score: 0 };
  const STOP_WORDS = new Set(["golf", "winner", "the", "championship", "tournament", "open", "pga", "lpga", "masters", "-"]);
  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t && !STOP_WORDS.has(t));

  const eventTokens = tokenize(eventName);
  if (eventTokens.length === 0) return { sport: sports[0], score: 0 };

  let best: OddsSport | null = null;
  let bestScore = -1;

  for (const sport of sports) {
    const sportTokens = tokenize(sport.title);
    const sportTokenSet = new Set(sportTokens);
    const intersection = eventTokens.filter(t => sportTokenSet.has(t)).length;
    const allTokens = Array.from(new Set([...eventTokens, ...sportTokens]));
    const union = allTokens.length;
    const jaccard = union > 0 ? intersection / union : 0;
    if (jaccard > bestScore) {
      bestScore = jaccard;
      best = sport;
    }
  }
  return { sport: best, score: bestScore };
}

function formatLockDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TournamentCard({
  t,
  fieldCount,
  oddsSports,
}: {
  t: GolfTournament;
  fieldCount: number;
  oddsSports: OddsSport[];
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editStatus, setEditStatus] = useState(t.status);
  const [editPicksLock, setEditPicksLock] = useState(toDatetimeLocal(t.picksLockAt));
  const [editOddsKey, setEditOddsKey] = useState(t.oddsApiSportKey ?? NONE_SENTINEL);
  const [editEspnId, setEditEspnId] = useState(t.espnEventId ?? "");

  const patchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/golf/tournaments/${t.id}`, {
        status: editStatus,
        picksLockAt: new Date(editPicksLock).toISOString(),
        oddsApiSportKey: editOddsKey === NONE_SENTINEL ? null : editOddsKey,
        espnEventId: editEspnId.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Tournament updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/golf/tournaments"] });
      setExpanded(false);
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-gray-900">{t.name}</div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={t.status === "completed" ? "secondary" : t.status === "active" ? "default" : "outline"} className="text-xs">
              {t.status}
            </Badge>
            <button
              className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
              onClick={() => setExpanded(e => !e)}
              title={expanded ? "Close edit" : "Edit tournament"}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-500 space-y-0.5">
          {t.location && <div>📍 {t.location}</div>}
          {t.startsAt && <div>🗓 Starts {new Date(t.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}
          <div>🔒 Picks lock {formatLockDate(t.picksLockAt)}</div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {t.picksRequired} picks required
            </span>
            <span className="font-medium text-gray-700">
              👥 {fieldCount > 0 ? `${fieldCount} in field` : "No field yet"}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pt-1 flex-wrap">
          {t.oddsApiSportKey ? (
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">{t.oddsApiSportKey}</span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">No Odds API key</span>
          )}
          {t.espnEventId ? (
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-mono">ESPN: {t.espnEventId}</span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">No ESPN ID</span>
          )}
        </div>
      </div>

      {/* Inline edit panel */}
      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Picks lock</Label>
              <Input type="datetime-local" value={editPicksLock} onChange={e => setEditPicksLock(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Odds API sport key</Label>
            <Select value={editOddsKey} onValueChange={setEditOddsKey}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SENTINEL}>— None —</SelectItem>
                {oddsSports.map(s => (
                  <SelectItem key={s.key} value={s.key}>
                    <span className="font-mono">{s.key}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ESPN Event ID</Label>
            <Input value={editEspnId} onChange={e => setEditEspnId(e.target.value)} placeholder="e.g. 401811950" className="h-8 text-xs font-mono" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => patchMutation.mutate()} disabled={patchMutation.isPending} className="text-xs">
              {patchMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save changes
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManageTournaments() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: superUserStatus, isLoading: isLoadingSU } = useQuery<{ isSuperUser: boolean }>({
    queryKey: ["/api/auth/super-user-status"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!isLoadingSU && superUserStatus && !superUserStatus.isSuperUser) {
      navigate("/");
    }
  }, [superUserStatus, isLoadingSU, navigate]);

  const { data: tournaments = [], isLoading: isLoadingTournaments } = useQuery<GolfTournament[]>({
    queryKey: ["/api/golf/tournaments"],
    enabled: !!superUserStatus?.isSuperUser,
  });

  const { data: fieldCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/golf/tournaments/field-counts"],
    enabled: !!superUserStatus?.isSuperUser,
  });

  const { data: oddsSports = [], isLoading: isLoadingOdds } = useQuery<OddsSport[]>({
    queryKey: ["/api/golf/odds-sports"],
    enabled: !!superUserStatus?.isSuperUser,
  });

  const [espnQuery, setEspnQuery] = useState("");
  const [espnResults, setEspnResults] = useState<EspnEvent[]>([]);
  const [isEspnSearching, setIsEspnSearching] = useState(false);
  const [showEspnDropdown, setShowEspnDropdown] = useState(false);
  const [selectedEspnEvent, setSelectedEspnEvent] = useState<EspnEvent | null>(null);
  const espnSearchRef = useRef<HTMLDivElement>(null);
  const espnDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formName, setFormName] = useState("");
  const [formEspnId, setFormEspnId] = useState("");
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formPicksLockAt, setFormPicksLockAt] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formPicksRequired, setFormPicksRequired] = useState("4");
  const [formOddsKey, setFormOddsKey] = useState(NONE_SENTINEL);
  const [matchResult, setMatchResult] = useState<{ sport: OddsSport | null; score: number } | null>(null);
  const [createResult, setCreateResult] = useState<{ fieldCount: number; pullError: string | null } | null>(null);

  useEffect(() => {
    if (espnDebounceRef.current) clearTimeout(espnDebounceRef.current);
    const trimmed = espnQuery.trim();
    if (!trimmed) { setEspnResults([]); setShowEspnDropdown(false); return; }
    espnDebounceRef.current = setTimeout(async () => {
      setIsEspnSearching(true);
      try {
        const res = await fetch(`/api/golf/espn-search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setEspnResults(Array.isArray(data) ? data : []);
          setShowEspnDropdown(true);
        }
      } catch { setEspnResults([]); }
      finally { setIsEspnSearching(false); }
    }, 400);
    return () => { if (espnDebounceRef.current) clearTimeout(espnDebounceRef.current); };
  }, [espnQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (espnSearchRef.current && !espnSearchRef.current.contains(e.target as Node)) {
        setShowEspnDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectEspnEvent = (evt: EspnEvent) => {
    setSelectedEspnEvent(evt);
    setEspnQuery(evt.name);
    setShowEspnDropdown(false);
    setFormName(evt.name);
    setFormEspnId(evt.id);
    if (evt.date) {
      const d = new Date(evt.date);
      setFormStartsAt(d.toISOString().slice(0, 16));
    }
    const result = fuzzyMatchSport(evt.name, oddsSports);
    setMatchResult(result);
    if (result.sport && result.score >= 0.2) {
      setFormOddsKey(result.sport.key);
    } else {
      setFormOddsKey(NONE_SENTINEL);
    }
    setCreateResult(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/golf/tournaments/create-and-pull", {
        name: formName.trim(),
        espnEventId: formEspnId.trim() || null,
        startsAt: formStartsAt || null,
        picksLockAt: formPicksLockAt,
        oddsApiSportKey: formOddsKey === NONE_SENTINEL ? null : formOddsKey,
        location: formLocation.trim() || null,
        picksRequired: parseInt(formPicksRequired) || 4,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCreateResult({ fieldCount: data.fieldCount, pullError: data.pullError });
      queryClient.invalidateQueries({ queryKey: ["/api/golf/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/golf/tournaments/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/golf/tournaments/field-counts"] });
      if (!data.pullError) {
        toast({ title: "Tournament created!", description: `${data.fieldCount} players in the field` });
      } else {
        toast({ title: "Tournament created (field pull failed)", description: data.pullError, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to create tournament", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = formName.trim() && formPicksLockAt;

  const resetForm = () => {
    setEspnQuery("");
    setSelectedEspnEvent(null);
    setFormName("");
    setFormEspnId("");
    setFormStartsAt("");
    setFormPicksLockAt("");
    setFormLocation("");
    setFormPicksRequired("4");
    setFormOddsKey(NONE_SENTINEL);
    setMatchResult(null);
    setCreateResult(null);
  };

  if (isLoadingSU) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  }

  if (!superUserStatus?.isSuperUser) return null;

  const sortedTournaments = [...tournaments].sort((a, b) => b.id - a.id);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Helmet>
        <title>Manage Tournaments | Upset Pool</title>
      </Helmet>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Manage Golf Tournaments</h1>
        <p className="mt-1 text-gray-500">Create tournaments from ESPN and pull the field automatically.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Create Tournament Panel ── */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-green-600" />
                Create New Tournament
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* ESPN Search */}
              <div className="space-y-1.5">
                <Label>Search ESPN for tournament</Label>
                <div ref={espnSearchRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={espnQuery}
                      onChange={e => { setEspnQuery(e.target.value); setSelectedEspnEvent(null); setMatchResult(null); }}
                      placeholder="e.g. Memorial Tournament, US Open…"
                      className="pl-9"
                    />
                    {isEspnSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
                  </div>
                  {showEspnDropdown && espnResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                      {espnResults.map(evt => (
                        <button
                          key={evt.id}
                          type="button"
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          onClick={() => handleSelectEspnEvent(evt)}
                        >
                          <div className="font-medium text-sm text-gray-900">{evt.name}</div>
                          {evt.date && (
                            <div className="text-xs text-gray-500">{new Date(evt.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {showEspnDropdown && espnResults.length === 0 && !isEspnSearching && espnQuery.length > 1 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow p-3 text-sm text-gray-500">
                      No ESPN events found. Try a different search term.
                    </div>
                  )}
                </div>
                {selectedEspnEvent && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    ESPN Event ID: {selectedEspnEvent.id}
                  </p>
                )}
              </div>

              <Separator />

              {/* Tournament Name */}
              <div className="space-y-1.5">
                <Label htmlFor="t-name">Tournament name <span className="text-red-500">*</span></Label>
                <Input id="t-name" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. The Memorial Tournament 2026" />
              </div>

              {/* Odds API sport key */}
              <div className="space-y-1.5">
                <Label>Odds API sport key</Label>
                {isLoadingOdds ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                ) : oddsSports.length > 0 ? (
                  <>
                    <Select value={formOddsKey} onValueChange={setFormOddsKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sport key" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_SENTINEL}>— None (pull field later) —</SelectItem>
                        {oddsSports.map(s => (
                          <SelectItem key={s.key} value={s.key}>
                            <span className="font-mono text-xs">{s.key}</span>
                            <span className="ml-2 text-gray-500">— {s.title}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Match feedback */}
                    {matchResult !== null && selectedEspnEvent && (
                      matchResult.score >= 0.2 && matchResult.sport ? (
                        <p className="text-xs text-blue-600 flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Auto-matched: "{matchResult.sport.title}" — confirm this is the right key
                        </p>
                      ) : (
                        <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800 flex items-start gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          <span>
                            No confident Odds API match found for "{selectedEspnEvent.name}".
                            The Odds API may not offer outrights for this event yet, or the tournament name may differ.
                            You can still create the tournament — select the correct key above if available, or leave as None and set it later.
                          </span>
                        </div>
                      )
                    )}
                  </>
                ) : (
                  <Input value={formOddsKey === NONE_SENTINEL ? "" : formOddsKey} onChange={e => setFormOddsKey(e.target.value || NONE_SENTINEL)} placeholder="e.g. golf_memorial_tournament_winner" className="font-mono text-sm" />
                )}
              </div>

              {/* ESPN Event ID (manual override) */}
              <div className="space-y-1.5">
                <Label htmlFor="t-espn">ESPN Event ID</Label>
                <Input id="t-espn" value={formEspnId} onChange={e => setFormEspnId(e.target.value)} placeholder="Auto-filled from search, or enter manually" className="font-mono text-sm" />
              </div>

              {/* Picks Lock */}
              <div className="space-y-1.5">
                <Label htmlFor="t-lock">Picks lock date & time <span className="text-red-500">*</span></Label>
                <Input id="t-lock" type="datetime-local" value={formPicksLockAt} onChange={e => setFormPicksLockAt(e.target.value)} />
                <p className="text-xs text-gray-500">Enter in your local time. Picks close when this passes.</p>
              </div>

              {/* Start date */}
              <div className="space-y-1.5">
                <Label htmlFor="t-starts">Tournament start date</Label>
                <Input id="t-starts" type="datetime-local" value={formStartsAt} onChange={e => setFormStartsAt(e.target.value)} />
              </div>

              {/* Location + picks required */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t-loc">Location (optional)</Label>
                  <Input id="t-loc" value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="e.g. Dublin, OH" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-picks">Picks required</Label>
                  <Input id="t-picks" type="number" min="1" max="10" value={formPicksRequired} onChange={e => setFormPicksRequired(e.target.value)} />
                </div>
              </div>

              {/* Success / error result */}
              {createResult && (
                <div className={`rounded-md p-3 text-sm ${createResult.pullError ? "bg-yellow-50 border border-yellow-200" : "bg-green-50 border border-green-200"}`}>
                  {createResult.pullError ? (
                    <div className="flex items-start gap-2 text-yellow-800">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium">Tournament created, but field pull failed</div>
                        <div className="text-xs mt-1">{createResult.pullError}</div>
                        <div className="text-xs mt-1">Pull the field manually from the league admin Settings tab once the Odds API key is set.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-800">
                      <CheckCircle className="h-4 w-4" />
                      <span>
                        <span className="font-medium">Tournament created!</span>
                        {" "}{createResult.fieldCount} players in the field.
                        {" "}It's now available when creating a golf league.
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button onClick={() => { setCreateResult(null); createMutation.mutate(); }} disabled={!canSubmit || createMutation.isPending} className="flex-1">
                  {createMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating & pulling field…</>
                  ) : "Create Tournament & Pull Field"}
                </Button>
                {(formName || formEspnId || formOddsKey !== NONE_SENTINEL) && (
                  <Button variant="outline" onClick={resetForm} disabled={createMutation.isPending}>
                    Reset
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Existing Tournaments Panel ── */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                All Tournaments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingTournaments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : sortedTournaments.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No tournaments yet.</p>
              ) : (
                <div className="space-y-3">
                  {sortedTournaments.map(t => (
                    <TournamentCard
                      key={t.id}
                      t={t}
                      fieldCount={fieldCounts[t.id] ?? 0}
                      oddsSports={oddsSports}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
