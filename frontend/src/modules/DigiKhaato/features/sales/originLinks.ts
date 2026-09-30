/**
 * A5 (FRD 00 PLT-X05 §7) — where an origin badge links to, keyed by origin type.
 *
 * A document the document port issued names the module record it was issued for
 * (`origin: {module, type, id}`). Each module that registers an origin type on the server adds
 * its entry here: a path builder only, no component and no `dynamic()` — sales must not import a
 * module's code (10-architecture §6 rule 7), and a path is all a link needs. Empty until the
 * first module (gym, hospitality, the dues engine) lands; an origin with no entry shows its
 * badge unlinked.
 *
 * The same map decides the list's origin chip: a module appears as a filter only when it has an
 * entry here AND is enabled for the tenant.
 */

export interface OriginLink {
  /** The module code the origin type belongs to (`origin_module` on the server). */
  readonly module: string;
  readonly path: (originId: string) => string;
}

export const ORIGIN_LINKS: Readonly<Record<string, OriginLink>> = {};

export const originHref = (
  origin: { readonly type: string; readonly id: string },
  links: Readonly<Record<string, OriginLink>> = ORIGIN_LINKS
): string | null => links[origin.type]?.path(origin.id) ?? null;

/** The modules the invoice list may offer as an origin filter, in a stable order. */
export const originFilterModules = (
  enabled: (module: string) => boolean,
  links: Readonly<Record<string, OriginLink>> = ORIGIN_LINKS
): string[] => [...new Set(Object.values(links).map((link) => link.module))].filter(enabled).sort();
