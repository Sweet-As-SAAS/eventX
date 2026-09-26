# Baseline (Phase 1)

Base `origin/main` @ `3f3a1aa`, existing `node_modules`, 26 Sep 2026 20:20 NZST.

| Check | Result |
| --- | --- |
| `npm test` | PASS, 12 files, 83 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | FAIL: `npm error Missing script: "lint"` (no ESLint in the repo) |
| `npm run build` | PASS (32 routes) |
| E2E | MISSING: no Playwright installed, no specs |

## Failures verbatim

```
## lint
npm error Missing script: "lint"
npm error
npm error Did you mean this?
npm error   npm link # Symlink a package folder
```

## Also recorded

The newer branch `d/documents-ux` @ `ecf7b85` fails typecheck and build on its own:

```
app/(screens)/events/[id]/profile/page.tsx(9,29): error TS2307: Cannot find module '@/components/people' or its corresponding type declarations.
Error: Turbopack build failed with 1 error:
./app/(screens)/events/[id]/profile/page.tsx:9:1
Error: Module not found: Can't resolve '@/components/people'
```

`components/people.ts` exists only as an uncommitted file in the `hostready-docs` worktree, together with an uncommitted `lib/schemas.ts` change. That is why the audit branch starts from `main`.
