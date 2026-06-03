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
import { Loader2, Search, CheckCircle, AlertTriangle, Trophy, Calendar, Users } from "lucide-react";

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

function fuzzyMatchSport(eventName: string, sports: OddsSport[]): OddsSport | null {
  if (!sports.length) return null;
  const STOP_WORDS = new Set(["golf", "winner", "the", "championship", "tournament", "open", "pga", "lpga", "masters", "-"]);
  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t && !STOP_WORDS.has(t));

  const eventTokens = tokenize(eventName);
  if (eventTokens.length === 0) return sports[0];

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
  return best;
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
  const [formOddsKey, setFormOddsKey] = useState("");
  const [autoMatchedSport, setAutoMatchedSport] = useState<OddsSport | null>(null);
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
    const match = fuzzyMatchSport(evt.name, oddsSports);
    setAutoMatchedSport(match);
    if (match) setFormOddsKey(match.key);
    setCreateResult(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/golf/tournaments/create-and-pull", {
        name: formName.trim(),
        espnEventId: formEspnId.trim() || null,
        startsAt: formStartsAt || null,
        picksLockAt: formPicksLockAt,
        oddsApiSportKey: formOddsKey.trim() || null,
        location: formLocation.trim() || null,
        picksRequired: parseInt(formPicksRequired) || 4,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCreateResult({ fieldCount: data.fieldCount, pullError: data.pullError });
      queryClient.invalidateQueries({ queryKey: ["/api/golf/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/golf/tournaments/available"] });
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

  const handleCreate = () => {
    if (!canSubmit) return;
    setCreateResult(null);
    createMutation.mutate();
  };

  const resetForm = () => {
    setEspnQuery("");
    setSelectedEspnEvent(null);
    setFormName("");
    setFormEspnId("");
    setFormStartsAt("");
    setFormPicksLockAt("");
    setFormLocation("");
    setFormPicksRequired("4");
    setFormOddsKey("");
    setAutoMatchedSport(null);
    setCreateResult(null);
  };

  if (isLoadingSU) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  }

  if (!superUserStatus?.isSuperUser) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Helmet>
        <title>Manage Tournaments | Upset Pool</title>
      </Helmet>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Manage Golf Tournaments</h1>
        <p className="mt-1 text-gray-500">Create and manage golf tournaments available for league creation.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Tournament Panel */}
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
                      onChange={e => { setEspnQuery(e.target.value); setSelectedEspnEvent(null); }}
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
                  <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading available keys…</div>
                ) : oddsSports.length > 0 ? (
                  <>
                    <Select value={formOddsKey} onValueChange={setFormOddsKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sport key (or none)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— None (pull field later) —</SelectItem>
                        {oddsSports.map(s => (
                          <SelectItem key={s.key} value={s.key}>
                            <span className="font-mono text-xs">{s.key}</span>
                            <span className="ml-2 text-gray-500">— {s.title}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {autoMatchedSport && formOddsKey === autoMatchedSport.key && (
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Auto-matched: "{autoMatchedSport.title}" — confirm this is correct
                      </p>
                    )}
                  </>
                ) : (
                  <Input value={formOddsKey} onChange={e => setFormOddsKey(e.target.value)} placeholder="e.g. golf_memorial_tournament_winner" className="font-mono text-sm" />
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
                <p className="text-xs text-gray-500">Enter in your local time. This is when picks close for this tournament.</p>
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
                        <div className="text-xs mt-1">You can pull the field manually from the league admin Settings tab.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-800">
                      <CheckCircle className="h-4 w-4" />
                      <div>
                        <span className="font-medium">Tournament created!</span>
                        {" "}{createResult.fieldCount} players added to the field.
                        {" "}It's now available when creating a golf league.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  onClick={handleCreate}
                  disabled={!canSubmit || createMutation.isPending}
                  className="flex-1"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating & pulling field…</>
                  ) : "Create Tournament & Pull Field"}
                </Button>
                {(formName || formEspnId || formOddsKey) && (
                  <Button variant="outline" onClick={resetForm} disabled={createMutation.isPending}>
                    Reset
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Existing Tournaments */}
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
              ) : tournaments.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No tournaments yet.</p>
              ) : (
                <div className="space-y-3">
                  {[...tournaments].sort((a, b) => (b.id - a.id)).map(t => (
                    <div key={t.id} className="rounded-lg border border-gray-200 p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-gray-900">{t.name}</div>
                        <Badge variant={t.status === "completed" ? "secondary" : t.status === "active" ? "default" : "outline"} className="text-xs flex-shrink-0">
                          {t.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {t.location && <div>📍 {t.location}</div>}
                        {t.startsAt && <div>🗓 Starts {new Date(t.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}
                        <div>🔒 Picks lock {new Date(t.picksLockAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                        <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {t.picksRequired} picks required</div>
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
