import { clsx, type ClassValue } from 'clsx';
import { createTailwindMerge, getDefaultConfig } from 'tailwind-merge';

/**
 * The radius names `tailwind.config.js` adds under `theme.extend.borderRadius`
 * beyond tailwind's own t-shirt sizes. Stock tailwind-merge does not know them,
 * so it treated `rounded-pill` as an unrelated class and kept `rounded-sm`
 * beside it — the skeleton avatar "disc" drew square (UAT D-1). Registering
 * them in the theme's `borderRadius` group makes every `rounded-*`,
 * `rounded-t-*`, `rounded-tl-*`, … override resolve as one conflict group.
 * Add a name here in the same change that adds it to the tailwind config.
 */
const CUSTOM_RADII = ['xs', 'pill', 'card', 'control'] as const;

/* The same config `extendTailwindMerge({ extend: { theme: { borderRadius } } })`
   builds — the stock radii with ours appended — written out, because this
   module is in the shell every route downloads and `extendTailwindMerge`
   carries tailwind-merge's general `mergeConfigs` walker (~0.15 KB gz) to do
   one array concat. */
const twMerge = createTailwindMerge(() => {
  const config = getDefaultConfig();
  return {
    ...config,
    theme: { ...config.theme, borderRadius: [...config.theme.borderRadius, ...CUSTOM_RADII] },
  };
});

/**
 * R-S-7 — `cn()` merges; class strings are never concatenated.
 *
 * `clsx` resolves conditionals, `tailwind-merge` resolves conflicts so that a
 * caller's `className` genuinely wins over a component's default rather than
 * landing in a coin-toss decided by stylesheet order.
 */
export const cn = (...inputs: readonly ClassValue[]): string => twMerge(clsx(inputs));
