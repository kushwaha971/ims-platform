'use client';

import { createContext, useContext } from 'react';

/**
 * docs/mobile-redesign/04 §6.1 — where an action button is being drawn.
 *
 * A page header's actions are `UbButton`s and `UbActionLink`s written once by
 * the screen (and some, like Import and Export, by shared feature components).
 * On a phone they move into a ⋯ sheet, where a 32 px icon square is the wrong
 * shape: there they are full-width rows WITH their words (audit finding A3).
 * Rather than every screen writing its actions twice, the buttons read this
 * and draw themselves as rows inside `UbActionSheet`. Everywhere else the
 * default is `inline`, so nothing outside a sheet changes by a pixel.
 */
export type UbActionPresentation = 'inline' | 'sheet';

export const UbActionPresentationContext = createContext<UbActionPresentation>('inline');

export const useUbActionPresentation = (): UbActionPresentation =>
  useContext(UbActionPresentationContext);

/** A button or action link drawn as a row of a ⋯ sheet. */
export const SHEET_ROW_CLASSES =
  'h-14 min-h-14 w-full justify-start gap-4 rounded-none px-4 text-[16px] font-medium ' +
  'border-0 bg-transparent text-text-primary shadow-none hover:bg-surface-hover ' +
  '[&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-text-secondary';
