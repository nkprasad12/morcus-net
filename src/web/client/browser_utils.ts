const ERROR_MESSAGE = "Error: please try again later.";

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
