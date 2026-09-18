import { useCallback, useMemo, useState } from 'react';
import { qs, type FilterOptions } from '../lib/api';
import { useApi } from './useApi';

export interface FilterState {
  from: string;
  to: string;
  type: string[];
  severity: string[];
  region: string[];
  location: string[];
  status: string[];
  bucket: string;
}

export const EMPTY_FILTERS: FilterState = {
  from: '', to: '', type: [], severity: [], region: [], location: [], status: [], bucket: 'auto',
};

/**
 * Filter state + the filter options available for a module, and the API path
 * that every chart on the page must re-request when a filter changes.
 */
export function useModuleFilters(module: string, endpoint: string, extra: Record<string, string> = {}) {
  const { data: options, loading: optionsLoading } = useApi<FilterOptions>(`/meta/options?module=${module}`);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const set = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const reset = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const path = useMemo(() => {
    const from = filters.from || options?.range?.from || '';
    const to = filters.to || options?.range?.to || '';
    return `${endpoint}${qs({
      from, to,
      type: filters.type, severity: filters.severity, region: filters.region,
      location: filters.location, status: filters.status,
      bucket: filters.bucket === 'auto' ? undefined : filters.bucket,
      ...extra,
    })}`;
  }, [endpoint, filters, options?.range?.from, options?.range?.to, extra]);

  const activeCount =
    filters.type.length + filters.severity.length + filters.region.length +
    filters.location.length + filters.status.length +
    (filters.from || filters.to ? 1 : 0);

  return { filters, set, reset, options, optionsLoading, path, activeCount };
}
