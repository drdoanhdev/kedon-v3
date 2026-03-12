import React, { useState, useRef, useEffect } from 'react';

interface SoKinhInputProps {
	value: string;
	onChange: (val: string) => void;
	className?: string;
	placeholder?: string;
	datalistId?: string;
	disabled?: boolean;
	dataNavOrder?: number; // thứ tự điều hướng Enter trên form cha
	onCommitNext?: () => void; // gọi khi commit bằng Enter trong ô cuối để focus ô kế tiếp
}

// Hỗ trợ "Plano" cho phần cầu (sphere), có thể kèm ADD
const REGEX_FULL = /^\s*((?:-?\d+(?:\.\d{1,2})?)|[Pp]lano)\s*\/\s*(-?\d+(?:\.\d{1,2})?)x(\d{1,3})(?:\s+ADD\s+([+-]?\d+(?:\.\d{1,2})?))?\s*$/i;
// Chỉ SPH + ADD (không loạn): "-0.50 ADD +1.25"
const REGEX_SPH_ADD = /^\s*((?:[+-]?\d+(?:\.\d{1,2})?)|[Pp]lano)\s+ADD\s+([+-]?\d+(?:\.\d{1,2})?)\s*$/i;

export const SoKinhInput: React.FC<SoKinhInputProps> = ({ value, onChange, className='', placeholder, datalistId, disabled, dataNavOrder, onCommitNext }) => {
	const [editingParts, setEditingParts] = useState(false);
	const [sph, setSph] = useState('');
	const [cyl, setCyl] = useState('');
	const [axis, setAxis] = useState('');
	const [add, setAdd] = useState('');
	const sphRef = useRef<HTMLInputElement | null>(null);
	const cylRef = useRef<HTMLInputElement | null>(null);
	const axisRef = useRef<HTMLInputElement | null>(null);
	const addRef = useRef<HTMLInputElement | null>(null);
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const focusCylOnOpenRef = useRef(false);

	const parseValueToParts = (val: string) => {
		// Full format with optional ADD: "SPH/CYLxAXIS ADD +X.XX"
		const m = REGEX_FULL.exec(val);
		if (m) return { sph: m[1], cyl: m[2], axis: m[3], add: m[4] || '' };
		// SPH + ADD only: "-0.50 ADD +1.25"
		const m2 = REGEX_SPH_ADD.exec(val);
		if (m2) return { sph: m2[1], cyl: '', axis: '', add: m2[2] };
		return { sph: '', cyl: '', axis: '', add: '' };
	};

	const formatValue = (s: string, c: string, a: string, ad: string) => {
		if (!s && !c && !a && !ad) return '';
		const normNum = (n: string) => {
			if (n === '' || n === undefined) return '';
			if (/^plano$/i.test(n.trim())) return 'Plano';
			const num = Number(n);
			if (isNaN(num)) return '';
			return num.toFixed(2).replace(/\.00$/, '.00');
		};
		const normAxis = (ax: string) => {
			if (!ax) return '';
			const num = Math.min(180, Math.max(0, Number(ax)));
			if (isNaN(num)) return '';
			return String(num);
		};
		const sFmt = normNum(s);
		const cFmt = normNum(c);
		const aFmt = normAxis(a);
		const adFmt = ad ? normNum(ad) : '';

		if (!sFmt) return '';

		let result = '';
		if (cFmt && aFmt) {
			result = `${sFmt}/${cFmt}x${aFmt}`;
		} else if (!cFmt && !aFmt) {
			// SPH only (or SPH + ADD)
			result = sFmt;
		} else {
			// Incomplete CYL/AXIS - invalid
			return '';
		}
		if (adFmt) result += ` ADD ${adFmt}`;
		return result;
	};

	const openParts = () => {
		const parts = parseValueToParts(value);
		if ((parts.sph && parts.cyl && parts.axis) || (parts.sph && parts.add)) {
			setSph(parts.sph);
			setCyl(parts.cyl);
			setAxis(parts.axis);
			setAdd(parts.add);
			focusCylOnOpenRef.current = false;
		} else {
			setSph(value);
			setCyl('');
			setAxis('');
			setAdd('');
			focusCylOnOpenRef.current = true;
		}
		setEditingParts(true);
	};

	const canCommit = () => {
		if (!sph) return false;
		const hasCyl = cyl !== '' && axis !== '';
		const hasAdd = add !== '';
		// Valid: SPH + CYL + AXIS, SPH + ADD, SPH + CYL + AXIS + ADD, or SPH alone with CYL+AXIS
		return hasCyl || hasAdd;
	};

	const commit = () => {
		const formatted = formatValue(sph, cyl, axis, add);
		if (formatted) onChange(formatted);
		setEditingParts(false);
	};
	const cancel = () => setEditingParts(false);

	useEffect(() => {
		if (editingParts) {
			requestAnimationFrame(() => {
				if (focusCylOnOpenRef.current) {
					cylRef.current?.focus();
					cylRef.current?.select();
					focusCylOnOpenRef.current = false;
				} else {
					sphRef.current?.focus();
					sphRef.current?.select();
				}
			});
		}
	}, [editingParts]);

	const handleKeyDownSingle = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === '/' && !editingParts && !disabled) {
			e.preventDefault();
			openParts();
		}
	};

	const handlePartKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, part: 'sph'|'cyl'|'axis'|'add') => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (part === 'sph') {
				cylRef.current?.focus();
				cylRef.current?.select();
			} else if (part === 'cyl') {
				axisRef.current?.focus();
				axisRef.current?.select();
			} else if (part === 'axis') {
				addRef.current?.focus();
				addRef.current?.select();
			} else if (part === 'add') {
				if (canCommit()) {
					commit();
					if (onCommitNext && typeof dataNavOrder === 'number') {
						setTimeout(() => onCommitNext(), 0);
					}
				}
			}
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	};

	useEffect(() => {
		if (!editingParts) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
				if (canCommit()) commit(); else cancel();
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [editingParts, sph, cyl, axis, add]);

	if (!editingParts) {
		return (
			<input
				type="text"
				list={datalistId}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={handleKeyDownSingle}
				data-nav={typeof dataNavOrder === 'number' ? 'presc' : undefined}
				data-order={typeof dataNavOrder === 'number' ? dataNavOrder : undefined}
				className={`bg-yellow-50 focus:bg-yellow-100 ${className}`}
				placeholder={placeholder}
				disabled={disabled}
			/>
		);
	}

		return (
		<div ref={wrapperRef} className={`inline-flex items-center gap-1 ${editingParts ? 'sokinh-split-active' : ''}`}> 
			<input
					ref={sphRef}
					type="text" /* cho phép nhập Plano */
					list={datalistId}
					value={sph}
					onChange={(e)=> setSph(e.target.value)}
					onKeyDown={(e)=>handlePartKeyDown(e,'sph')}
					className="w-16 h-7 border rounded px-1 text-xs text-center bg-yellow-50 focus:bg-yellow-100"
					placeholder="Cầu"
				/>
			<span className="text-xs select-none">/</span>
			<input
				ref={cylRef}
				type="number"
				step="0.25"
				list={datalistId}
				value={cyl}
				onChange={(e)=> setCyl(e.target.value)}
				onKeyDown={(e)=>handlePartKeyDown(e,'cyl')}
				className="no-spinner w-16 h-7 border rounded px-1 text-xs text-center bg-yellow-50 focus:bg-yellow-100"
				placeholder="Loạn"
			/>
			<span className="text-xs select-none">x</span>
			<input
				ref={axisRef}
				type="number"
				value={axis}
				onChange={(e)=> setAxis(e.target.value)}
				onKeyDown={(e)=>handlePartKeyDown(e,'axis')}
				className="no-spinner w-14 h-7 border rounded px-1 text-xs text-center bg-yellow-50 focus:bg-yellow-100"
				placeholder="Trục"
			/>
			<span className="text-xs select-none text-blue-600 font-medium">ADD</span>
			<input
				ref={addRef}
				type="number"
				step="0.25"
				value={add}
				onChange={(e)=> setAdd(e.target.value)}
				onKeyDown={(e)=>handlePartKeyDown(e,'add')}
				className="no-spinner w-14 h-7 border rounded px-1 text-xs text-center bg-blue-50 focus:bg-blue-100"
				placeholder="Add"
			/>
		</div>
	);
};

export default SoKinhInput;
