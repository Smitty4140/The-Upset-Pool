# Design Clarity Review

A review of the Upset Pool web client for design clarity, with the confusing
text updated in code. This document records what was found, what changed, and
what is recommended but not yet done.

Scope: `client/` (React app). Server behaviour was read only to confirm what
the UI *should* say.

---

## The one thing worth fixing first

**The pick flow never told you whether your pick was saved.**

A game card you had merely tapped and a game card holding your submitted pick
both rendered the same green banner reading "Selected Game". The only
difference was a Submit button that appeared below the unsaved one — easy to
miss on a phone, where the button often sat below the fold. A user who tapped
a card, saw green, saw a checkmark, and closed the tab had no pick that week.

This was the highest-cost defect on the site, because the whole product is one
weekly action and this made that action's completion ambiguous. It is fixed:
the three states now read

| State | Colour | Text |
| --- | --- | --- |
| Tapped, not submitted | blue | Selected — not saved yet |
| Submitted | green | Your pick for this week |
| Submitted, game kicked off | amber | Your pick — locked |

---

## Findings and changes

### 1. The underdog-only rule was invisible

Clicking *either* team on a card selected the underdog. The rule was enforced
silently: pick the favourite, get the underdog, no explanation. The only
signal was a green `+4.5` badge whose meaning you had to already know.

**Changed.** The underdog's badge now carries an "Underdog" label, and
selectable cards state which team choosing the card will pick. The Rules page
states the constraint explicitly.

### 2. Deadlines were stated in the wrong timezone

The UI hardcoded "1:00 PM EST" in five places. The server computes the lock
DST-aware at 1:00 PM **Eastern** (`server/timezoneUtils.ts`,
`getPicksLockTimeForSunday`). From September through October the NFL season
runs on EDT, so the displayed deadline was an hour off from the real one —
during the weeks that matter most.

**Changed.** All copy now reads "1:00 PM ET".

### 3. Internal vocabulary leaked into the interface

| Was | Now |
| --- | --- |
| "Data pull scheduled" | "Any moment now" |
| "Spreads available:" | "Spreads post in" |
| "Games are available for selection after spreads are pulled." | "Spreads for this week haven't been posted yet…" |
| "Did you forget to add the page to the router?" (the 404 page) | A real 404 with links home and to the rules |

"Data pull" and "pulled" are scheduler concepts. Players do not know the app
fetches from an odds API, and shouldn't need to.

### 4. The league header described the wrong week

`LeagueHeader` renders the week you're *viewing* but its status line reflects
your pick for the *current* week. Browsing Week 3 in Week 8 produced "You have
not submitted a pick for this week" directly beneath a "Week 3" heading.

**Changed.** The status line names its week ("No pick yet for Week 8"), so it
can't be misread, and the week badge distinguishes a finished week from an
upcoming one instead of the vague "(Viewing different week)".

### 5. Two tables, two vocabularies for the same concepts

| Concept | Leaderboard said | Weekly Picks said | Now |
| --- | --- | --- | --- |
| Position | Place | Standing | **Place** |
| Season points | Score | Season Total | **Points** |
| A person | Pooler | Player | **Player** |
| A lost pick | — | Loser / Loss | **Lost** |
| Awaiting result | — | Result Pending / Pending | **Pending** |

"Loser" is also worth calling out on its own: the column reports the *pick's*
outcome, but the row is a person, so it read as an insult rather than a result.

### 6. Away-underdog spreads displayed as negative numbers

In `WeeklyPicks`, `{Number(spreadAtTimeOfPick) > 0 ? '+' : ''}{spread}`
printed `-6.5` for an away underdog, because away spreads are stored negative.
A player who earned 6.5 points saw `-6.5` next to their name. Every other
surface used `Math.abs`.

**Changed.** Always renders `+6.5`.

### 7. Icon-only columns with no legend

The leaderboard's "Picked Every Week" column showed a green check or a **red
X** with nothing explaining either. Red reads as *error*, but missing a week is
not an error — it only forfeits one of the end-of-season drawings.

**Changed.** The X is now grey, both states have tooltips and screen-reader
text, and a legend sits under the table covering the eligibility icons and the
win/loss tint on the "Last Pick" chip.

### 8. Tabs named after data, not tasks

"Game Spreads" was where you make your pick. "Weekly Picks" was where you read
everyone else's, after lock. Both labels described their contents rather than
their purpose, and the two were easy to transpose.

**Changed.** "Make Picks" and "Everyone's Picks". Once picks lock, the first
tab becomes "Games & Spreads", since making a pick is no longer possible —
this also puts the previously-unused `isPicksLocked` prop to work.

### 9. The logo opens Snood — kept deliberately, now in a dialog

The header logo and wordmark used to link out to `playminigames.net/game/snood`,
opening an unrelated game in a new tab. Normally the logo is the universal
"return home" control, so this was raised as a finding.

**The easter egg is intentional and stays** at the owner's direction — the
misdirection is the joke. What changed is where it lands: the logo now opens
Snood in a dialog on the site, under the heading "Congrats! You've found the
hidden snood!", so the player is told what happened and closing the dialog
puts them back where they were instead of stranding them in a new tab. The
route home is the "My Leagues" nav item, which appears on every page in both
the desktop and mobile menus, so no page is a dead end. The footer carries
Rules and Support links only.

Worth noting for future reference: the mobile menu is the only route home on
small screens, so if that nav item is ever removed or renamed, the logo should
take over the home link at the same time.

### 10. New users hit a dead end

Registration completes, then the app renders the "Join a League" screen, which
asks for an invite code the new user does not have. Nothing said where a code
comes from or that they could create their own league instead.

**Changed.** The screen now explains that pools are private and points at
league creation.

### 11. The sign-in page advertised a removed feature and taught nothing

`auth-page.tsx` is the only page an unauthenticated visitor sees. Its four
value tiles were "Compete", "Strategy — Near zero needed, but it helps",
"Community — Volatile message boards", and "Fame — Become insanely famous".
Three of the four conveyed nothing about how the game works, and the message
board was removed from the app (per `replit.md`, the messageboard tab was
deleted from `ContentTabs`).

**Changed.** Replaced with three numbered steps that actually teach the game —
pick an underdog, win outright to score the spread, most points wins — plus a
note that the pool is free and needs an invite code. The Google button also
used lucide's `Chrome` icon (a browser, not the identity provider), now
replaced with Google's mark.

### 12. Document head and typography

- No `<title>` — the browser tab and every bookmark read as the bare URL.
- No meta description.
- `maximum-scale=1` in the viewport blocked pinch-zoom, which fails
  [WCAG 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).
- `design_guidelines.md` specifies Inter and Roboto Mono. Neither was ever
  loaded, so the whole app rendered in the browser's default sans stack. The
  guidelines' typography section was effectively fiction.

**Changed.** All four. Fonts are loaded in `index.html` and registered in
`tailwind.config.ts`; table figures use tabular numerals so columns stop
shifting as scores change.

### 13. Duplicate toast on submit

`handleSubmitPick` fired a "Pick Submitted" toast immediately *and* the
mutation's `onSuccess` fired another. Two toasts stacked on every submit, and
the eager one claimed success before the request resolved — so a failed
submission showed both "Pick Submitted" and an error.

**Changed.** Only the `onSuccess` toast remains.

---

## Recommended next, not yet done

Ordered by value per unit of effort.

### Delete the dead pages

Four files are unreachable and one import is unused. They cost nothing at
runtime but they mislead anyone reading the codebase — and two of them contain
copy that looks live.

| File | Status |
| --- | --- |
| `pages/Landing.tsx` (263 lines) | Never imported or routed. Contains a **typo**, "the league messageb oard", and a hotlinked Freepik stock image with a `// Using a placeholder image` comment. |
| `pages/AuthPage.tsx` | Never imported; `App.tsx` uses the lowercase `auth-page.tsx`. Two files, near-identical names, one live. |
| `pages/Welcome.tsx` | Was imported by `App.tsx` but never routed. Import removed in this pass; the file remains. |
| `components/NFLOddsDisplay.tsx` | Never imported. |
| `components/NFLGamesGrid.tsx` | Imported by `Home.tsx` but never rendered. |

I left the files in place rather than deleting them, since removal wasn't part
of this request — but `Landing.tsx` in particular is a trap: it reads like the
marketing page and isn't.

### Retire or finish dark mode

`index.css` defines a complete `.dark` palette, and `tailwind.config.ts` sets
`darkMode: ["class"]`. Nothing ever sets the class, and it would break if it
did: components hardcode `bg-white`, `text-gray-900`, `bg-gray-50` throughout,
and `body` is pinned to `bg-gray-50`, overriding the `--background` token.
Either commit to it (migrate the hardcoded colours to tokens, add a toggle) or
delete the block. Half-built theming invites someone to flip the switch and
ship a broken page.

### Move the pick action out of sixteen separate forms

Each card carries its own Submit button. On a phone that means scrolling to
find the button attached to the card you chose. A single sticky bottom bar —
"Your pick: Panthers +6.5 · Submit" — would match the one-pick-per-week model
and matches what `design_guidelines.md` already prescribes ("Save button:
Fixed bottom bar on mobile"). This is the largest remaining UX win and the
only item here that needs real design work rather than an edit.

### Give the countdown seconds, or drop the days

The lock countdown renders `0d 0h 4m` in the last minutes before the deadline
— the highest-stakes moment on the site, displayed at the coarsest resolution.
Show `4m 12s` under an hour, and hide `0d` when it's zero.

### Reconsider the leaderboard column order

Columns run Place → Points → Player. Putting the score before the name is
unusual; readers scan for their own name first. Place → Player → Points reads
more naturally, and `design_guidelines.md` asks for numerical data
right-aligned, which no table currently does.

### Unify the spread chip

The same value appears as a green pill on game cards, a green pill in
`SubmittedPickDisplay` (it was lime until this pass), and a blue pill in
Weekly Picks. One component, one colour.

### Gate the Admin nav item on a role, not an ID

`Header.tsx` shows the Admin link when `user?.id === "42820911"`. A hardcoded
user ID means the link is invisible to any other admin and survives in the
bundle. The app already has `superUserStatus` from
`/api/auth/super-user-status` — use it. Not a visual issue, but it's a
clarity problem for the next person in this file.

### Add a stat-card scan pattern

`WeeklyPicks` renders four stat cards in four different colours (green, blue,
purple, amber), which gives four unrelated metrics equal visual weight and no
reading order. One accent colour with the primary metric emphasised would
scan faster. Two labels were also mismatched with their subtitles and are
fixed above.

---

## Things that are working

Worth keeping as-is:

- The three-way lock model — week deadline, per-game kickoff, archived league
  — is genuinely correct, and the failure states are all handled. Most pools
  get this wrong.
- Hiding everyone's picks until lock, with an explanation of *why* ("keeps the
  competition fair"), is exactly right.
- The league-load error state in `App.tsx` distinguishes a failed request from
  an empty account and offers a retry. That's a distinction most apps miss.
- Per-league nicknames, with the global username shown alongside.
- The archived-league and inactive-member banners explain both the state and
  the remedy.
- The mobile tab dropdown and the responsive card/table swap in Weekly Picks
  are well done.

---

## Verification

`tsc` cannot run here: `package-lock.json` pins packages to
`package-firewall.replit.local`, which is unreachable from this environment,
and installing from the public registry was not permitted. Every modified file
was instead parsed with a standalone `tsc` (`--noResolve`) and is
syntactically clean; changes are copy, class-name, and small JSX-structure
edits. **Run `npm run check` and load the app before merging** — in
particular the pick flow on `Home.tsx`, which took the most structural edits.
