import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { searchByStartsWith } from '@/lib/utils';
import { fetchBenhNhanList } from '@/lib/patient/api';
import { parseNgaySinhForSort } from '@/lib/patient/sort';
import type { BenhNhan, SortField } from '@/lib/patient/types';

export function usePatientList() {
  const [benhNhans, setBenhNhans] = useState<BenhNhan[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [sortConfig, setSortConfig] = useState<Array<{ field: SortField; direction: 'asc' | 'desc' }>>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchList = async () => {
      try {
        const { data, total: nextTotal } = await fetchBenhNhanList({
          page: currentPage,
          pageSize: rowsPerPage,
          search: debouncedSearch,
          signal: abortController.signal,
        });
        setBenhNhans(data);
        setTotal(nextTotal);
      } catch (error: unknown) {
        if (axios.isCancel(error)) return;
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.response?.data?.error || error.message
          : error instanceof Error
            ? error.message
            : String(error);
        toast.error(`Lỗi tải danh sách bệnh nhân: ${message}`);
      }
    };
    fetchList();
    return () => abortController.abort();
  }, [currentPage, rowsPerPage, debouncedSearch]);

  const totalPages = Math.ceil(total / rowsPerPage);

  const filtered = useMemo(() => {
    const searchTerm = search.trim();
    if (!searchTerm) return benhNhans;

    return benhNhans.filter((bn) => {
      if (bn.ten && searchByStartsWith(bn.ten, searchTerm)) {
        return true;
      }
      if (bn.dienthoai && /\d/.test(searchTerm)) {
        const cleanPhone = bn.dienthoai.replace(/\D/g, '');
        const cleanSearch = searchTerm.replace(/\D/g, '');
        if (cleanSearch && cleanPhone.includes(cleanSearch)) {
          return true;
        }
      }
      return false;
    });
  }, [benhNhans, search]);

  const sortedFiltered = useMemo(() => {
    if (sortConfig.length === 0) return filtered;

    return [...filtered].sort((a, b) => {
      for (const { field, direction } of sortConfig) {
        const multiplier = direction === 'asc' ? 1 : -1;
        let av: string | number | null | undefined = a[field];
        let bv: string | number | null | undefined = b[field];

        if (field === 'namsinh') {
          av = parseNgaySinhForSort(av);
          bv = parseNgaySinhForSort(bv);
        } else if (field === 'tuoi') {
          av = av ?? 0;
          bv = bv ?? 0;
        } else if (field === 'created_at' || field === 'ngay_kham_gan_nhat') {
          av = av ? new Date(String(av)).getTime() : 0;
          bv = bv ? new Date(String(bv)).getTime() : 0;
        } else {
          av = (av ?? '').toString().toLowerCase();
          bv = (bv ?? '').toString().toLowerCase();
        }

        if (av < bv) return -1 * multiplier;
        if (av > bv) return 1 * multiplier;
      }
      return 0;
    });
  }, [filtered, sortConfig]);

  // API đã phân trang — không slice client
  const paginated = useMemo(() => sortedFiltered, [sortedFiltered]);

  const handleSort = useCallback((field: SortField, isShiftKey: boolean = false) => {
    setSortConfig((prev) => {
      if (isShiftKey) {
        const existingIndex = prev.findIndex((s) => s.field === field);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            field,
            direction: updated[existingIndex].direction === 'asc' ? 'desc' : 'asc',
          };
          return updated;
        }
        return [...prev, { field, direction: 'asc' }];
      }
      const existing = prev.find((s) => s.field === field);
      if (existing) {
        return [{ field, direction: existing.direction === 'asc' ? 'desc' : 'asc' }];
      }
      return [{ field, direction: 'asc' }];
    });
    setCurrentPage(1);
  }, []);

  const renderSortIndicator = (field: SortField) => {
    const sortIndex = sortConfig.findIndex((s) => s.field === field);
    if (sortIndex === -1) return <span className="opacity-30">↕</span>;

    const sort = sortConfig[sortIndex];
    const arrow = sort.direction === 'asc' ? '▲' : '▼';
    const level = sortConfig.length > 1 ? <sub className="text-[9px]">{sortIndex + 1}</sub> : null;

    return <span className="text-blue-600 font-bold">{arrow}{level}</span>;
  };

  return {
    benhNhans,
    setBenhNhans,
    search,
    setSearch,
    debouncedSearch,
    currentPage,
    setCurrentPage,
    rowsPerPage,
    setRowsPerPage,
    total,
    setTotal,
    totalPages,
    sortConfig,
    filtered,
    paginated,
    handleSort,
    renderSortIndicator,
  };
}
