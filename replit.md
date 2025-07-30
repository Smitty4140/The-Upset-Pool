# NFL Upset Pool - Full Stack Application

## Overview

The NFL Upset Pool is a full-stack web application where users pick underdog NFL teams to win outright each week. Players earn points equal to the spread when their selected underdog wins. The application features user authentication, league management, real-time game tracking, and a comprehensive leaderboard system.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Authentication**: Dual authentication system supporting both email/password and Replit OAuth
- **Session Management**: Express sessions with PostgreSQL storage
- **API Design**: RESTful API with structured error handling

### Database Architecture
- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM with type-safe queries
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection**: Connection pooling with @neondatabase/serverless

## Key Components

### Authentication System
- **Dual Auth Support**: Email/password authentication and Replit OAuth
- **Session Storage**: PostgreSQL-backed session storage using connect-pg-simple
- **Security**: Scrypt-based password hashing with salt
- **User Management**: User profiles with customizable settings and avatars
- **Auto-League Assignment**: All new users automatically join the default NFL Upset Pool league

### NFL Game Management
- **Live Data Integration**: Configured for external sports odds API integration
- **Game Tracking**: Comprehensive game state management with spreads and results
- **Week Management**: NFL season week structure with configurable pick deadlines
- **Team Data**: Complete NFL team database with logos and branding

### League System
- **Multi-League Support**: Users can participate in multiple leagues
- **Leaderboard**: Real-time point calculations and rankings
- **Pick Management**: Weekly pick submission with deadline enforcement
- **Admin Controls**: League administration tools for game management

### Email Integration
- **SendGrid Integration**: Transactional email support for notifications
- **Welcome Emails**: Automated user onboarding emails
- **Pick Reminders**: Configurable notification system

## Data Flow

### Pick Submission Flow
1. User selects an underdog team from the weekly games grid
2. Client validates pick against deadline and game status
3. API processes pick submission with spread calculation
4. Database stores pick with metadata (spread at time of pick, underdog status)
5. Real-time UI updates reflect the submitted pick

### Scoring Flow
1. Admin updates game results through admin panel
2. System calculates points for all picks based on game outcomes
3. User totals are recalculated automatically
4. Leaderboard updates reflect new standings
5. Email notifications sent for significant events

### Data Synchronization
1. External odds API provides game spreads and schedules
2. Admin triggers data sync through admin controls
3. System updates game information while preserving existing picks
4. Conflict resolution ensures data integrity

## External Dependencies

### Required Services
- **PostgreSQL Database**: Primary data storage (configured for Neon)
- **SendGrid**: Email delivery service (optional, graceful degradation)
- **Sports Odds API**: External game data and spreads (configurable)

### Required Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Session encryption key
- `SENDGRID_API_KEY`: Email service API key (optional)
- `NODE_ENV`: Environment configuration
- `REPL_ID`: Replit integration identifier (optional)

### NPM Dependencies
- **UI Framework**: @radix-ui components, @tanstack/react-query
- **Database**: drizzle-orm, @neondatabase/serverless
- **Authentication**: passport, express-session
- **Utilities**: zod, date-fns, clsx

## Deployment Strategy

### Development Environment
- **Hot Reload**: Vite development server with HMR
- **Database**: Local PostgreSQL or development Neon instance
- **Authentication**: Both auth methods available for testing
- **Email**: Development mode with console logging

### Production Build
- **Frontend**: Vite production build with asset optimization
- **Backend**: ESBuild compilation to single JavaScript bundle
- **Static Assets**: Served from Express with proper caching headers
- **Database**: Production PostgreSQL with connection pooling

### Deployment Configuration
- **Start Command**: `npm start` runs the production Express server
- **Health Checks**: Built-in API health endpoints
- **Error Handling**: Comprehensive error catching with user-friendly responses
- **Logging**: Structured logging for API requests and database operations

The application is designed for easy deployment on platforms like Replit, Vercel, or traditional VPS hosting, with environment-based configuration for different deployment targets.

## Recent Changes

### July 28, 2025
- **Pick Locking Logic**: Fixed inverted pick locking - picks are now correctly unlocked before 1:00 PM EST Sunday and locked after
- **Week Date Filtering**: Games now properly filter by week date ranges to show only relevant games
- **Game Chronological Ordering**: Games within each week now display in kickoff time order (earliest first)
- **Deadline Configuration**: Updated all NFL weeks to lock picks at 1:00 PM EST on the Sunday within each week
- **Auto-League Membership**: Implemented automatic assignment of all new users to the default NFL Upset Pool league
- **Leaderboard Fix**: Ensured all users appear on the leaderboard by adding them to league membership

### July 29, 2025
- **Underdog Selection Logic**: Fixed and enforced proper underdog-only selection logic with server-side validation
- **Game Card UI Enhancement**: Removed "FAVORITE" labels and made entire game cards clickable while maintaining underdog-only selection
- **Smart Pick Selection**: System automatically selects underdog team regardless of which team user clicks on game card
- **Pick Display Component**: Corrected "Your Selected Pick" component to accurately show underdog spread values with proper +/- formatting
- **Spread Convention**: Confirmed and documented spread logic - positive spread = home team underdog, negative spread = away team underdog
- **Server-Side Auto-Switch**: Backend automatically converts any favorite team selections to corresponding underdog teams before database storage
- **UI Consistency**: Green badges continue to indicate underdog teams while both teams remain visually clickable for better UX
- **Admin Controls Fix**: Fixed authentication issue in lock/unlock picks functionality - admin users can now properly toggle pick deadlines
- **Weekly Picks Enhancement**: Added Season Total column to weekly picks table showing each player's cumulative points for the season
- **Game Results Management**: Implemented comprehensive Results tab for admin users with game winner selection and automatic point calculation
- **Editable Results**: Game results can be changed by admins even after being set, automatically recalculating all affected user points and season totals
- **Cache Synchronization Fix**: Fixed critical cache invalidation issues where pick changes and game result updates weren't immediately reflected in the Weekly Picks table
- **Real-time UI Updates**: All components now properly invalidate related query caches for immediate UI synchronization when picks are submitted or game results are updated
- **Pull NFL Game Results API**: Added automated game results fetching from ESPN's free API with admin "Pull Game Results from API" button for real-time score updates and point calculation
- **Proper Tie Handling in Leaderboards**: Implemented comprehensive tie handling across all leaderboard views - users with same points share identical rankings with proper gap handling (e.g., 1st, 2nd, 2nd, 4th)
- **Weekly Picks Standings**: Added "Standing" column to Weekly Picks table showing each player's current season position (1st, 2nd, 3rd, etc.) with table ordered by standings
- **Navigation Accessibility Fix**: Updated top navigation from blue gradient background with grey text to dark grey background (bg-gray-800) with white text for improved readability and contrast
- **Admin Controls Reorganization**: Moved league admin controls from standalone section to dedicated "Admin" tab within main content tabs, visible only to league administrators for better organization and cleaner UI
- **Automated Game Data Scheduler**: Implemented comprehensive scheduling system using node-cron that automatically pulls NFL game data 12 hours before the first game of each week
- **Scheduler Management Interface**: Added admin UI controls to monitor scheduler status, view scheduled jobs, and trigger manual data pulls for testing
- **Game Data Flow Clarification**: Games are first created via odds API pull (appearing on selection tab), then later updated with results via ESPN API pull (affecting only existing games)
- **Automated Results Scheduler**: Implemented comprehensive dual scheduling system - game data pulls 12 hours before first game AND results pulls 5 hours after last game of each NFL week
- **Results Pull Automation**: System automatically processes game results on Monday nights (5 hours after typical MNF completion) to calculate final points and update leaderboards
- **Dual Test Interface**: Added separate test buttons for both data pulls and results pulls with proper UI feedback and cache invalidation