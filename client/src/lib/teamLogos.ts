// NFL Team logos mapping
// These are the official NFL team abbreviations with URL mappings to logos

// Create a mapping of team abbreviations to logo URLs
// In a production application, these would be stored on a CDN or served from the server
// For this example, using standard NFL logo CDN URLs
const teamLogos: Record<string, string> = {
  ARI: "https://a.espncdn.com/i/teamlogos/nfl/500/ari.png", // Arizona Cardinals
  ATL: "https://a.espncdn.com/i/teamlogos/nfl/500/atl.png", // Atlanta Falcons
  BAL: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png", // Baltimore Ravens
  BUF: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png", // Buffalo Bills
  CAR: "https://a.espncdn.com/i/teamlogos/nfl/500/car.png", // Carolina Panthers
  CHI: "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png", // Chicago Bears
  CIN: "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png", // Cincinnati Bengals
  CLE: "https://a.espncdn.com/i/teamlogos/nfl/500/cle.png", // Cleveland Browns
  DAL: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png", // Dallas Cowboys
  DEN: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png", // Denver Broncos
  DET: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png", // Detroit Lions
  GB: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png",   // Green Bay Packers
  HOU: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png", // Houston Texans
  IND: "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png", // Indianapolis Colts
  JAX: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png", // Jacksonville Jaguars
  KC: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",   // Kansas City Chiefs
  LV: "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png",   // Las Vegas Raiders
  LAC: "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png", // Los Angeles Chargers
  LAR: "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png", // Los Angeles Rams
  MIA: "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png", // Miami Dolphins
  MIN: "https://a.espncdn.com/i/teamlogos/nfl/500/min.png", // Minnesota Vikings
  NE: "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png",   // New England Patriots
  NO: "https://a.espncdn.com/i/teamlogos/nfl/500/no.png",   // New Orleans Saints
  NYG: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png", // New York Giants
  NYJ: "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png", // New York Jets
  PHI: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png", // Philadelphia Eagles
  PIT: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png", // Pittsburgh Steelers
  SF: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png",   // San Francisco 49ers
  SEA: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png", // Seattle Seahawks
  TB: "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png",   // Tampa Bay Buccaneers
  TEN: "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png", // Tennessee Titans
  WAS: "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png", // Washington Football Team
};

// Default logo to use if a specific team logo is not found
const defaultLogo = "https://a.espncdn.com/i/teamlogos/nfl/500/nfl.png";

/**
 * Gets the logo URL for a given team abbreviation
 * @param abbreviation The NFL team abbreviation (e.g., "KC" for Kansas City Chiefs)
 * @returns The URL to the team's logo
 */
export function getTeamLogo(abbreviation: string): string {
  return teamLogos[abbreviation] || defaultLogo;
}

export default teamLogos;
