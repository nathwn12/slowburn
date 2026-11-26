# AGENTS.md - slowburn landmines

## IPC and UI placement
- Add Tauri IPC calls only in `src/lib/bridge-*.ts`; never call `invoke` directly from React components.
- `src/lib/player.ts` is a singleton EventEmitter with heavy side effects; modify with care.
- `src/elements` holds business-agnostic primitives; `src/components` and `src/routes` hold business logic.
- Prefer URL state over Zustand unless persistence is required.

## Backend landmines
- SQLite migrations under `src-tauri/src/libs/migrations/` are frozen: never edit an existing `.sql` file.
- Prefer `DEFAULT` values over backfills when adding columns - users rescan their library.
- A new Tauri command must be registered in `src-tauri/build.rs` and allowed in `src-tauri/capabilities/main.json`; omitting either fails at runtime, not at compile time.
- Desktop integrations (file associations, sleep blocker) belong in `src-tauri/src/plugins` unless a documented exception exists.
- Default Rust code lives in `src-tauri/src/libs`.

## Generated output
- `src/generated` is committed generated code: never hand-edit; regenerate with the `gen:types` task.
- A Rust struct exposed through `ts-rs` requires `gen:types` followed by a commit of the regenerated output.
- Changing route configuration requires regenerating the route tree via the `build` task.

## Toolchain caveat
- Use `vp` for package and tool commands; do not call pnpm, npm, yarn, tsc or install Vitest, Oxlint, Oxfmt or tsdown directly - Vite+ wraps them and the wrappers are not listed in `package.json`.
- `vp check` is the only supported type check; `tsc --noEmit` is not.
