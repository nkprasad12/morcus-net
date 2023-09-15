const ENTRY_OPEN = "<entryFree ";
const ENTRY_CLOSE = "</entryFree>";

export function extractEntries(xmlContents: string): string[] {
  const lines = xmlContents.split("\n");
  const entries = [];
  let partial = "";

  for (const line of lines) {
    const openIndex = line.indexOf(ENTRY_OPEN);
    const closeIndex = line.indexOf(ENTRY_CLOSE);

    const hasOpen = openIndex !== -1;
    const hasClose = closeIndex !== -1;
    const hasPartial = partial.length > 0;

    if (hasOpen && !hasClose) {
      console.debug("Got open without close");
      console.debug(line.substring(0, 50));
    }
    if (hasOpen) {
      const beforeOpen = line.substring(0, openIndex);
      if (beforeOpen.trim().length !== 0) {
        throw new Error("Got non-whitespace before open.");
      }
    }
    if (hasClose) {
      const afterClose = line.substring(closeIndex + ENTRY_CLOSE.length);
      if (afterClose.trim().length !== 0) {
        throw new Error("Got non-whitespace after close.");
      }
    }
    if (hasOpen && hasPartial) {
      throw new Error("Got unclosed entry.");
    }
    if (!hasOpen && hasClose && !hasPartial) {
      throw new Error("Got unopened entry.");
    }
    if (!hasOpen && !hasClose && !hasPartial) {
      // We're in a non-entry block.
      continue;
    }

    if (hasOpen || hasPartial) {
      partial += line + "\n";
    }
    if (hasClose) {
      entries.push(partial.trim());
      partial = "";
    }
  }

  if (partial.length > 0) {
    throw new Error("Got unclosed entry.");
  }
  return entries;
}
