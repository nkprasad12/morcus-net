import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [result, setResult] = useState(false);

  useEffect(() => {
    const matcher = window.matchMedia(query);
    setResult(matcher.matches);
    const listener = () => setResult(matcher.matches);
    matcher.addEventListener("change", listener);
    return () => matcher.removeEventListener("change", listener);
  }, [query]);

  return result;
}
