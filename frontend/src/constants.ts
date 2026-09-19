/**
 * Part 19 §19.14.1 — the ONLY file in the application that reads `process.env`.
 * `grep -r "process.env" src/ app/` returning anything else is a defect.
 *
 * Validation happens at module load so a missing variable fails loudly at boot
 * rather than as a mysterious 404 three screens later.
 */
import type { Locale } from 'src/types/domain.types';

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing required env var ${name}. See .env.local.example.`);
  return value;
};

export const API_BASE_URL: string = required(
  'NEXT_PUBLIC_API_BASE_URL',
  process.env.NEXT_PUBLIC_API_BASE_URL
);

export const APP_NAME: string = process.env.NEXT_PUBLIC_APP_NAME ?? 'UdhaarBook';
export const DEFAULT_LOCALE: Locale = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en') as Locale;
export const IS_PRODUCTION: boolean = process.env.NEXT_PUBLIC_ENV === 'production';
export const SW_ENABLED: boolean = process.env.NEXT_PUBLIC_SW_ENABLED === 'true';
export const ANALYTICS_ENABLED: boolean = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';
export const COMMIT_SHA: string = process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev';

/** Money and quantity ceilings; strings, because money is a string end to end. */
export const MAX_AMOUNT = '99999999.99';
export const MAX_QTY = '9999999.999';

export const SEARCH_DEBOUNCE_MS = 300;
export const AUTOSAVE_DEBOUNCE_MS = 500;

/** Default tenant timezone until `/auth/me` says otherwise (ADR-011). */
export const DEFAULT_TENANT_TIMEZONE = 'Asia/Kolkata';

/** Request timeout; exports and uploads are the reason it is not lower. */
export const API_TIMEOUT_MS = 30_000;

/**
 * PLT-02 §10 / Part 27 §27.4.2 — the password floors the SERVER enforces
 * (`backend/apps/platform_app/services/passwords.py`), stated once so the
 * validator, the strength meter and the hint copy cannot drift apart.
 *
 * Eight characters for an ordinary member; TEN for anyone who holds `owner` or
 * `admin` anywhere. At MVP a self-registered account becomes the owner of the
 * business it creates, so ten is what every sign-up, set and reset screen
 * applies (CR-2026-09-19-A).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_LENGTH_PRIVILEGED = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** The longest address DRF's `EmailField` accepts. */
export const EMAIL_MAX_LENGTH = 254;
