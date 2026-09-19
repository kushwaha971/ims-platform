import nextJest from 'next/jest.js';

import type { Config } from 'jest';

/**
 * Part 19 §19.14.6 — the `test` job. Coverage floors live on the PURE layers
 * (view-model, utils, validation, redux), where coverage is meaningful; there
 * is deliberately no floor on components, because a coverage target on
 * components buys shallow render tests.
 */
const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupTests.ts'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: {
    // lucide-react's "browser" condition is ESM, which jest's CJS runtime
    // cannot parse. Its own CommonJS build is the same icons (R-P-5 still
    // applies: application code imports icons individually).
    '^lucide-react$': '<rootDir>/node_modules/lucide-react/dist/cjs/lucide-react.js',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^modules/(.*)$': '<rootDir>/src/modules/$1',
    '^app/(.*)$': '<rootDir>/app/$1',
    '^locales/(.*)$': '<rootDir>/locales/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  // `next build --output standalone` copies package.json into .next, which
  // jest-haste-map then reports as a naming collision.
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  collectCoverageFrom: [
    'src/utils/**/*.ts',
    'src/redux/**/*.ts',
    'src/modules/**/view-model/**/*.ts',
    'src/modules/**/redux/**/*.ts',
  ],
  coverageThreshold: {
    global: { statements: 40, branches: 30, functions: 30, lines: 40 },
  },
};

export default createJestConfig(config);
