/**
 * @returns The URL decoded value of the current hash path value.
 */
export function getHash(): string {
  const hash = window.location.hash;
  if (hash.length === 0) {
    return "";
  }
  return decodeURI(hash.substring(1));
}
