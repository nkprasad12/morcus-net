interface Collectable<Collection> {
  make(): Collection;
  add(c: Collection, v: any): void;
}

interface CollectMap<K, V, C> {
  readonly map: Map<K, C>;
  add(k: K, v: V): void;
  get(k: K): C | undefined;
}

function collectMap<K, V, C>(
  q: Collectable<C>,
  wrappedMap?: Map<K, C>
): CollectMap<K, V, C> {
  const map = wrappedMap ?? new Map<K, C>();
  return {
    map,
    add(k: K, v: V) {
      if (!map.has(k)) {
        map.set(k, q.make());
      }
      q.add(map.get(k)!, v);
    },
    get: (k) => map.get(k),
  };
}

export function arrayMap<K, V>(wrappedMap?: Map<K, V[]>) {
  return collectMap<K, V, V[]>(
    { make: () => [], add: (c, v) => c.push(v) },
    wrappedMap
  );
}

/** Creates an arrayMap initialized with the given list. */
export function arrayMapBy<K, V>(list: V[], sorter: (v: V) => K) {
  const bySorter = arrayMap<K, V>();
  for (const v of list) {
    bySorter.add(sorter(v), v);
  }
  return bySorter;
}

export function setMap<K, V>() {
  return collectMap<K, V, Set<V>>({
    make: () => new Set<V>(),
    add: (c, v) => c.add(v),
  });
}
