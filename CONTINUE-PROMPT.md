# Continuation prompt: paste this into a new agent

Copy everything below the line into a fresh Claude session. Work in the owner's repo (`~/Projects/ims-platform` on the Mac, or a clone of it).

---

You are continuing the **YourKhata platform build**. The previous session stopped at a usage limit on 30 Sep 2026. Continue exactly where it stopped, in the same way.

## 1. Get the state

1. Read, in this order:
   - `CLAUDE.md`
   - `HANDOFF.md`, especially **§8h**, which is the current state
   - `docs/platform/STATUS.md`
   - `docs/platform/00-platform-vision.md`
   - `docs/platform/12-implementation-plan.md` §1–§2
2. Unfinished work sits on three **track branches**. They are not merged, and each ends in a commit titled `WIP (track x)`:

   | Branch | Task in progress | Progress file (on that branch) |
   |---|---|---|
   | `wave-a/track-m` | **A5**, the document port | `docs/platform/progress/wave-a-track-m.md` |
   | `wave-a/track-p` | **A6** (party roles and relations), then **A7** (reminders) | `docs/platform/progress/wave-a-track-p.md` |
   | `wave-a/track-f` | **A4b**, held deposits | `docs/platform/progress/wave-a-track-f.md` |

   `main` has the other 13 Wave A tasks merged (A1, A2, A4a, A8, A9a, A9b, A10, A11, A12, A13, A14, A15, A16).
3. Make one git worktree per track and continue each in its own worktree:

   ```
   git worktree add ../wt/track-m wave-a/track-m
   cd ../wt/track-m && bash scripts/worktree-bootstrap.sh track-m
   ```

   Then export the `UB_TEST_DB_NAME` it prints. Do the same for track-p and track-f. Read the progress file on each branch first. Undo the WIP commit with `git reset --soft HEAD~1`, then finish the task.

## 2. Rules (binding)

The full set is in CLAUDE.md, the vision doc §3–§5 and the plan §1. The main ones:

- **Order of work.** Build to the FRDs in `docs/platform/frd/` and **`docs/platform/11-contracts.md` v1 (FINAL)**. Only the architecture owner changes contracts; record a gap as a question in the progress file.
- **Every task.** Review the FRD and the code → write the tests first (with docstrings) → implement → run the targeted gates:
  - the app's pytest, plus `tests/architecture`;
  - `makemigrations --check --dry-run`;
  - `tsc`;
  - eslint and prettier on changed files;
  - jest on the touched paths **plus `src/tests`** with `--maxWorkers=1`.

  Then an independent QA pass (a separate agent if you can spawn one), fix what it finds, rebase on main, and `git merge --ff-only` into main. Never force-push, never rewrite main, never `makemigrations --merge`.
- **Ownership.** Obey file ownership and the migration reservations in plan §1.3–§1.4. Shared hot files are append-only, inside a block headed `# ── <task id> ──`.
- **Commits.** Messages start with the task id (`A5: …`), explain *why* in prose, and end with the Co-Authored-By and Claude-Session lines the repo already uses.
- **Constraints:**
  - no new dependencies (ADR-021);
  - no raw host elements in frontend feature code;
  - English and Hindi for every string;
  - owner UI rules in `docs/DESIGN-SYSTEM.md`;
  - customer documents show only the tenant's name.
- **Open handovers:**
  - The `tenant_settings.py` wiring to `schema.specs_for`/`spec_for` (Track F's A10 → Track P). The exact patch is in the track-f progress file under A10, "Handed to Track P".
  - Check that `src/tests/invalidation.registry.test.ts` is green on main (Track P says A9b fixed it).
- **Owner questions** are in `docs/platform/13-owner-questions.md`. Use the listed **defaults** unless the owner answered.

## 3. After Wave A

1. **Wave A gate** (plan §2):
   - full backend pytest;
   - full jest, lint, i18n, build, bundle:check;
   - the full e2e regression `node e2e/run-regression.mjs -j 3` on a live stack (see RUNNING.md);
   - an independent QA pass over the ledger, payments, sales void and deposits screens at 390 and 1280 px in English and Hindi;
   - move the CR drafts from the progress files into `docs/CR-LOG.md`.
2. **Wave B:** Library (`docs/platform/frd/library.md`, the owner's priority) plus the dues and attendance engines (FRD 00 Parts B and C).
3. **Wave C:** Gym, then Lending.
4. **Wave D:** bookings engine, then Hospitality.

## 4. Sync (mandatory after every task or phase)

The owner must always have everything locally.

- Commit, then update `HANDOFF.md` (new §8x) and `docs/platform/STATUS.md`.
- If you work in the Mac repo itself, commit on `main` there. If you work in a cloud copy, ship a git bundle (`git bundle create <file> main wave-a/track-m wave-a/track-p wave-a/track-f ^<last-synced-main>`) to `~/digikhaato/sync/` and fast-forward the Mac repo from it.
- The owner runs `git push` themselves. Never handle their GitHub credentials.
- Never commit the demo films (`frontend/public/media/landing/demo-*`) or the `videos/` folder.

Before you stop for any reason, update the progress files and HANDOFF with exact next steps, and sync.
