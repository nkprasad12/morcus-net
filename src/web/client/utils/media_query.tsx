import { useEffect, useMemo, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const mediaQuery = useMemo(() => window.matchMedia(query), [query]);
  const [result, setResult] = useState(mediaQuery.matches);

  useEffect(() => {
    const listener = () => setResult(mediaQuery.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [mediaQuery]);

  return result;
}
