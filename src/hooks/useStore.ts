import { useEffect, useState } from 'react';
import type { Store } from '../types/index';
import { createIndexedDBStore } from '../database/indexedDB';

export function useStore(): Store | null {
  const [store, setStore] = useState<Store | null>(null);
  useEffect(() => { setStore(createIndexedDBStore()); }, []);
  return store;
}
