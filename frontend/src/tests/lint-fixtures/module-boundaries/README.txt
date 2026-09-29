Planted lint fixtures for the module-boundary zones (A11, T-PLT-X14-2).

Each *.fixture file is copied by src/tests/moduleBoundaryLintRule.test.ts to the
path its `// @lint-at:` header names, under src/modules/DigiKhaato/features/ —
INSIDE an engine or vertical folder, because the zones key on those folders —
linted with the real eslint.config.mjs, and deleted again, together with any
feature folder the run had to create. The extension keeps them out of tsc,
eslint and jest while they sit here.

`// @expect: fire` means `import/no-restricted-paths` must report the module
boundary on this file; `// @expect: none` means it must not (the controls, and
the target files the bad imports point at, which must resolve for the rule to
see them).
