'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import type { FamilyGroup } from './types';
import { buildFamilySummaryText } from './familyUtils';

interface CacheEntry {
  data: FamilyGroup | null;
  fetchedAt: number;
}

const FAMILY_CACHE_TTL = 30_000;
const familyCache = new Map<number, CacheEntry>();
const invalidationListeners = new Set<() => void>();

function getCached(benhnhanId: number): FamilyGroup | null | undefined {
  const entry = familyCache.get(benhnhanId);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > FAMILY_CACHE_TTL) {
    familyCache.delete(benhnhanId);
    return undefined;
  }
  return entry.data;
}

function setCached(benhnhanId: number, data: FamilyGroup | null) {
  familyCache.set(benhnhanId, { data, fetchedAt: Date.now() });
}

export function invalidateFamilyCache(memberPatientIds: number[] = []) {
  if (memberPatientIds.length === 0) {
    familyCache.clear();
  } else {
    for (const id of memberPatientIds) familyCache.delete(id);
  }
  invalidationListeners.forEach((listener) => listener());
}

export function usePatientFamily(benhnhanId: number | null) {
  const cached = benhnhanId ? getCached(benhnhanId) : undefined;
  const [loading, setLoading] = useState(benhnhanId != null && cached === undefined);
  const [family, setFamily] = useState<FamilyGroup | null>(cached ?? null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    invalidationListeners.add(listener);
    return () => {
      invalidationListeners.delete(listener);
    };
  }, []);

  const fetchFamily = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!benhnhanId) {
        setFamily(null);
        setLoading(false);
        return;
      }
      if (!opts?.background) setLoading(true);
      try {
        const res = await axios.get(
          `/api/benh-nhan/family?benhnhanid=${benhnhanId}&_t=${Date.now()}`,
        );
        const data: FamilyGroup | null = res.data?.data || null;
        setFamily(data);
        setCached(benhnhanId, data);
      } catch {
        setFamily(null);
      } finally {
        setLoading(false);
      }
    },
    [benhnhanId],
  );

  useEffect(() => {
    if (!benhnhanId) {
      setFamily(null);
      setLoading(false);
      return;
    }

    const cachedEntry = getCached(benhnhanId);
    if (cachedEntry !== undefined) {
      setFamily(cachedEntry);
      setLoading(false);
      void fetchFamily({ background: true });
      return;
    }

    void fetchFamily();
  }, [benhnhanId, fetchFamily, version]);

  const refetchAndInvalidate = useCallback(async () => {
    if (!benhnhanId) return;
    const ids = family ? family.members.map((m) => m.benhnhan_id) : [benhnhanId];
    invalidateFamilyCache([...ids, benhnhanId]);
    await fetchFamily();
  }, [benhnhanId, family, fetchFamily]);

  const summaryText = buildFamilySummaryText(family, benhnhanId);

  return {
    family,
    loading,
    summaryText,
    fetchFamily,
    refetchAndInvalidate,
  };
}
