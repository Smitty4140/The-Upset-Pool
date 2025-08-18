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

### Database
- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM with type-safe queries
- **Schema Management**: Drizzle Kit
- **Connection**: @neondatabase/serverless for connection pooling
- **Data Integrity**: Ensures picks are isolated by league and points are calculated per league.

## External Dependencies
- **PostgreSQL Database**: Primary data storage (e.g., Neon).
- **SendGrid**: Email delivery service for notifications (optional).
- **Sports Odds API**: External service for NFL game data and spreads.
- **ESPN API**: Used for pulling NFL game results.