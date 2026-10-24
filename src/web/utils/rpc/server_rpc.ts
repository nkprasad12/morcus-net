/** Hooks a dictionary lookup can use to report timing (see `Dictionary`). */
export interface ServerExtras {
  log: (tag: string) => unknown;
}
