import axios from 'axios';
import { fetchWithAuth } from '../fetchWithAuth';
import { NO_CACHE_HEADERS } from './constants';
import type {
  BenhNhan,
  ChainHistory,
  ChiTietDonThuoc,
  DienTien,
  DonKinh,
  DonThuoc,
  HenKham,
  PatientNote,
} from './types';

function cacheBustUrl(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_t=${Date.now()}`;
}

export async function fetchBenhNhanList(params: {
  page: number;
  pageSize: number;
  search: string;
  signal?: AbortSignal;
}): Promise<{ data: BenhNhan[]; total: number }> {
  const { page, pageSize, search, signal } = params;
  const res = await axios.get(
    cacheBustUrl(
      `/api/benh-nhan?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`
    ),
    { headers: { ...NO_CACHE_HEADERS }, signal }
  );
  return {
    data: (res.data.data || []) as BenhNhan[],
    total: (res.data.total || 0) as number,
  };
}

export async function createBenhNhan(form: BenhNhan): Promise<BenhNhan> {
  const res = await axios.post('/api/benh-nhan', form);
  return (res.data?.data ?? form) as BenhNhan;
}

export async function updateBenhNhan(form: BenhNhan): Promise<BenhNhan> {
  const res = await axios.put('/api/benh-nhan', form);
  return (res.data?.data ?? form) as BenhNhan;
}

export async function deleteBenhNhan(id: number): Promise<void> {
  await axios.delete(`/api/benh-nhan?id=${id}`);
}

export async function mergeBenhNhans(mainPatientId: number, patientIdsToMerge: number[]): Promise<void> {
  await axios.post('/api/benh-nhan/merge', { mainPatientId, patientIdsToMerge });
}

export async function fetchPatientNotes(
  benhnhanid: number,
  includeDeleted: boolean
): Promise<PatientNote[]> {
  const res = await axios.get(
    cacheBustUrl(
      `/api/benh-nhan/notes?benhnhanid=${benhnhanid}&includeDeleted=${includeDeleted ? 1 : 0}`
    )
  );
  return (res.data?.data || []) as PatientNote[];
}

export async function createPatientNoteApi(payload: {
  benhnhanid: number;
  content: string;
  note_type: 'important' | 'normal';
}): Promise<void> {
  await axios.post('/api/benh-nhan/notes', payload);
}

export async function updatePatientNoteApi(payload: {
  id: number;
  content: string;
  note_type: 'important' | 'normal';
}): Promise<void> {
  await axios.put('/api/benh-nhan/notes', payload);
}

export async function softDeletePatientNoteApi(id: number): Promise<void> {
  await axios.delete('/api/benh-nhan/notes', { data: { id } });
}

export async function restorePatientNoteApi(id: number): Promise<void> {
  await axios.patch('/api/benh-nhan/notes', { id });
}

export async function hardDeletePatientNoteApi(id: number): Promise<void> {
  await axios.delete('/api/benh-nhan/notes?hard=1', { data: { id, hard: true } });
}

export async function fetchPatientRecordBundle(benhnhanid: number): Promise<{
  donThuocs: DonThuoc[];
  chiTietMap: Record<number, ChiTietDonThuoc[]>;
  dienTiens: DienTien[];
  donKinhs: DonKinh[];
  henKhams: HenKham[];
}> {
  const timestamp = Date.now();
  const headers = { ...NO_CACHE_HEADERS };

  const resDon = await axios.get(`/api/don-thuoc?benhnhanid=${benhnhanid}&limit=20&_t=${timestamp}`, {
    headers,
  });
  const donThuocs: DonThuoc[] = resDon.data.data || [];

  const chiTietResponses = await Promise.all(
    donThuocs.map((don) =>
      axios.get(`/api/chi-tiet-don-thuoc?donthuocid=${don.id}&_t=${timestamp}`, { headers })
    )
  );
  const chiTietMap: Record<number, ChiTietDonThuoc[]> = {};
  chiTietResponses.forEach((res, idx) => {
    const donId = donThuocs[idx].id;
    chiTietMap[donId] = (res.data.data || []).map((item: ChiTietDonThuoc) => ({
      thuoc: { id: item.thuoc.id, tenthuoc: item.thuoc.tenthuoc },
      soluong: item.soluong,
    }));
  });

  const resDienTien = await axios.get(`/api/dien-tien?benhnhanid=${benhnhanid}&_t=${timestamp}`, {
    headers,
  });
  const resDonKinh = await axios.get(`/api/don-kinh?benhnhanid=${benhnhanid}&limit=20&_t=${timestamp}`, {
    headers,
  });
  const resHenKham = await axios.get(`/api/hen-kham-lai?benhnhanid=${benhnhanid}&_t=${timestamp}`, {
    headers,
  });

  return {
    donThuocs,
    chiTietMap,
    dienTiens: (resDienTien.data.data || []) as DienTien[],
    donKinhs: (resDonKinh.data.data || []) as DonKinh[],
    henKhams: (resHenKham.data.data || []) as HenKham[],
  };
}

export async function fetchChainHistory(benhnhanid: number): Promise<ChainHistory | null> {
  const res = await fetchWithAuth(`/api/branches/patient-history?benhnhan_id=${benhnhanid}`);
  if (!res.ok) return null;
  return (await res.json()) as ChainHistory;
}
