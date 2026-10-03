/**
 * F01 — the library feature's shared types. Each screen's wire and view types
 * arrive with its F-task (F02 settings, F03 catalogue, …); what lives here is
 * what every library list shares.
 */

/** A library list's filter axes: every value a string, as the URL carries them. */
export type LibraryListFilters = Readonly<Record<string, string>>;

/**
 * How one library list's filters travel in the address bar
 * (`useLibraryListUrl`). `closed` names the axes with a fixed vocabulary; a URL
 * value outside it is dropped, never sent to the server.
 */
export interface LibraryListUrlSpec<F extends LibraryListFilters> {
  readonly keys: readonly (keyof F & string)[];
  readonly closed?: Readonly<Partial<Record<keyof F & string, readonly string[]>>>;
}
