# Platform expansion: status

Owner direction of 29 Sep 2026: [00-platform-vision.md](00-platform-vision.md). The phases run strictly in order.

| # | Phase | Status | Output |
|---|---|---|---|
| 1 | Analyse the application; update the landing page to the platform vision | **Built, awaiting owner review** | `01-current-capabilities.md`; landing page (`features/landing`); `config/modules.ts` |
| 2 | Research the modules: lending, library, gym, hospitality, candidates | Not started | `research/*.md` |
| 3 | Module documentation (FRDs) | Not started | `frd/*.md` |
| 4 | Architecture review and reuse map | Not started | `10-architecture.md`, ADRs |
| 5 | Implementation | Not started | |
| 6 | QA, fixes, integration | Not started | |
| 7 | Final sync and handoff | Not started | |

## Log

- **29 Sep:** Vision and rules accepted (CR-2026-09-29-PLATFORM-A). Existing module mechanism confirmed for reuse: `ModuleCode`, `tenant.enabled_modules`, `MODULE_DEPENDENCIES`, `_ModuleEnabled`.
- **29 Sep, Phase 1 (CR-2026-09-29-PLATFORM-B):**
  - `01-current-capabilities.md` inventories what is live, from the code. It is now the source of truth for landing-page claims. It found one false claim (statement share links), which is now corrected.
  - The landing page is repositioned to "one platform, many modules, shared core": hero → module map (#platform) → module cards (#modules) → Shop & billing explorer (#features) → Who it's for → also included → how it works → pricing → FAQ.
  - Every module's status comes from `features/landing/config/modules.ts`, and a test holds it to §2 of the vision doc. Shop & billing is live; Lending & collections, Library, Gym & fitness and Hotel & stays are planned. Planned modules have text only: no media, demo, dates or CTA, and their words appear only inside planned scopes (tested).
  - "kirana" and English "udhaar"/"khata" are gone from the landing copy and metadata (tested).
  - Pricing is unchanged; a line says module pricing is decided at launch.
  - Open for the owner: the recordings still show the demo business "Sharma Kirana Store"; the copy needs review; the `/` bundle budget was re-baselined.
