export function macronizeCall(input: string): string {
  return `/api/macronize/${input}`;
}

export function lsCall(entry: string): string {
  return `/api/dicts/ls/${entry}`;
}
