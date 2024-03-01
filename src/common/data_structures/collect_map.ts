interface Collectable<Collection> {
  make(): Collection;
  add(c: Collection, v: any): void;
}

interface CollectMap<K, V, C> {
  readonly map: Map<K, C>;
  add(k: K, v: V): void;
  get(k: K): C | undefined;
}

function collectMap<K, V, C>(q: Collectable<C>): CollectMap<K, V, C> {
  const map = new Map<K, C>();
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

export function arrayMap<K, V>() {
  return collectMap<K, V, V[]>({ make: () => [], add: (c, v) => c.push(v) });
}

export function setMap<K, V>() {
  return collectMap<K, V, Set<V>>({
    make: () => new Set<V>(),
    add: (c, v) => c.add(v),
  });
}
