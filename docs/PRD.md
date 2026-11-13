# DevPulse product requirements

## Product

DevPulse is a focused workspace for developers who maintain or follow multiple GitHub repositories. It brings account-level repository discovery, organization, activity, and portfolio analytics into one responsive interface.

## Audience and user needs

- Independent developers need a concise view of their public projects and activity.
- Students and early-career developers need an easy way to find, compare, and organize repositories.
- Maintainers need to scan updates across a portfolio without implying that DevPulse can change GitHub settings unless it has the correct permission.

## Product principles

1. Treat GitHub as the source of truth for repository metadata.
2. Label local-only organization (favorites and collections) separately from GitHub state.
3. Never invent statistics or historical coverage.
4. Request the least access that supports a useful first release.
5. Keep the interface usable at narrow widths and with reduced motion.

## First release

### Included

- Public product landing page and GitHub sign-in.
- Server-side OAuth callback, state validation, encrypted token storage, and opaque secure session cookie.
- User profile retrieval and initial synchronization of public repositories.
- Repository browse, query, sort, visibility/fork/archive/language/favorite filters, grid/list views, and details.
- Local favorites and named collections.
- Dashboard totals derived from synchronized repository records.
- Public activity feed with the GitHub API's documented retention limits clearly stated.
- Explore page using public GitHub repository search.
- Theme preference, responsive sidebar, settings, disconnect, and local-data removal.

### Explicitly deferred

- Private repositories: the OAuth App `repo` permission allows write access. A GitHub App with read-only repository permissions is the planned route.
- Repository write operations, bulk changes, and account-wide notifications.
- GitHub contribution calendar, commit frequency claims, and long-range analytics until suitable source data and calculation definitions are implemented.
- Background workers, Redis, and distributed synchronization. They are unnecessary for the first single-user-volume release.
- Billing, teams, and multi-account workspaces.

## Core journeys

1. Visitor learns what DevPulse does and authorizes GitHub with a clear permission explanation.
2. DevPulse retrieves the user's profile and public repositories, reports sync errors, and opens the workspace.
3. User searches and filters repositories, opens GitHub, copies clone URLs, favorites projects, or assigns them to a local collection.
4. User reviews portfolio totals, primary-language counts, and recent public activity with source and coverage labels.
5. User disconnects; local account data and credentials are removed.

## Success criteria

- A fresh account sees a genuine empty state before authorization and real API data after synchronization.
- No browser storage contains GitHub access tokens.
- Search, filter, sort, favorite, collection, and theme interactions work with keyboard and touch input.
- API failures and rate limits produce actionable feedback without replacing unavailable values with zero.
- Desktop, tablet, and mobile layouts have no horizontal overflow.

## Product constraints

- OAuth client credentials must be configured by the deployer.
- Public activity is delayed and retained only for a short window by GitHub; it cannot support a complete historical activity chart.
- Repository primary language is not equivalent to language-by-code-size distribution or time spent programming.
- Public repository visibility and public-only access must be communicated in the interface.
