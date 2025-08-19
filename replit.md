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
    - Payment tracking system: admins can mark users as paid/unpaid, new members default to unpaid.
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