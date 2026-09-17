# Contributing

Implementation branches start from the latest `origin/dev` and target `dev` through a pull request. Only `dev` targets `main`. Do not push directly to either integration branch.

Use a dedicated worktree under `wanzila-worktrees` and leave the canonical checkout unchanged. Use branch names such as `feature/web/<scope>`, `fix/<scope>` or `docs/<scope>`.

Run `npm ci`, `npm run typecheck` and `npm run build` before a PR. Verify the search, pharmacy detail and OSRM route in a mobile browser. The repository intentionally has no automated test suite for this MVP. CI keeps the branch policy, dependency audit, typecheck and build checks.
