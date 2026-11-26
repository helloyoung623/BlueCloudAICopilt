# PPT生成

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is always running on `$PORT` (default 8443). Source changes
are reflected through hot reload.

## Key Files

- `src/main.tsx` - Browser entry point
- `vite.figma.config.ts` - Figma Make wrapper configuration
- `.mise.toml` - Toolchain versions

## Development Workflow

**Never push directly to `main`.** `main` has branch protection: direct pushes are
rejected by GitHub, a pull request is required, and CI must pass before merging.

1. Branch from the latest `main`: `git checkout -b <type>/<description> origin/main`
   (`feat/` `fix/` `chore/` `docs/` `refactor/` `style/`)
2. Make the change.
3. Run `pnpm check` locally — it runs `pnpm test`, `pnpm typecheck` and
   `pnpm build:check` in sequence. All three must pass.
4. Commit, push the branch, open a PR with a plain-language description
   (what changed / why / risk).
5. Wait for the `CI` check (测试 + 类型检查 + 构建) to pass, then merge with squash.

Toolchain: Node 22 + pnpm 10.34.3 (see `.mise.toml`). Use `corepack pnpm@10.34.3` —
a newer pnpm fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. The `pnpm` executable
must be on `PATH`, because `pnpm check` shells out to `pnpm` itself.

Full details, branch protection rules, and known pitfalls: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)

## Project Guidelines

Read and always follow the instructions in the [project guidelines](guidelines/Guidelines.md) unless the user requests otherwise.
