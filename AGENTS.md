# AGENTS.md

Working rules for AI agents in this repository. Keep this file short; remove
anything that stops being true.

## Use the Superpowers skills

- Every software-development task goes through the Superpowers skills:
  `superpowers:brainstorming` before new features or behaviour changes,
  `superpowers:writing-plans` for multi-step work,
  `superpowers:subagent-driven-development` or `superpowers:executing-plans`
  to implement a plan, `superpowers:systematic-debugging` for bugs,
  `superpowers:verification-before-completion` before claiming anything is
  done, and `superpowers:finishing-a-development-branch` to integrate.
- If a skill plausibly applies, invoke it. Do not work around it.

## Test-driven development

- Follow `superpowers:test-driven-development`: write the failing test,
  run it and watch it fail, implement the minimum, run it and watch it pass.
- Tests are vitest, flat in `test/`. Fake pools implement
  `{ query(text, values?) }` structurally; never mock `pg` internals.
- Before every commit: `npm test`, `npm run typecheck`, and for changes that
  touch startup or `src/storage/`, the dev-runner smoke test
  `MAPCODE_DB_URL= MAPCODE_BORDERS_PATH=test/resources/borders-test.fgb timeout 30 npm run dev`
  must print the "listening" line.
- Real-Postgres tests live in `test/db-integration.test.ts`, gated on
  `TEST_DB_URL`; run them when touching SQL or the schema.

## Always bump the version

- After building a feature or implementing a fix, bump the version before
  finishing: features → minor, fixes → patch.
- The version lives in four places and they must agree:
  `package.json`, `package-lock.json` (top-level `version` and
  `packages[""].version`), and `test/package-config.test.ts`.
- Commit the bump on its own with the subject `bumped version`.

## Conventions

- Node ≥ 22.6, ESM, `--experimental-strip-types`: imports carry explicit `.ts`
  extensions; no TypeScript-only runtime syntax such as parameter
  properties or enums.
- Every source and test file starts with the repository's 13-line
  Apache-2.0 header (copy it from any neighbour).
- Commit subjects are short and imperative with no conventional-commit
  prefix. Never `git push` unless explicitly asked.
- `MAPCODE_DB_URL` contains a password: never log it. Raw database error
  text never reaches a response body.
- The event log (`mapcode_request`) is append-only: no `DELETE`,
  `TRUNCATE`, or retention job, ever.
- `docs/` is git-ignored; plans and specs live there and are not committed.
