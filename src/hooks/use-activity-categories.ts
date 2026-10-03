import { useCallback, useEffect, useState } from 'react';
import { listActiveCategories } from '../services/category-catalog';

/** Keep a loaded catalog visible if a later refresh fails. */
export function useActivityCategories() {
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void listActiveCategories().then(rows => {
      if (active) setNames(rows.map(row => row.name));
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Categories could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [revision]);
  return { names, error, loading, retry };
}
