'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from './ui/input';

export interface PatientSearchHit {
  id: number;
  ten: string;
  dienthoai?: string;
  namsinh?: string;
}

interface PatientSearchInputProps {
  selected: PatientSearchHit | null;
  onSelect: (patient: PatientSearchHit | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function PatientSearchInput({
  selected,
  onSelect,
  placeholder = 'Tìm tên hoặc SĐT bệnh nhân...',
  className = '',
  disabled = false,
}: PatientSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selected) {
      setQuery(`${selected.ten}${selected.dienthoai ? ` · ${selected.dienthoai}` : ''}`);
    }
  }, [selected]);

  useEffect(() => {
    if (selected || disabled) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(
          `/api/benh-nhan?search=${encodeURIComponent(q)}&pageSize=8&_t=${Date.now()}`
        );
        setResults(res.data?.data || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selected, disabled]);

  const clearSelection = () => {
    onSelect(null);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          className="pl-9 pr-9"
          onChange={(e) => {
            if (selected) onSelect(null);
            setQuery(e.target.value);
          }}
          onFocus={() => {
            if (!selected && results.length > 0) setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {(searching || selected) && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : selected ? (
              <button
                type="button"
                onClick={clearSelection}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Xóa lựa chọn"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {open && !selected && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b last:border-b-0 text-sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(p);
                setQuery(`${p.ten}${p.dienthoai ? ` · ${p.dienthoai}` : ''}`);
                setOpen(false);
              }}
            >
              <span className="font-medium">{p.ten}</span>
              <span className="text-gray-500 text-xs ml-2">
                #{p.id}
                {p.dienthoai ? ` · ${p.dienthoai}` : ''}
                {p.namsinh ? ` · ${p.namsinh}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PatientSearchInput;
