import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * R-S-7 — `cn()` merges; class strings are never concatenated.
 *
 * `clsx` resolves conditionals, `tailwind-merge` resolves conflicts so that a
 * caller's `className` genuinely wins over a component's default rather than
 * landing in a coin-toss decided by stylesheet order.
 */
export const cn = (...inputs: readonly ClassValue[]): string => twMerge(clsx(inputs));
