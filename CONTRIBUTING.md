# Contributing

DevPulse is early-stage and the API, product scope, and database model may evolve. Start with a focused issue or pull request and avoid introducing repository write permissions without a security review.

## Development

Follow the setup steps in [README.md](README.md). Keep frontend server state in TanStack Query, API behavior in FastAPI services/routes, and GitHub calls in the GitHub integration layer. Do not commit `.env`, databases, tokens, or generated build files.

## Changes

- Describe user-visible behavior and any permission implications.
- Keep unavailable data distinct from zero.
- Add or update tests when behavior changes.
- Run the frontend production build and backend test suite before submitting.
- Do not claim full historical coverage from GitHub event data.

## Pull requests

Use the pull-request template. Include screenshots for visual changes and explain any changes to OAuth scope, stored data, or production configuration.
