# NFL Upset Pool - Compressed

## Overview
The NFL Upset Pool is a full-stack web application enabling users to pick underdog NFL teams to win, earning points based on the spread. It features user authentication, league management, real-time game tracking, and a comprehensive leaderboard. The vision is to create an engaging platform for NFL fans to compete in a unique, strategy-focused fantasy game, offering real-time updates and a seamless user experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite
- **UI/UX Decisions**:
    - Intuitive navigation with a dropdown week selector.
    - Clear visual indicators for game status (e.g., "STARTED", locked games).
    - User-friendly display of picks, spreads, and standings.
    - Color-coded badges and improved contrast for readability (e.g., dark grey background with white text for navigation).
    - Individual submit buttons for game card picks for improved clarity.

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Authentication**: Dual system (email/password and Replit OAuth) with scrypt hashing.
- **Session Management**: Express sessions with PostgreSQL storage.
- **API Design**: RESTful API with structured error handling.
- **Key Features**:
    - Automated user assignment to a default league.
    - Server-side validation for pick submissions, ensuring underdog selection and enforcing deadlines.
    - Automated game data and results pulling via scheduled jobs (e.g., 12 hours before first game for data, 5 hours after last game for results).
    - Comprehensive tie handling in leaderboards.
    - League management including unique invite codes and member management.
    - Super user system for critical system-wide administrative functions.
    - Game-specific pick locking based on kickoff times.
    - Fixed logout functionality to properly terminate sessions using correct POST method.
    - Fixed game time display inconsistencies to show all times correctly in Eastern Time (EDT/EST).
    - Updated picks lock time calculation to properly handle daylight saving time transitions (EST/EDT).
    - Weekly email reminder system: automated stylized emails sent every Sunday at noon during NFL weeks 1-18.
    - Smart email differentiation: confirmation emails for users who made all picks, reminder emails for those missing picks.
    - Comprehensive email templates with responsive design, league-specific information, and clear CTAs.

### Database
- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM with type-safe queries
- **Schema Management**: Drizzle Kit
- **Connection**: @neondatabase/serverless for connection pooling
- **Data Integrity**: Ensures picks are isolated by league and points are calculated per league.

## External Dependencies
- **PostgreSQL Database**: Primary data storage (e.g., Neon).
- **SendGrid**: Email delivery service for notifications and weekly reminders.
- **Sports Odds API**: External service for NFL game data and spreads.
- **ESPN API**: Used for pulling NFL game results.

## Recent Updates (August 2025)
- **Google OAuth Authentication**: Implemented comprehensive dual authentication system supporting both Google OAuth and traditional email/password
  - Users can sign in with Google accounts without creating passwords
  - Account linking: existing email users can link their Google accounts seamlessly
  - Updated database schema with google_id field and optional password
  - Beautiful login/registration pages with Google sign-in integration
  - Automatic user assignment to default league for new Google users and existing users without leagues
  - Fixed league assignment for linked Google accounts to ensure all users join the default pool
- **Weekly Email Reminders**: Implemented automated email system that runs every Sunday at noon (Eastern Time) during NFL weeks 1-18.
  - Only sends emails to active league members who have notifications enabled
  - Sends stylized confirmation emails to users who completed all picks across their leagues
  - Sends urgent reminder emails to users missing picks in any of their leagues
  - Includes league-specific information, team details, and spreads in confirmation emails
  - Features responsive HTML templates with modern design and clear call-to-action buttons
  - Admin endpoints for testing and manually triggering email campaigns
  - Automatically skips preseason and other non-regular season weeks
- **Picks Unlocked Notifications**: Automated email system that triggers when game data is pulled (picks become available).
  - Sends "Upset Pool Picks Are Live!" emails to active league members with notifications enabled
  - Only sends during NFL regular season weeks (1-18)
  - Features engaging email template with clear call-to-action to make picks
  - Automatically triggered when weekly game data pull completes successfully
  - Admin test endpoint available for manual testing
- **Email Service Migration**: Switched from SendGrid to Brevo (Sendinblue) for improved email delivery reliability
- **League Navigation Fix**: Resolved TypeScript errors causing league switching issues
  - Fixed automatic league switching behavior that was reverting user selections
  - Improved type safety for league data handling
  - Removed problematic preseason data (week 999) from database
- **Data Cleanup**: Removed all week 999 preseason data to improve system performance and data integrity
- **Google Profile Images**: Enhanced leaderboard display to show user's Google profile images instead of default avatars
  - Fixed leaderboard API to include profileImageUrl in response data
  - Updated username validation to allow spaces in leaderboard names (3-25 characters)
  - Implemented complete username setup flow for new Google OAuth users
- **NFL Schedule Accuracy**: Fixed Week 1 to have exactly 16 games with accurate 2025 NFL schedule
  - Removed duplicate and incorrect matchups from Week 1
  - Set all spreads to 0.0 to disable picks until automated spread pulls occur
  - Picks will be available 12 hours before Week 1 begins when the scheduler pulls real spreads
- **Custom Domain Integration**: OAuth redirects now use upsetpool.com custom domain
  - Custom domain upsetpool.com successfully configured with DNS verification
  - OAuth authentication now redirects to https://upsetpool.com maintaining consistent branding
  - Users stay on custom domain throughout the entire authentication flow
- **Database Reset**: Clean slate for fresh production deployment
  - Removed all users except samsemail123456789@gmail.com (Commish)
  - Deleted all user picks and league members except the main admin
  - Removed all leagues except League 1 (NFL Upset Pool)
  - Preserved all NFL games, weeks, teams, and schedule data
- **UI Cleanup**: Removed messageboard tab from league navigation
  - Eliminated messageboard tab button from ContentTabs component
  - Removed placeholder messageboard content from Home page
  - Streamlined league interface to focus on core features
- **Mobile Leaderboard Scrolling**: Fixed mobile responsiveness for leaderboard tables
  - Added horizontal scrolling support for leaderboard tab in main page interface
  - Users can now swipe left/right to view all columns (Place, Pooler, Score, Every Week Eligible) on mobile devices
  - Enhanced both the component leaderboard and dedicated leaderboard page with overflow-x-auto containers
  - Improved mobile user experience without breaking desktop layout
- **Scheduler Timezone Fix (COMPREHENSIVE)**: Fixed critical bugs with picks locking/spreads pulling and automated job execution
  - **Issue 1**: Database picksLockAt values needed DST-aware calculation
    - Fix: Created `timezoneUtils.ts` with shared ET→UTC conversion functions (`easternTimeToUTC`, `getPicksLockTimeForSunday`)
    - Automatically detects EDT (UTC-4) vs EST (UTC-5) and converts correctly
    - Database values: 17:00 UTC for EDT weeks (Sep-Oct), 18:00 UTC for EST weeks (Nov-Jan)
  - **Issue 2**: Cron jobs generated ET expressions but needed timezone context
    - Fix: `getCronExpression` converts Date to ET components for cron pattern
    - Cron jobs configured with `timezone: 'America/New_York'` to interpret patterns in ET
    - Pattern "0 13 2 11" with timezone ET = Sunday Nov 2 at 1:00 PM ET (correct)
  - **Issue 3**: Automated spread pulling via scheduled jobs
    - Created shared `pullNFLGamesFromOddsAPI` function in `nflDataPuller.ts`
    - Manual admin button and scheduler both use identical API call logic
    - When countdown reaches 0, scheduler automatically triggers spread pull from The Odds API
    - Jobs execute with ⏰/✅ logging markers for monitoring
  - **Locking Mechanisms**:
    - Week-level lock: `picksLockAt` enforces Sunday 1:00 PM ET deadline for all games in that week
    - Game-specific lock: Individual `gameTime` prevents picks after each game's kickoff
    - Both mechanisms properly handle EDT/EST transitions
  - **Result**: All countdowns, locks, and automated jobs occur at correct ET times without duplication
- **Manual League Joining**: Removed automatic league assignment for new users
  - New users are no longer auto-added to the default NFL Upset Pool league
  - Created JoinLeague page with invite code input and league creation option
  - Users must manually join a league via invite code or create their own
  - App routing redirects users without leagues to JoinLeague page after username setup
  - Removed auto-add logic from storage.ts (createUser, upsertUser) and replitAuth.ts
- **League Archiving**: Added ability to archive leagues at end of season
  - Added season, isArchived, and archivedAt fields to leagues table
  - Archived leagues cannot accept new members (blocked on both API endpoints)
  - Archived leagues cannot have picks submitted (blocked on pick submission API)
  - Super users can archive/unarchive leagues via PATCH /api/leagues/:leagueId/archive
  - Frontend displays archived league banner with season info
  - Pick submission is disabled for archived leagues in the UI
- **Dual Database Environment**: Separate databases for development and production
  - Development: Neon database (DEV_DATABASE_URL env var) for testing and data manipulation
  - Production: Replit built-in PostgreSQL database (DATABASE_URL) for live app
  - server/db.ts automatically selects the correct database based on NODE_ENV
  - Schema must be pushed to both databases when changes are made
- **Golf League Type**: Added multi-sport support with Golf as the second league type
  - Golf leagues are linked to a Major Championship tournament (Masters, US Open, etc.)
  - Users pick N golfers per tournament (configurable via `picks_required`, default 4)
  - Scoring: golfer's American odds as points if they finish T-10 or better (e.g. +3500 = 3500 pts)
  - Tiebreaker: highest odds (best point value) across picks; standard competition ranking for remaining ties
  - Each tournament is independent (no season-long tracking)
  - New database tables: `golf_tournaments`, `golf_players`, `golf_tournament_field`, `golf_picks`, `golf_pick_selections`, `golf_results`
  - `leagues` table extended with `sport_type` (default 'nfl') and `golf_tournament_id` columns
  - Golf API routes: GET/POST/PATCH /api/golf/tournaments, GET/POST /api/golf/tournaments/:id/field, GET/POST /api/golf/leagues/:leagueId/picks, GET /api/golf/leagues/:leagueId/leaderboard, GET/POST /api/golf/tournaments/:id/results
  - New API pull routes: POST /api/golf/tournaments/:id/pull-field (Odds API), POST /api/golf/tournaments/:id/pull-results (ESPN)
  - Frontend: `CreateLeague.tsx` now has sport type selector; `GolfLeagueView.tsx` renders for golf leagues
  - Home.tsx conditionally renders GolfLeagueView (instead of NFL tabs) when selected league has sportType='golf'
  - Admin panel in GolfLeagueView for league admins: bulk-add field entries, pull field/odds via API, pull/enter results, adjust tournament settings
  - Schema applied to DEV (Neon) and local Replit PostgreSQL via direct SQL (drizzle-kit push blocked by interactive prompts)
  - `golf_players` has `photo_url` column; `golf_tournament_field` has `odds` column (integer, e.g. 600 = +600)
  - `golf_tournaments` has `odds_api_sport_key`, `espn_event_id`, `last_poll_at` columns for API integration
  - **Golfer pick panel**: row-based table layout (avatar, name, OWGR, odds, pick button); sort by odds/rank/A-Z
  - **Automated API pulls**: `server/golfDataPuller.ts` pulls field+odds from The Odds API, scores from ESPN
  - **Golf Scheduler** (`server/golfScheduler.ts`): hourly ESPN score polling for active tournaments; auto-completes when ESPN reports 'post' state
  - Setting tournament status to 'active' starts hourly score polling; 'completed' stops it