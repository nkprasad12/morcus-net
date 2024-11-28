class WatcherThing {
  private readonly visibleMap = new Map<string, [string, number, number]>();
  private topMostId: string | undefined = undefined;
  readonly observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = entry.target.id;
        if (!entry.isIntersecting) {
          this.visibleMap.delete(id);
          continue;
        }
        const top = entry.intersectionRect.top;
        this.visibleMap.set(id, [id, entry.intersectionRatio, top]);
      }
      let currentTop: [string, number] | undefined = undefined;
      for (const [id, ratio, top] of this.visibleMap.values()) {
        if (
          ratio > 0.25 &&
          top < (currentTop?.[1] ?? Number.POSITIVE_INFINITY)
        ) {
          currentTop = [id, top];
        }
      }
      if (currentTop !== undefined) {
        this.topMostId = currentTop[0];
        localStorage.setItem("FOOO", this.topMostId);
        console.log("Setting: " + this.topMostId);
      }
    },
    {
      threshold: [0, 0.25, 0.5, 0.75, 1.0], // We want to know when anything becomes even slightly visible.
      rootMargin: "-37px 0px 0px", // Experimentally, the top bar is 37 pixels.
    }
  );
}

// In the component to watch

// useEffect(() => {
//   const watched = contentRef.current;
//   if (watched) {
//     watcherThing.get().observer.observe(watched);
//     return () => watcherThing.get().observer.unobserve(watched);
//   }
// }, []);
