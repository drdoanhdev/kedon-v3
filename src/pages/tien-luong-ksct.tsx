'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ArrowLeft, AlertTriangle, BookOpen, Glasses } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import {
  alPercentile,
  alToPctWeight,
  calcHighMyopiaRisk,
  calcRetinaRiskMultiplier,
  getReduction,
  pctWeightLabel,
  resolveAL0,
  riskMultiplier,
  sexFromUi,
  simulateSeries,
  worseSerFromDon,
  TX_COMBINE_OPTIONS,
  TX_PRIMARY_OPTIONS,
  type TxKey,
  type TxMode,
} from '../lib/ksct/simulate';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface BenhNhan {
  id: number;
  mabenhnhan?: string | null;
  ten: string;
  namsinh: string;
  gioitinh?: string | null;
  tuoi?: number;
}

interface DonKinhLite {
  id: number;
  ngaykham?: string;
  sokinh_moi_mp?: string | null;
  sokinh_moi_mt?: string | null;
}

const DEFAULT_SER = -2.5;
const inputCls =
  'w-full border border-slate-200 rounded-[10px] px-2.5 py-2 text-[12.5px] text-slate-700 bg-white focus:outline-none focus:border-blue-500';

function calcAgeFromNamsinh(namsinh: string | number | null | undefined): number {
  if (!namsinh) return 0;
  const now = new Date();
  if (typeof namsinh === 'number') return now.getFullYear() - namsinh;
  const s = String(namsinh);
  if (/^\d{4}$/.test(s)) return now.getFullYear() - parseInt(s, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/').map(Number);
    let age = now.getFullYear() - y;
    const birthdayThisYear = new Date(now.getFullYear(), m - 1, d);
    if (now < birthdayThisYear) age--;
    return age;
  }
  return 0;
}

export default function TienLuongKsctPage() {
  const searchParams = useSearchParams();
  const benhnhanid = searchParams.get('bn');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [benhNhan, setBenhNhan] = useState<BenhNhan | null>(null);
  const [serSource, setSerSource] = useState<string | null>(null);

  const [race, setRace] = useState<'asian' | 'caucasian'>('asian');
  const [sex, setSex] = useState<'boy' | 'girl'>('boy');
  const [age, setAge] = useState(8);
  const [ser, setSer] = useState(DEFAULT_SER);
  const [alManual, setAlManual] = useState('');
  const [accLag, setAccLag] = useState<'normal' | 'high'>('normal');
  const [cr, setCr] = useState(7.8);
  const [parentMyopia, setParentMyopia] = useState(0);
  const [outdoor, setOutdoor] = useState(1.5);
  const [nearwork, setNearwork] = useState(3);

  const [modeA, setModeA] = useState<TxMode>('mono');
  const [primaryA, setPrimaryA] = useState<TxKey>('atropine_0025');
  const [combineA, setCombineA] = useState<TxKey>('atropine_001');
  const [modeB, setModeB] = useState<TxMode>('combine');
  const [primaryB, setPrimaryB] = useState<TxKey>('orthok');
  const [combineB, setCombineB] = useState<TxKey>('atropine_001');
  const [activeTab, setActiveTab] = useState<'se' | 'al'>('se');

  const loadPatient = useCallback(async () => {
    if (!benhnhanid) {
      setError('Vui lòng chọn một bệnh nhân từ trang kê đơn kính.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [bnRes, dkRes] = await Promise.all([
        axios.get(`/api/benh-nhan?benhnhanid=${benhnhanid}`),
        axios.get(`/api/don-kinh?benhnhanid=${benhnhanid}&limit=20`).catch(() => ({ data: { data: [] } })),
      ]);
      const bn: BenhNhan | null = bnRes.data?.data ?? bnRes.data ?? null;
      if (!bn || !bn.id) {
        setError('Không tìm thấy thông tin bệnh nhân.');
        setBenhNhan(null);
        return;
      }
      const tuoi =
        typeof bn.tuoi === 'number' && bn.tuoi > 0
          ? bn.tuoi
          : calcAgeFromNamsinh(bn.namsinh);
      setBenhNhan({ ...bn, tuoi });
      setAge(Math.max(2, Math.min(15, Math.round(tuoi) || 8)));
      if (bn.gioitinh === 'Nữ') setSex('girl');
      else if (bn.gioitinh === 'Nam') setSex('boy');

      const dons: DonKinhLite[] = Array.isArray(dkRes.data?.data)
        ? dkRes.data.data
        : Array.isArray(dkRes.data)
          ? dkRes.data
          : [];
      const latest = dons[0];
      const serParsed = latest
        ? worseSerFromDon(latest.sokinh_moi_mp, latest.sokinh_moi_mt)
        : null;
      if (serParsed != null) {
        const clamped = Math.max(-10, Math.min(1, Math.round(serParsed * 4) / 4));
        setSer(clamped);
        const mp = latest.sokinh_moi_mp || '—';
        const mt = latest.sokinh_moi_mt || '—';
        setSerSource(`Từ đơn kính gần nhất: MP ${mp} / MT ${mt}`);
      } else {
        setSer(DEFAULT_SER);
        setSerSource(latest ? 'Không parse được số kính — dùng mặc định' : 'Chưa có đơn kính — dùng SER mặc định');
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Không tải được dữ liệu bệnh nhân.');
      setBenhNhan(null);
    } finally {
      setLoading(false);
    }
  }, [benhnhanid]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  const sim = useMemo(() => {
    const age0 = age;
    const ser0 = ser;
    const crVal = cr || 7.8;
    const sexKey = sexFromUi(sex);
    const manual = alManual.trim() === '' ? null : parseFloat(alManual);
    const al0 = resolveAL0(age0, ser0, sexKey, manual);
    const ratio = al0 / crVal;
    const pctWeight = alToPctWeight(al0, age0, sexKey);

    const riskMult = riskMultiplier({
      accLagHigh: accLag === 'high',
      parentMyopia,
      cr: crVal,
      outdoor,
      nearwork,
    });

    const control = simulateSeries(age0, al0, ser0, 0, 0, riskMult, sexKey, pctWeight);
    const redA = getReduction(modeA, primaryA, combineA);
    const redB = getReduction(modeB, primaryB, combineB);
    const seriesA = simulateSeries(age0, al0, ser0, redA.al, redA.se, riskMult, sexKey, pctWeight);
    const seriesB = simulateSeries(age0, al0, ser0, redB.al, redB.se, riskMult, sexKey, pctWeight);

    const controlSE18 = control[control.length - 1].se;
    const highRisk = calcHighMyopiaRisk(controlSE18);
    const retinaMult = calcRetinaRiskMultiplier(controlSE18);

    return {
      al0,
      ratio,
      riskMult,
      pctWeight,
      pctLabel: pctWeightLabel(pctWeight),
      sex: sexKey,
      control,
      redA,
      redB,
      seriesA,
      seriesB,
      highRisk,
      retinaMult,
    };
  }, [
    age,
    ser,
    sex,
    cr,
    alManual,
    modeA,
    primaryA,
    combineA,
    modeB,
    primaryB,
    combineB,
    parentMyopia,
    nearwork,
    outdoor,
    accLag,
  ]);

  const chartData = useMemo(() => {
    const key = activeTab;
    const labels = sim.control.map((p) => p.age.toFixed(1));
    const datasets: any[] = [];

    if (key === 'al') {
      const dataP95 = sim.control.map((p) => +alPercentile(p.age, sim.sex, 'p95').toFixed(2));
      const dataP10 = sim.control.map((p) => +alPercentile(p.age, sim.sex, 'p10').toFixed(2));
      const dataP50 = sim.control.map((p) => +alPercentile(p.age, sim.sex, 'p50').toFixed(2));
      datasets.push(
        {
          label: 'P95 (tham chiếu)',
          data: dataP95,
          borderColor: 'transparent',
          backgroundColor: '#94a3b81a',
          pointRadius: 0,
          fill: '+1',
          order: 10,
        },
        {
          label: 'P10 (tham chiếu)',
          data: dataP10,
          borderColor: 'transparent',
          backgroundColor: '#94a3b81a',
          pointRadius: 0,
          fill: false,
          order: 10,
        },
        {
          label: 'P50 (trung vị dân số)',
          data: dataP50,
          borderColor: '#94a3b8',
          borderDash: [3, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          order: 9,
        }
      );
    }

    datasets.push(
      {
        label: 'Không điều trị',
        data: sim.control.map((p) => p[key]),
        borderColor: '#ef4444',
        backgroundColor: '#ef444422',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      },
      {
        label: 'Phác đồ A',
        data: sim.seriesA.map((p) => p[key]),
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f622',
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      },
      {
        label: 'Phác đồ B',
        data: sim.seriesB.map((p) => p[key]),
        borderColor: '#10b981',
        backgroundColor: '#10b98122',
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      }
    );

    return { labels, datasets };
  }, [sim, activeTab]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item: any) => item.dataset.order !== 10,
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)}${activeTab === 'se' ? ' D' : ' mm'}`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Tuổi', font: { size: 10 } },
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 } },
        },
        y: {
          reverse: activeTab === 'se',
          title: {
            display: true,
            text: activeTab === 'se' ? 'SE (D)' : 'AL (mm)',
            font: { size: 10 },
          },
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 } },
        },
      },
    }),
    [activeTab]
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50 text-slate-700">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-5 py-5 pb-16">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h1 className="m-0 text-[19px] font-extrabold tracking-wide uppercase bg-gradient-to-r from-blue-600 via-pink-500 to-pink-400 bg-clip-text text-transparent">
                Tiên lượng &amp; Phác đồ KSCT
              </h1>
              <p className="mt-1 text-xs text-slate-500 font-medium">
                Mô phỏng tiến triển cận thị, trục nhãn cầu và so sánh phác đồ điều trị.
              </p>
            </div>
            {benhnhanid && (
              <Link
                href={`/ke-don-kinh?bn=${benhnhanid}`}
                className="h-9 px-3 rounded-full border border-slate-200 bg-white text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 flex-shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kê đơn kính
              </Link>
            )}
          </div>

          {loading && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
              Đang tải dữ liệu bệnh nhân…
            </div>
          )}

          {!loading && error && (
            <div className="bg-white border border-rose-200 rounded-2xl p-6 text-center">
              <p className="text-sm text-rose-600 font-medium">{error}</p>
              <Link href="/benh-nhan" className="inline-block mt-3 text-xs text-blue-600 font-semibold hover:underline">
                Về danh sách bệnh nhân
              </Link>
            </div>
          )}

          {!loading && !error && benhNhan && (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 shadow-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Glasses className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="font-extrabold text-blue-700 truncate">{benhNhan.ten}</span>
                  {benhNhan.mabenhnhan && (
                    <span className="text-xs text-slate-400 font-medium">{benhNhan.mabenhnhan}</span>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  {benhNhan.gioitinh ? `${benhNhan.gioitinh} • ` : ''}
                  {benhNhan.namsinh}
                  {benhNhan.tuoi !== undefined ? ` (${benhNhan.tuoi} tuổi)` : ''}
                </span>
                {serSource && <span className="text-[11px] text-slate-400 italic w-full sm:w-auto">{serSource}</span>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
                {/* Left: params */}
                <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm h-fit">
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <h2 className="m-0 text-[13px] font-extrabold tracking-wider uppercase text-blue-600">
                      Thông số bệnh nhi
                    </h2>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Cung cấp các chỉ số ban đầu để mô phỏng đường cong tiến triển.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block mb-1.5 text-xs font-bold text-slate-700">Chủng tộc</label>
                      <select className={inputCls} value={race} onChange={(e) => setRace(e.target.value as any)}>
                        <option value="asian">Châu Á (Asian)</option>
                        <option value="caucasian">Da trắng (Caucasian)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1.5 text-xs font-bold text-slate-700">Giới tính</label>
                      <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value as any)}>
                        <option value="boy">Nam (Boy)</option>
                        <option value="girl">Nữ (Girl)</option>
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>Tuổi hiện tại</span>
                      <span className="text-blue-600 font-extrabold">{age} tuổi</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={15}
                      step={1}
                      value={age}
                      onChange={(e) => setAge(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                      <span>2 tuổi</span>
                      <span>15 tuổi</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>Độ khúc xạ hiện tại (SER)</span>
                      <span className="text-rose-500 font-extrabold">{ser.toFixed(2)} D</span>
                    </div>
                    <input
                      type="range"
                      min={-10}
                      max={1}
                      step={0.25}
                      value={ser}
                      onChange={(e) => setSer(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className="text-red-500 font-semibold">-10.00 D (Cận nặng)</span>
                      <span className="text-emerald-500 font-semibold">+1.00 D (Viễn thị nhẹ)</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block mb-1.5 text-xs font-bold text-slate-700">
                      Chiều dài trục nhãn cầu (mm)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step={0.01}
                        placeholder={`Tự động ≈ ${sim.al0} mm`}
                        className={`${inputCls} pr-9`}
                        value={alManual}
                        onChange={(e) => setAlManual(e.target.value)}
                      />
                      <span className="absolute right-3 top-2.5 text-[11px] font-bold text-slate-400">mm</span>
                    </div>
                    <p className="mt-1 text-[10px] italic text-slate-400">
                      *Nếu để trống, hệ thống tự ước tính trục dựa trên tuổi và độ cận sinh lý.
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                      Các yếu tố nguy cơ bổ sung
                    </span>

                    <div className="mb-4">
                      <label className="block mb-1.5 text-xs font-bold text-slate-700">
                        Trễ điều tiết (Accommodative Lag)
                      </label>
                      <select
                        className={inputCls}
                        value={accLag}
                        onChange={(e) => setAccLag(e.target.value as any)}
                      >
                        <option value="normal">Bình thường / Thấp (&lt; 0.75 D)</option>
                        <option value="high">Cao (≥ 0.75 D) — Nguy cơ dốc tiến triển</option>
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="block mb-1.5 text-xs font-bold text-slate-700">
                        Bán kính cong giác mạc (Cr)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step={0.05}
                          className={`${inputCls} pr-9`}
                          value={cr}
                          onChange={(e) => setCr(parseFloat(e.target.value) || 7.8)}
                        />
                        <span className="absolute right-3 top-2.5 text-[11px] font-bold text-slate-400">mm</span>
                      </div>
                    </div>

                    {sim.ratio > 3.0 && (
                      <div className="border border-amber-200 bg-amber-50 rounded-2xl p-3 mb-4">
                        <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-600">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Cảnh báo chỉ số AL/CR cao (&gt; 3.0)
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                          Tỷ lệ Trục nhãn cầu / Bán kính cong đạt mức{' '}
                          <strong className="text-slate-700">{sim.ratio.toFixed(2)}</strong>. Nhãn cầu bị kéo
                          giãn vượt ngưỡng sinh lý, tăng nguy cơ thoái hóa hoàng điểm.
                        </p>
                      </div>
                    )}

                    <div className="mb-4">
                      <label className="block mb-1.5 text-xs font-bold text-slate-700">
                        Số lượng bố mẹ cận thị
                      </label>
                      <select
                        className={inputCls}
                        value={parentMyopia}
                        onChange={(e) => setParentMyopia(parseInt(e.target.value, 10))}
                      >
                        <option value={0}>Không có bố mẹ cận thị</option>
                        <option value={1}>Có 1 người cận thị</option>
                        <option value={2}>Cả hai người đều cận thị</option>
                      </select>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                        <span>Hoạt động ngoài trời</span>
                        <span className="text-emerald-500 font-extrabold">{outdoor} giờ/ngày</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={0.5}
                        value={outdoor}
                        onChange={(e) => setOutdoor(parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                        <span>Cường độ nhìn gần (sau giờ học)</span>
                        <span className="text-indigo-500 font-extrabold">{nearwork} giờ/ngày</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={8}
                        step={0.5}
                        value={nearwork}
                        onChange={(e) => setNearwork(parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </section>

                {/* Right: chart + protocols */}
                <section className="space-y-5">
                  <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3.5">
                      <div className="inline-flex bg-slate-100 rounded-xl p-1 text-xs font-bold">
                        <button
                          type="button"
                          className={`px-4 py-2 rounded-lg ${
                            activeTab === 'se' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                          }`}
                          onClick={() => setActiveTab('se')}
                        >
                          Khúc xạ SE
                        </button>
                        <button
                          type="button"
                          className={`px-4 py-2 rounded-lg ${
                            activeTab === 'al' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                          }`}
                          onClick={() => setActiveTab('al')}
                        >
                          Chiều dài trục nhãn cầu (AL)
                        </button>
                      </div>
                      <span className="border border-slate-200 bg-slate-50 rounded-[10px] px-2.5 py-1 text-[10px] font-bold text-slate-500">
                        Dự báo đến tuổi 18
                      </span>
                    </div>
                    <div className="-mt-1 mb-2.5 text-[10.5px] text-slate-500 leading-relaxed">
                      AL hiện tại tương ứng khoảng{' '}
                      <strong className="text-blue-600">{sim.pctLabel}</strong> dân số cùng tuổi/giới — tốc độ
                      tiến triển được mô phỏng theo đúng percentile này (percentile càng cao, tốc độ càng
                      nhanh). Hệ số nguy cơ bổ sung:{' '}
                      <strong className="text-slate-700">×{sim.riskMult.toFixed(2)}</strong>
                    </div>

                    <div className="relative h-[300px] w-full">
                      <Line data={chartData} options={chartOptions} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mt-3.5 text-[11px] font-semibold">
                      <div className="flex items-start gap-2.5">
                        <span className="w-3.5 h-3.5 rounded bg-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="block text-slate-700">Không điều trị (Control)</span>
                          <span className="text-[10px] font-normal text-slate-400">Tốc độ tăng tự nhiên</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="w-3.5 h-3.5 rounded bg-blue-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="block text-slate-700">Phác đồ A: {sim.redA.label}</span>
                          <span className="text-[10px] font-extrabold text-blue-500">
                            SE: ~{Math.round(sim.redA.se * 100)}% / AL: ~{Math.round(sim.redA.al * 100)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="w-3.5 h-3.5 rounded bg-emerald-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="block text-slate-700">Phác đồ B: {sim.redB.label}</span>
                          <span className="text-[10px] font-extrabold text-emerald-500">
                            SE: ~{Math.round(sim.redB.se * 100)}% / AL: ~{Math.round(sim.redB.al * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 mt-4">
                      <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                        So sánh phác đồ điều trị
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <ProtocolCard
                          title="Phác đồ so sánh A"
                          titleClass="text-blue-600"
                          mode={modeA}
                          setMode={setModeA}
                          primary={primaryA}
                          setPrimary={setPrimaryA}
                          combine={combineA}
                          setCombine={setCombineA}
                        />
                        <ProtocolCard
                          title="Phác đồ so sánh B"
                          titleClass="text-emerald-500"
                          mode={modeB}
                          setMode={setModeB}
                          primary={primaryB}
                          setPrimary={setPrimaryB}
                          combine={combineB}
                          setCombine={setCombineB}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 m-0 mb-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        Đánh giá rủi ro bệnh lý võng mạc
                      </h3>
                      <div className="mb-3.5">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-600">
                            Khả năng tiến triển cận thị nặng (&gt; 6.00D)
                          </span>
                          <span className="font-extrabold" style={{ color: sim.highRisk.color }}>
                            {sim.highRisk.pct}% ({sim.highRisk.label})
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${sim.highRisk.pct}%`,
                              background: sim.highRisk.color,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-600">
                            Nguy cơ bong võng mạc / Thoái hóa hoàng điểm
                          </span>
                          <span className="font-extrabold text-red-500">
                            {sim.retinaMult <= 1
                              ? 'Tương đương dân số chung'
                              : `Tăng gấp ${sim.retinaMult.toFixed(1)} lần`}
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-500 transition-all"
                            style={{ width: `${Math.min(100, sim.retinaMult * 8)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                      <div>
                        <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 m-0">
                          <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                          Cơ sở dữ liệu lâm sàng
                        </h3>
                        <p className="text-[11.5px] leading-relaxed text-slate-600 mt-2.5 mb-0">
                          Hệ thống mô phỏng tích hợp các báo cáo mới nhất của LAMP (Low-concentration Atropine
                          Study 5-Year Results) và thử nghiệm dự phòng cận thị khởi phát LAMP2.
                        </p>
                      </div>
                      <p className="mt-3 pt-2.5 border-t border-slate-100 text-[10px] italic text-slate-400 leading-relaxed mb-0">
                        *Các kết quả chỉ mang tính dự báo mô phỏng hỗ trợ bác sĩ tư vấn, không thay thế chẩn
                        đoán lâm sàng thực tế.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                    <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 m-0 mb-3">
                      <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                      Tài liệu tham khảo y văn (2025–2026)
                    </h3>
                    <ol className="list-decimal m-0 pl-[18px] text-[11.5px] leading-relaxed text-slate-600 space-y-2">
                      <li>
                        <strong>LAMP Study (5-Year Cohort): </strong>
                        <a
                          className="text-blue-500 font-bold hover:underline"
                          href="https://pubmed.ncbi.nlm.nih.gov/37392811/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Low-Concentration Atropine for Myopia Progression (LAMP) Study: 5-Year Results
                        </a>
                      </li>
                      <li>
                        <strong>LAMP-Prevention (LAMP2 Trial): </strong>
                        <a
                          className="text-blue-500 font-bold hover:underline"
                          href="https://pubmed.ncbi.nlm.nih.gov/36783144/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Effect of Low-Concentration Atropine Eyedrops vs Placebo on Myopia Onset in Children
                        </a>
                      </li>
                      <li>
                        <strong>IMI 2025 Clinical Digest: </strong>
                        <a
                          className="text-blue-500 font-bold hover:underline"
                          href="https://myopiainstitute.org/imi-white-papers-clinical-summaries/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          IMI White Papers &amp; Clinical Summaries
                        </a>
                      </li>
                      <li>
                        <strong>WSPOS 2025 Consensus: </strong>
                        <a
                          className="text-blue-500 font-bold hover:underline"
                          href="https://www.wspos.org/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Consensus Statement on Myopia Control Standards
                        </a>
                      </li>
                      <li>
                        <strong>Dữ liệu bách phân vị AL (đang dùng để vẽ dải tham chiếu): </strong>
                        <a
                          className="text-blue-500 font-bold hover:underline"
                          href="https://www.nature.com/articles/s41598-022-08907-5"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Sanz Diez et al. 2022, Sci Rep 12:4850 — LMS percentile curves, trẻ em Trung Quốc
                          (Wuhan, n=14.760), CC-BY mở hoàn toàn
                        </a>{' '}
                        — dùng thay thế He et al. 2023 vì bảng số của He et al. nằm trong hình/bảng không truy
                        cập được
                      </li>
                      <li>
                        <strong>Tideman et al. AL Percentiles (tham khảo nền, chưa dùng để tính): </strong>
                        <a
                          className="text-blue-500 font-bold hover:underline"
                          href="https://pubmed.ncbi.nlm.nih.gov/29265742/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Axial length growth and the risk of developing myopia in European children
                        </a>
                      </li>
                    </ol>
                  </div>

                  <div className="flex items-center gap-2.5 border border-blue-50 bg-blue-50/50 rounded-2xl px-4 py-3 text-xs text-slate-600">
                    Mô phỏng trục nhãn cầu &amp; phối trị đa tương tác theo chuẩn BHVI — tích hợp dữ liệu LAMP
                    5-Year &amp; LAMP-Prevention.
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function ProtocolCard({
  title,
  titleClass,
  mode,
  setMode,
  primary,
  setPrimary,
  combine,
  setCombine,
}: {
  title: string;
  titleClass: string;
  mode: TxMode;
  setMode: (m: TxMode) => void;
  primary: TxKey;
  setPrimary: (k: TxKey) => void;
  combine: TxKey;
  setCombine: (k: TxKey) => void;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
      <div className="flex justify-between items-center gap-2 mb-2.5">
        <label className={`text-[11px] font-extrabold uppercase tracking-wide ${titleClass}`}>{title}</label>
        <select
          className="border border-slate-200 bg-white rounded-lg px-2 py-1 text-[10px] font-bold text-slate-600"
          value={mode}
          onChange={(e) => setMode(e.target.value as TxMode)}
        >
          <option value="mono">Đơn trị liệu</option>
          <option value="combine">Phối hợp trị liệu</option>
        </select>
      </div>
      <span className="block text-[10px] font-semibold text-slate-400 mb-1">Phương pháp chính:</span>
      <select
        className={inputCls}
        value={primary}
        onChange={(e) => setPrimary(e.target.value as TxKey)}
      >
        {TX_PRIMARY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {mode === 'combine' && (
        <div className="border-t border-slate-200 pt-2 mt-2">
          <span className="block text-[10px] font-semibold text-cyan-600 mb-1">Phương pháp phối hợp thêm:</span>
          <select
            className={inputCls}
            value={combine}
            onChange={(e) => setCombine(e.target.value as TxKey)}
          >
            {TX_COMBINE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
