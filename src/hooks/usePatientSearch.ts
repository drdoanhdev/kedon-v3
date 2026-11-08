import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { rankResults, type PatientResult } from '../lib/patientSearch';

export type PatientSearchStatus = 'idle' | 'loading' | 'error';

export function usePatientSearch(enabled: boolean, pageSize: number) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PatientResult[]>([]);
  const [status, setStatus] = useState<PatientSearchStatus>('idle');

  const reset = useCallback(() => {
    setTerm('');
    setResults([]);
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const q = term.trim();
    if (!q) {
      setResults([]);
      setStatus('idle');
      return;
    }

    const ctrl = new AbortController();
    setStatus('loading');

    const timer = setTimeout(async () => {
      try {
        const res = await axios.get<{ data?: PatientResult[] }>('/api/benh-nhan', {
          params: { search: q, pageSize },
          headers: { 'Cache-Control': 'no-cache' },
          signal: ctrl.signal,
        });
        setResults(rankResults(res.data?.data ?? [], q));
        setStatus('idle');
      } catch (e) {
        if (axios.isCancel(e)) return;
        if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'ERR_CANCELED') {
          return;
        }
        setStatus('error');
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term, enabled, pageSize]);

  return { term, setTerm, results, status, reset };
}

export type { PatientResult };
