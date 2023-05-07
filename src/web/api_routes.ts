export function macronizeCall(): string {
  return `/api/macronize/`;
}

export function lsCall(entry: string): string {
  return `/api/dicts/ls/${entry}`;
}

export function entriesByPrefix(prefix: string): string {
  return `/api/dicts/entriesByPrefix/${prefix}`;
}

export function report(): string {
  return `/api/report/`;
}
