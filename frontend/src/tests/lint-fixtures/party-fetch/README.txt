Deliberately-bad lint fixtures for the party-fetch fence (Sprint 3 §32.6.7).

Each *.fixture file is copied by src/tests/partyFetchLintRule.test.ts to a
throwaway feature path (the rule keys on WHERE a file lives), linted with the
real eslint.config.mjs, and deleted again. The extension keeps them out of
tsc, eslint and jest while they sit here.

The first line of every fixture names the path it is linted AT and the rule
ids it must produce. Keep that header when editing one.
