export type Callback<T, O = unknown> = (t: T) => O;

type AdaptedEvent = Pick<Event, "stopPropagation" | "target">;

/**
 * Adapts a handler for text elements to a callback for a parent element.
 * This should be used only as a memory optimization.
 *
 * @param handler the handler to invoke with the clicked text.
 * @param forClass the class to filter on, if any.
 */
export function textCallback(
  handler: Callback<string, boolean>,
  forClass?: string
): Callback<AdaptedEvent> {
  return (e) => {
    const target = e.target;
    if (!(target instanceof HTMLSpanElement)) {
      return;
    }
    if (forClass !== undefined && !target.classList.contains(forClass)) {
      return;
    }
    const word = target.textContent;
    if (word === null) {
      return;
    }
    const handled = handler(word);
    if (handled) {
      e.stopPropagation();
    }
  };
}
