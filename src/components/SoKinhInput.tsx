import React, { useState, useRef, useEffect } from 'react';

/**
 * RxFreeInput — Nhập số kính dạng free-text theo spec optigo-rx-freetext-spec.
 *
 * Quy tắc gõ tắt (token cách nhau bằng dấu cách):
 *   Token1 → SPH (3 chữ số → ÷100, mặc định âm; +75 → +0.75; 0/pl/plano → Plano)
 *   Token2 → CYL (luôn âm; nếu giá trị nằm trong khoảng ADD và không có Token3 thì là ADD)
 *   Token3 → AXIS (1–180)
 *   Token4 → ADD  (luôn dương, +0.75 đến +4.00)
 *
 * Ví dụ:
 *   "300 100 180 150"  →  -3.00/-1.00x180 ADD +1.50
 *   "+75 200"          →  +0.75 ADD +2.00
 *   "0 125"            →  Plano ADD +1.25
 *   "pl"               →  Plano
 *
 * Component giữ nguyên API hiện tại để không phá ke-don-kinh.tsx.
 */
interface SoKinhInputProps {
	value: string;
	onChange: (val: string) => void;
	className?: string;
	placeholder?: string;
	datalistId?: string;
	disabled?: boolean;
	dataNavOrder?: number; // thứ tự điều hướng Enter trên form cha
	onCommitNext?: () => void; // gọi khi commit bằng Enter để focus ô kế tiếp
}

type RxValue = {
	sph: number | 'plano' | null;
	cyl: number | null;
	axis: number | null;
	add: number | null;
};

const REGEX_FULL = /^\s*((?:[+-]?\d+(?:\.\d{1,2})?)|[Pp]lano)\s*\/\s*([+-]?\d+(?:\.\d{1,2})?)x(\d{1,3})(?:\s+ADD\s+([+-]?\d+(?:\.\d{1,2})?))?\s*$/i;
const REGEX_SPH_ADD = /^\s*((?:[+-]?\d+(?:\.\d{1,2})?)|[Pp]lano)\s+ADD\s+([+-]?\d+(?:\.\d{1,2})?)\s*$/i;
const REGEX_SPH_ONLY = /^\s*((?:[+-]?\d+(?:\.\d{1,2})?)|[Pp]lano)\s*$/i;

const roundQuarter = (n: number) => Math.round(n / 0.25) * 0.25;

/** Parse 1 token số kính (SPH/CYL/ADD). defaultNegative = mặc định âm khi không có dấu. */
const parseDiopter = (token: string, defaultNegative: boolean): number | null => {
	const t = token.trim();
	if (!t) return null;
	const hasPlus = t.startsWith('+');
	const hasMinus = t.startsWith('-');
	const sign = hasPlus ? 1 : hasMinus ? -1 : (defaultNegative ? -1 : 1);
	const digits = t.replace(/^[+-]/, '');
	if (!/^\d+(\.\d+)?$/.test(digits)) return null;
	const n = parseFloat(digits);
	if (isNaN(n)) return null;
	let val: number;
	if (digits.includes('.')) {
		val = n;                         // có dấu chấm: giữ nguyên (vd: 1.25 → 1.25)
	} else if (digits.length === 1) {
		val = n;                         // 1 chữ số: số nguyên đi-ốp (1 → 1.00)
	} else {
		val = n / 100;                   // ≥ 2 chữ số: chia 100 (75 → 0.75, 125 → 1.25, 1025 → 10.25)
	}
	return roundQuarter(sign * val);
};

const isZeroDiopterToken = (t: string) => /^[+-]?0+(?:\.0+)?$/.test(t.trim());
const isPlanoToken = (t: string) => /^(pl|plano)$/i.test(t.trim()) || isZeroDiopterToken(t);

const canonicalSph = (token: string): number | 'plano' => {
	if (/^plano$/i.test(token)) return 'plano';
	const n = parseFloat(token);
	if (isNaN(n)) return 'plano';
	return n === 0 || Object.is(n, -0) ? 'plano' : n;
};

const parseSph = (token: string): number | 'plano' | null => {
	if (isPlanoToken(token)) return 'plano';
	return parseDiopter(token, true);
};

const parseCyl = (token: string): number | null => {
	const v = parseDiopter(token, true);
	if (v === null) return null;
	if (v === 0) return null;
	return v > 0 ? -v : v; // luôn âm
};

const parseAxisToken = (token: string): number | null => {
	const t = token.trim();
	if (!/^\d{1,3}$/.test(t)) return null;
	const n = parseInt(t, 10);
	if (n < 1 || n > 180) return null;
	return n;
};

const parseAdd = (token: string): number | null => {
	const v = parseDiopter(token, false);
	if (v === null) return null;
	return Math.abs(v);
};

const isValidAddRange = (n: number | null) => n !== null && n >= 0.75 && n <= 4.0;

/** Parse free-text → RxValue theo spec. */
const parseRxInput = (raw: string): RxValue | null => {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;
	const sph = parseSph(tokens[0]);
	if (sph === null) return null;

	let cyl: number | null = null;
	let axis: number | null = null;
	let add: number | null = null;

	if (tokens.length === 2) {
		// Phân biệt CYL vs ADD: nếu token nằm trong khoảng ADD hợp lệ → ADD
		const asAdd = parseAdd(tokens[1]);
		if (isValidAddRange(asAdd)) {
			add = asAdd;
		} else {
			cyl = parseCyl(tokens[1]);
		}
	} else if (tokens.length >= 3) {
		cyl = parseCyl(tokens[1]);
		axis = parseAxisToken(tokens[2]);
		if (tokens[3]) add = parseAdd(tokens[3]);
	}

	return { sph, cyl, axis, add };
};

/** Nhận diện chuỗi đã ở dạng chuẩn (SPH/CYLxAXIS [ADD ±X.XX]) để re-edit không phá format. */
const parseCanonical = (text: string): RxValue | null => {
	const t = text.trim();
	let m = REGEX_FULL.exec(t);
	if (m) {
		const sph = canonicalSph(m[1]);
		return {
			sph,
			cyl: parseFloat(m[2]),
			axis: parseInt(m[3], 10),
			add: m[4] ? Math.abs(parseFloat(m[4])) : null,
		};
	}
	m = REGEX_SPH_ADD.exec(t);
	if (m) {
		const sph = canonicalSph(m[1]);
		return { sph, cyl: null, axis: null, add: Math.abs(parseFloat(m[2])) };
	}
	m = REGEX_SPH_ONLY.exec(t);
	if (m) {
		const sphRaw = m[1];
		// Chỉ coi là dạng chuẩn nếu có dấu chấm (vd: "-3.00", "+0.75", "1.25")
		// hoặc là Plano. Số nguyên trần ("1", "100", "300") sẽ rơi xuống free-text parser.
		if (!/^plano$/i.test(sphRaw) && !sphRaw.includes('.')) return null;
		const sph = canonicalSph(sphRaw);
		return { sph, cyl: null, axis: null, add: null };
	}
	return null;
};

const formatRx = (rx: RxValue | null): string => {
	if (!rx || rx.sph === null) return '';
	const sphStr = rx.sph === 'plano' || (typeof rx.sph === 'number' && rx.sph === 0)
		? 'Plano'
		: (rx.sph >= 0 ? '+' : '') + rx.sph.toFixed(2);
	let result = sphStr;
	if (rx.cyl !== null && rx.axis !== null) {
		result += `/${rx.cyl.toFixed(2)}x${rx.axis}`;
	}
	if (rx.add !== null) {
		const addStr = (rx.add >= 0 ? '+' : '') + rx.add.toFixed(2);
		result += ` add ${addStr}`;
	}
	return result;
};

const validateRx = (rx: RxValue | null): { valid: boolean; message: string | null } => {
	if (!rx) return { valid: false, message: 'Không nhận dạng được số kính' };
	if (rx.cyl !== null && rx.axis === null) return { valid: false, message: 'Thiếu trục (1–180°)' };
	if (rx.axis !== null && (rx.axis < 1 || rx.axis > 180)) return { valid: false, message: 'Trục phải 1–180°' };
	return { valid: true, message: null };
};

export const SoKinhInput: React.FC<SoKinhInputProps> = ({ value, onChange, className='', placeholder, datalistId: _datalistId, disabled, dataNavOrder, onCommitNext }) => {
	const [raw, setRaw] = useState<string>(value || '');
	const [focused, setFocused] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<RxValue | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// Đồng bộ raw khi prop value đổi từ ngoài và ô không đang focus
	useEffect(() => {
		if (!focused) setRaw(value || '');
	}, [value, focused]);

	// Cố gắng parse: ưu tiên dạng chuẩn (đang re-edit), sau đó free-text
	const tryParse = (text: string): RxValue | null => {
		const t = text.trim();
		if (!t) return null;
		return parseCanonical(t) ?? parseRxInput(t);
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const text = e.target.value;
		setRaw(text);
		setError(null);
		if (text.trim() === '') { setPreview(null); return; }
		setPreview(tryParse(text));
	};

	const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
		setFocused(true);
		// chọn toàn bộ để gõ thay thế nhanh
		try { e.target.select(); } catch {}
	};

	/** Commit raw → onChange. Trả về true nếu hợp lệ (hoặc rỗng). */
	const commitFromRaw = (): boolean => {
		const text = raw.trim();
		if (text === '') {
			if (value !== '') onChange('');
			setError(null);
			setPreview(null);
			return true;
		}
		const parsed = tryParse(text);
		const v = validateRx(parsed);
		if (v.valid && parsed) {
			const formatted = formatRx(parsed);
			setRaw(formatted);
			setPreview(null);
			setError(null);
			if (formatted !== value) onChange(formatted);
			return true;
		}
		setError(v.message || 'Không hợp lệ');
		return false;
	};

	const handleBlur = () => {
		setFocused(false);
		commitFromRaw();
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const ok = commitFromRaw();
			if (!ok) {
				e.stopPropagation();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			setRaw('');
			setPreview(null);
			setError(null);
		}
	};

	// Preview chỉ hiện khi đang focus, có giá trị parse được, và khác với chuỗi đã canonical
	const formattedPreview = preview ? formatRx(preview) : '';
	const showPreview = focused && !!formattedPreview && formattedPreview !== raw.trim() && !error;

	return (
		<span className={`relative inline-block ${className ? '' : 'w-full'}`}>
			<input
				ref={inputRef}
				type="text"
				value={raw}
				onChange={handleChange}
				onFocus={handleFocus}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				data-nav={typeof dataNavOrder === 'number' ? 'presc' : undefined}
				data-order={typeof dataNavOrder === 'number' ? dataNavOrder : undefined}
				className={`bg-yellow-50 focus:bg-yellow-100 ${error ? 'border-red-500 ring-1 ring-red-400' : ''} ${className}`}
				placeholder={placeholder ?? 'vd: 300 100 180 150'}
				disabled={disabled}
				autoComplete="off"
				spellCheck={false}
			/>
			{showPreview && (
				<span className="absolute left-0 top-full mt-0.5 z-20 px-1.5 py-0.5 rounded bg-gray-700 text-white text-[10px] whitespace-nowrap pointer-events-none shadow sm:top-auto sm:bottom-full sm:mb-0.5 sm:mt-0">
					{formattedPreview}
				</span>
			)}
			{error && (
				<span className="absolute left-0 top-full mt-0.5 z-20 px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] whitespace-nowrap pointer-events-none shadow sm:top-auto sm:bottom-full sm:mb-0.5 sm:mt-0">
					{error}
				</span>
			)}
		</span>
	);
};

export default SoKinhInput;
