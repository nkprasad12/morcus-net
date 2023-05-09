const ERROR_MESSAGE = "Error: please try again later.";

function decodedHash(): string {
  const hash = window.location.hash;
  if (hash.length === 0) {
    return "";
  }
  return decodeURI(hash.substring(1));
}

/**
 * @returns The URL decoded value of the current hash path value.
 */
export function getHash(): string {
  return decodedHash().split("?")[0];
}

/**
 * @returns A map of parameters encoded in the URL.
 */
export function getUrlParams(): Map<string, string> {
  const parts = decodedHash().split("?").slice(1);
  if (parts.length === 0) {
    return new Map<string, string>();
  }
  const result = new Map<string, string>();
  for (const part of parts) {
    const chunks = part.split("=");
    result.set(chunks[0], chunks.slice(1).join("="));
  }
  return result;
}

export async function backendCall(api: string, options?: any): Promise<string> {
  const address = `${location.origin}${api}`;
  try {
    const response = await fetch(address, options);
    if (!response.ok) {
      return ERROR_MESSAGE;
    }
    return await response.text();
  } catch (e) {
    return `${e}`;
  }
}
