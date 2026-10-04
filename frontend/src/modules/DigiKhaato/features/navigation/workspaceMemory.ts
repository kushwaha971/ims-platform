'use client';

import { useSyncExternalStore } from 'react';

import type { Workspace } from './sidebarConfig';

/**
 * The workspace a person last worked in, per business, in this browser.
 *
 * A convenience and nothing more: Settings and Team belong to every workspace,
 * so opening them must not change the menu, and the only way to know which one
 * to keep showing is to remember. Lost storage costs one tap on the switcher.
 * Every access is guarded — a private window or blocked storage throws.
 */
const KEY = 'ub_workspace';
const listeners = new Set<() => void>();

const readAll = (): Record<string, string> => {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
};

let snapshot: string | null = null;
const read = (): string => {
  snapshot ??= JSON.stringify(readAll());
  return snapshot;
};

export const rememberWorkspace = (tenantId: string, workspace: Workspace): void => {
  const all = readAll();
  if (all[tenantId] === workspace) return;
  all[tenantId] = workspace;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: the menu still follows the page that is open.
  }
  snapshot = JSON.stringify(all);
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The remembered workspace for this business, or null. */
export const useRememberedWorkspace = (tenantId: string | null): string | null => {
  const all = useSyncExternalStore(subscribe, read, () => '{}');
  if (!tenantId) return null;
  return (JSON.parse(all) as Record<string, string>)[tenantId] ?? null;
};

/** Tests only: forget the cached snapshot after touching storage directly. */
export const resetWorkspaceMemory = (): void => {
  snapshot = null;
};
