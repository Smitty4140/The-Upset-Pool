# NFL Upset Pool - Design Guidelines

## Design Approach
**System Selected:** Material Design with Sports-Focused Customization
**Rationale:** Information-dense fantasy sports application requiring robust data display patterns, clear hierarchy, and proven interaction models for competitive users who prioritize functionality and speed.

**Design Influences:** ESPN, DraftKings, FanDuel - combining data-rich dashboards with modern sports aesthetics. Focus on scannable information architecture and efficient decision-making flows.

## Typography System

**Primary Font:** Inter (via Google Fonts)
- Headings: 700 weight, sizes from text-3xl to text-sm
- Body: 400 weight, text-base to text-sm
- Data/Stats: 600 weight (tabular-nums), text-lg to text-xs
- Labels: 500 weight, text-xs, uppercase with tracking-wide

**Secondary Font:** Roboto Mono (via Google Fonts)
- Used exclusively for scores, odds, and numerical data
- Ensures perfect alignment in tables and stat displays

## Layout System

**Spacing Units:** Tailwind units of 1, 2, 3, 4, 6, 8, 12, 16
- Tight spacing (1-2): Table cells, compact data rows
- Standard spacing (4-6): Card padding, form elements
- Generous spacing (8-12): Section separation, dashboard modules
- Large spacing (16): Major page sections

**Container Strategy:**
- Main content: max-w-7xl with px-4 to px-8
- Dashboard cards: Full-width grids with gap-4 to gap-6
- Data tables: w-full with horizontal scroll on mobile

## Component Library

### Navigation
**Top Navigation Bar:** Fixed header with logo left, main nav center, user profile/notifications right. Height h-16. Include quick stats (week number, user rank, points) in header on desktop.

**Secondary Nav:** Sticky tabs below header for Dashboard, Pick'em, Standings, Stats, Rules. Active state with bottom border indicator.

### Dashboard Layout
**Hero Section:** NO large hero image. Instead, use a compact status bar showing current week, deadline countdown, picks submitted status, and quick action button. Height approximately 120px.

**Grid Structure:** 
- Desktop: 3-column grid (lg:grid-cols-3) for stat cards
- Tablet: 2-column (md:grid-cols-2)
- Mobile: Single column

### Core Components

**Game Matchup Cards:**
- Horizontal layout with team logos, scores, spread, confidence points
- Selectable state with radio buttons or checkboxes
- Lock status indicator for games past deadline
- Display time, network, weather icons where relevant
- Hover state elevates card (shadow-md to shadow-lg)

**Statistics Tables:**
- Sticky header row with sortable columns
- Alternating row background for scannability
- Right-align numerical data, left-align text
- Compact row height (h-10 to h-12)
- Highlight current user row with subtle background

**Leaderboard Cards:**
- Rank badge (circular, positioned left), username, points, trend indicator (up/down arrow)
- Trophy icons for top 3 positions
- Expandable rows to show detailed picks on click

**Pick Confidence Slider:**
- Large touch targets for mobile (min h-12)
- Live preview of points allocation
- Validation feedback showing remaining points to allocate
- Clear visual distinction between locked and available picks

**Charts & Graphs:**
- Use Chart.js or Recharts for line graphs (weekly performance trends)
- Bar charts for pick distributions, win rates
- Donut charts for category breakdowns
- Maintain consistent aspect ratio (16:9 or 4:3)

**Status Badges:**
- Win/Loss indicators: rounded-full, px-3, py-1, font-semibold, text-xs
- Confidence levels: 1-3 units padding based on importance
- Lock status: Icon + text combination

### Forms & Inputs

**Pick Selection Interface:**
- Large, tappable cards for each matchup (min-h-24)
- Toggle between teams with smooth transition
- Confidence point selector (dropdown or stepper)
- Save button: Fixed bottom bar on mobile, top-right on desktop

**User Profile:**
- Avatar upload with preview
- Tabular data for season history
- Form fields with floating labels (Material Design pattern)

### Data Displays

**Weekly Picks Grid:**
- Fixed left column for team names
- Scrollable right section for all users' picks
- Cell size: w-8 to w-12 (depending on icon size)
- Check/X icons for correct/incorrect picks

**Performance Metrics:**
- Card-based KPI layout: Large number (text-4xl), label below (text-sm), trend indicator
- 4-column grid on desktop, 2 on tablet, stacked on mobile

## Images

**Team Logos:** Required throughout - use NFL team logo library via API or CDN. Display at 48x48px in matchup cards, 32x32px in tables, 64x64px in pick selection.

**User Avatars:** Circular, 40x40px in navigation, 32x32px in leaderboards, 80x80px in profile.

**No Hero Image:** This is a data-focused application dashboard. Lead with actionable content and live data, not marketing imagery.

**Background Patterns:** Use subtle geometric patterns or field textures in empty states and loading screens only, not as persistent backgrounds.

## Interactions

**Minimal Animations:**
- Card hover: Translate up 2px + shadow transition (150ms)
- Data updates: Fade in new values (200ms)
- Selection states: Instant feedback, no delay
- Loading: Skeleton screens for tables, simple spinner for buttons

**Responsiveness:**
- Mobile: Stack all multi-column layouts, sticky action buttons at bottom
- Tablet: 2-column grids, maintain table structure with horizontal scroll
- Desktop: Full data density with 3-4 column layouts

## Accessibility

- Ensure all interactive elements have min 44x44px touch targets
- Maintain WCAG AA contrast ratios for all text on backgrounds
- Provide text alternatives for team logos and icons
- Keyboard navigation support for all pick selections and form interactions
- Screen reader labels for data tables with proper scope attributes