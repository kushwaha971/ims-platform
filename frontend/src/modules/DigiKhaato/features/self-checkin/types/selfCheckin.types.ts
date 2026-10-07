/** What the student's phone shows after checking in: their own name and place only. */
export interface SelfCheckInResult {
  readonly firstName: string;
  readonly already: boolean;
  readonly seat: string | null;
  readonly shift: string | null;
  readonly warning: string | null;
}
