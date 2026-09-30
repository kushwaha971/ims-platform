# Continuation prompt: give this to the next agent (or a colleague's Claude)

Paste everything below the line into a fresh Claude session. It works from any Claude account. Before you paste it, connect the folder `~/Projects/ims-platform` on this Mac, and ideally `~/digikhaato` as well.

---

You are continuing the **YourKhata platform build**. YourKhata is a multi-tenant records platform for Indian businesses: Django 5 + DRF + PostgreSQL 16 on the backend, Next.js 16 + React 19 + TypeScript on the frontend. Another agent built it up to this point. Continue exactly where it stopped, in the same way and to the same quality.

## 0. Where the code is (single source of truth)

- The git repo on the owner's Mac, `~/Projects/ims-platform`, branch `main`, is authoritative. The latest commit should be the handoff for Wave A (see `HANDOFF.md` §8i). Check with `git log --oneline -3`.
- If you run in a cloud sandbox, bring the repo in without changing the Mac:
  1. On the Mac, run `git bundle create ~/digikhaato/sync/<name>.bundle main`.
  2. Copy that bundle to your sandbox and clone from it.
- To return your work, reverse it:
  1. Write a bundle of your new commits to `~/digikhaato/sync/`, using a NEW file name each time.
  2. On the Mac, run `git fetch <bundle> main:refs/remotes/cloud/main && git merge --ff-only cloud/main`.
  3. Verify with `git status` and `git log`.
- If you run directly on the Mac (Claude Code in that folder), commit on `main` there.
- **The owner runs `git push` themselves.** Never ask for, enter or handle GitHub credentials.
- Never commit the demo films (`frontend/public/media/landing/demo-*`) or the `videos/` folder. Both are git-ignored on purpose.
- The Claude Project "IMS" has older copies of some docs. The repo is newer; trust the repo.

## 1. Read first, in this order (binding)

1. `CLAUDE.md`: conventions and constraints. It explains the "review, build, look, report" loop, and it records that a fix without a test that fails first is not finished.
2. `HANDOFF.md` §8i (the current state), then §8a–§8h for history.
3. `docs/platform/00-platform-vision.md`: modules, rules and phase order.
4. `docs/platform/STATUS.md`
5. `docs/platform/10-architecture.md`. §17 has the 72 resolutions and §18 the Wave A open questions.
6. `docs/platform/11-contracts.md`: v1, FINAL. Do not deviate from it.
7. `docs/platform/12-implementation-plan.md`: waves, tracks, file ownership, migration numbering and gates.
8. `docs/platform/13-owner-questions.md`: every question has a default. Use the default unless the owner answered.
9. The FRD for the work at hand in `docs/platform/frd/`: `library.md`, `00-core-and-engines.md` Parts B and C, and later `gym.md`, `lending.md` and `hospitality.md`.

## 2. State and next work

**Done:**
- Phase 1: landing page, SEO, videos.
- Phase 2: research.
- Phase 3: FRDs, architecture and contracts.
- **Wave A**: all 16 core-foundation tasks, gated and green.

**Next: Wave B.** Plan §3 has the tasks.
1. First, have the architecture owner (you, acting in that role, recording ADR entries in `docs/38-architecture-decision-records.md`) decide the two items in 10-architecture §18: **W-F3** (one `src/modules/registrations.ts` for frontend registrations, listed in `sideEffects`) and **W-G1** (lazy per-module invalidation entries). Commit that decision.
2. Then build **Library** (LIB-01…14), the **dues engine** (DUE-xx) and the **attendance engine** (ATT-xx), in up to three parallel tracks. Each track is its own git worktree: run `git worktree add ../wt/<track> -b wave-b/<track> main`, then `bash scripts/worktree-bootstrap.sh <track>` inside it, and export the `UB_TEST_DB_NAME` it prints.
3. Then run the Wave B gate (plan §3.4), in the same form as the Wave A gate recorded in `docs/platform/progress/wave-a-gate.md`.

**After that:** Wave C (Gym, then Lending), then Wave D (bookings engine, then Hospitality). Each wave ends with a gate and a sync.

## 3. How every task is done

1. **Review.** Read the FRD section and the real code. Write a short design note in `docs/platform/progress/<wave>-<track>.md`. The track owns that file.
2. **Tests first.** Each test gets a docstring naming the defect it prevents.
3. **Implement, then run the targeted gates:**
   - the app's pytest, plus `tests/architecture`;
   - `python manage.py makemigrations --check --dry-run`;
   - `npx tsc --noEmit`;
   - eslint and prettier on the changed files;
   - jest on the touched paths plus `src/tests` (`--maxWorkers=1`);
   - after any locale change, `node frontend/scripts/split-locales.mjs && node frontend/scripts/check-locales.mjs`.
4. **Look.** Screenshot the new screens at 390 and 1280 px, in English and Hindi, light and dark. Measure overflow the way CLAUDE.md describes. Fix what you see.
5. **Independent QA.** Use a separate agent if you can spawn one. Otherwise do an adversarial pass and say so. Fix every finding with a test.
6. **Merge.** Rebase on `main`, rerun the gates, then `git merge --ff-only`. Never force-push. Never rewrite `main`. Never use `makemigrations --merge`. Keep to the migration reservations.
7. **Commit messages** start with the task id (e.g. `LIB-02: …`), explain *why* in prose, and end with a Co-Authored-By line for the model you are.

## 4. Constraints (non-negotiable)

- No new dependencies or services without an ADR (ADR-021). No Celery or Redis; jobs are `platform_job` plus `run_scheduler`.
- Identity is email and password; nothing is emailed or sent by SMS.
- The frontend follows the BrandHub patterns: Redux Toolkit `createAsyncThunk`, React Hook Form, Yup, and the `api/<x>Service.ts` layer. Feature code uses design-system components only, never raw `div`/`span`/`h1`. Every string exists in English and Hindi.
- Verticals never import each other. They reach core only through registries and seams.
- Customer documents carry only the tenant's name, never "YourKhata" or the domain.
- Legal guardrails:
  - Lending is record-keeping only.
  - ID numbers are stored as their type plus the last four characters only.
  - Reminders keep the lending time window and cap.
- The in-app UI never shows an unbuilt feature or a "Soon" label. A new module stays behind `UNRELEASED_MODULES` until it is released.

## 5. Sync and handoff (after every task, and before you stop for any reason)

1. Commit.
2. Update `docs/platform/STATUS.md` and add a new `HANDOFF.md` §8x at the top of §8. It must say what was done, commits, files, gate numbers, known issues, the next task, and the verify commands.
3. Make sure the Mac repo has it: commit there directly, or use the bundle flow in §0.
4. Verify on the Mac with `git status` (clean) and `git log --oneline -1` (your commit).
5. If you are close to a usage limit, save unfinished work as a `WIP` commit on the track branch, sync that branch too, and write the exact next steps in the progress file.

**Commands to verify the whole project:**

```
cd backend && python3 -m pytest -q
cd frontend && npm run type-check && npm run lint && npm test
cd frontend && npm run i18n:split && npm run i18n:check
cd frontend && npm run build && npm run bundle:check
./e2e/serve-api.sh && ./e2e/serve.sh      # live stack, see RUNNING.md
cd e2e && node run-regression.mjs -j 3
```
