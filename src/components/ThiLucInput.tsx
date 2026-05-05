import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ThiLucInputProps {
	value: string;
	onChange: (val: string) => void;
	className?: string;
	placeholder?: string;
	disabled?: boolean;
	dataNavOrder?: number;
	dataFirstFocus?: string;
	customValues?: string[];
}

type VaItem = {
	group: string;
	display: string;
	full: string;
	snellen?: string;
	keys: string[];
};

const BASE_VA_ITEMS: VaItem[] = [
	{ group: 'Thi luc rat thap', display: 'NL', full: 'Khong nhan sang (No Light)', snellen: 'NL', keys: ['nl', '0', '00', 'npl'] },
	{ group: 'Thi luc rat thap', display: 'LP+/-', full: 'Nhan sang (Light Perception)', snellen: 'LP', keys: ['lp', 'sang', '1/inf', 'as'] },
	{ group: 'Thi luc rat thap', display: 'HM', full: 'Dem ngon tay (Hand Motion)', snellen: 'HM', keys: ['hm', 'bbd', '200/200'] },
	{ group: 'Thi luc rat thap', display: 'CF', full: 'Dem ngon tay (Counting Fingers)', snellen: 'CF', keys: ['cf', 'cnt', 'dem', 'finger', '60/600'] },

	{ group: 'Phan so 1/100-10/100', display: '1/100', full: 'Thi luc 1/100', snellen: '20/2000', keys: ['1', '01', '1/100'] },
	{ group: 'Phan so 1/100-10/100', display: '2/100', full: 'Thi luc 2/100', snellen: '20/1000', keys: ['2', '02', '2/100'] },
	{ group: 'Phan so 1/100-10/100', display: '3/100', full: 'Thi luc 3/100', snellen: '20/667', keys: ['3', '03', '3/100'] },
	{ group: 'Phan so 1/100-10/100', display: '4/100', full: 'Thi luc 4/100', snellen: '20/500', keys: ['4', '04', '4/100'] },
	{ group: 'Phan so 1/100-10/100', display: '5/100', full: 'Thi luc 5/100', snellen: '20/400', keys: ['5', '05', '5/100'] },
	{ group: 'Phan so 1/100-10/100', display: '6/100', full: 'Thi luc 6/100', snellen: '20/333', keys: ['6', '06', '6/100'] },
	{ group: 'Phan so 1/100-10/100', display: '7/100', full: 'Thi luc 7/100', snellen: '20/286', keys: ['7', '07', '7/100'] },
	{ group: 'Phan so 1/100-10/100', display: '8/100', full: 'Thi luc 8/100', snellen: '20/250', keys: ['8', '08', '8/100'] },
	{ group: 'Phan so 1/100-10/100', display: '9/100', full: 'Thi luc 9/100', snellen: '20/222', keys: ['9', '09', '9/100'] },
	{ group: 'Phan so 1/100-10/100', display: '10/100', full: 'Thi luc 10/100', snellen: '20/200', keys: ['10', '10/100', '1/10'] },

	{ group: 'Phan so 12/100-50/100', display: '12/100', full: 'Thi luc 12/100', snellen: '20/160', keys: ['12', '12/100'] },
	{ group: 'Phan so 12/100-50/100', display: '15/100', full: 'Thi luc 15/100', snellen: '20/133', keys: ['15', '15/100'] },
	{ group: 'Phan so 12/100-50/100', display: '20/100', full: 'Thi luc 20/100 = 2/10', snellen: '20/100', keys: ['20', '2/10', '20/100'] },
	{ group: 'Phan so 12/100-50/100', display: '25/100', full: 'Thi luc 25/100', snellen: '20/80', keys: ['25', '25/100'] },
	{ group: 'Phan so 12/100-50/100', display: '30/100', full: 'Thi luc 30/100 = 3/10', snellen: '20/67', keys: ['30', '3/10', '30/100'] },
	{ group: 'Phan so 12/100-50/100', display: '40/100', full: 'Thi luc 40/100 = 4/10', snellen: '20/50', keys: ['40', '4/10', '40/100'] },
	{ group: 'Phan so 12/100-50/100', display: '50/100', full: 'Thi luc 50/100 = 5/10', snellen: '20/40', keys: ['50', '5/10', '50/100'] },

	{ group: 'Phan so 60/100-10/10', display: '60/100', full: 'Thi luc 60/100 = 6/10', snellen: '20/33', keys: ['60', '6/10', '60/100'] },
	{ group: 'Phan so 60/100-10/10', display: '70/100', full: 'Thi luc 70/100 = 7/10', snellen: '20/29', keys: ['70', '7/10', '70/100'] },
	{ group: 'Phan so 60/100-10/10', display: '80/100', full: 'Thi luc 80/100 = 8/10', snellen: '20/25', keys: ['80', '8/10', '80/100'] },
	{ group: 'Phan so 60/100-10/10', display: '90/100', full: 'Thi luc 90/100 = 9/10', snellen: '20/22', keys: ['90', '9/10', '90/100'] },
	{ group: 'Phan so 60/100-10/10', display: '10/10', full: 'Thi luc 10/10 (binh thuong)', snellen: '20/20', keys: ['10/10', '100', '100/100', '1'] },
	{ group: 'Phan so >10/10', display: '12/10', full: 'Thi luc 12/10', snellen: '20/16', keys: ['12/10'] },
	{ group: 'Phan so >10/10', display: '15/10', full: 'Thi luc 15/10', snellen: '20/13', keys: ['15/10'] },
	{ group: 'Phan so >10/10', display: '20/10', full: 'Thi luc 20/10', snellen: '20/10', keys: ['20/10'] },
];

const normalize = (v: string) => v.trim().toLowerCase();

const normalizeShortcutDisplay = (raw: string): string | null => {
	const text = raw.trim();
	if (!text) return null;
	if (/^0+$/.test(text)) return null;

	if (/^\d$/.test(text)) {
		return `${parseInt(text, 10)}/10`;
	}

	if (/^\d{2}$/.test(text)) {
		const n = parseInt(text, 10);
		if (n === 10) return '10/10';
		return `${n}/100`;
	}

	const m = text.match(/^(\d{1,2})\/(10|100)$/);
	if (m) {
		if (parseInt(m[1], 10) === 0) return null;
		return `${parseInt(m[1], 10)}/${m[2]}`;
	}

	return null;
};

const resolveDisplayValue = (raw: string, allItems: VaItem[]): string | null => {
	// Uu tien quy tac moi: 1 chu so => /10, 2 chu so => /100
	const shortcut = normalizeShortcutDisplay(raw);
	if (shortcut) return shortcut;

	const exact = findExactMatch(raw, allItems);
	return exact ? exact.display : null;
};

const isExact = (item: VaItem, raw: string) => {
	const q = normalize(raw);
	if (!q) return false;
	return item.keys.some(k => normalize(k) === q) || normalize(item.display) === q;
};

const findMatches = (raw: string, allItems: VaItem[]) => {
	const q = normalize(raw);
	if (!q) return [] as VaItem[];
	const exact: VaItem[] = [];
	const starts: VaItem[] = [];
	const contains: VaItem[] = [];

	for (const item of allItems) {
		let matched = false;
		if (item.keys.some(k => normalize(k) === q) || normalize(item.display) === q) {
			exact.push(item);
			matched = true;
		}
		if (!matched && (item.keys.some(k => normalize(k).startsWith(q)) || normalize(item.display).startsWith(q))) {
			starts.push(item);
			matched = true;
		}
		if (!matched && (item.keys.some(k => normalize(k).includes(q)) || normalize(item.display).includes(q) || normalize(item.full).includes(q))) {
			contains.push(item);
		}
	}

	const seen = new Set<string>();
	const merged: VaItem[] = [];
	for (const arr of [exact, starts, contains]) {
		for (const item of arr) {
			if (seen.has(item.display)) continue;
			seen.add(item.display);
			merged.push(item);
		}
	}

	const shortcutDisplay = normalizeShortcutDisplay(raw);
	if (shortcutDisplay) {
		const idx = merged.findIndex((item) => item.display === shortcutDisplay);
		if (idx > 0) {
			const [existing] = merged.splice(idx, 1);
			merged.unshift(existing);
		} else if (idx === -1) {
			merged.unshift({
				group: 'Quy tac nhanh',
				display: shortcutDisplay,
				full: `Goi y nhanh ${shortcutDisplay}`,
				keys: [q],
			});
		}
	}

	return merged.slice(0, 8);
};

const findExactMatch = (raw: string, allItems: VaItem[]): VaItem | null => {
	if (!raw.trim()) return null;
	for (const item of allItems) {
		if (isExact(item, raw)) return item;
	}
	return null;
};

const buildItems = (customValues: string[] | undefined): VaItem[] => {
	if (!customValues || customValues.length === 0) return BASE_VA_ITEMS;
	const seenDisplay = new Set(BASE_VA_ITEMS.map(i => normalize(i.display)));
	const extras: VaItem[] = [];
	for (const raw of customValues) {
		const v = raw?.trim();
		if (!v) continue;
		const n = normalize(v);
		if (seenDisplay.has(n)) continue;
		extras.push({
			group: 'Mau cua phong kham',
			display: v,
			full: v,
			keys: [n],
		});
		seenDisplay.add(n);
	}
	return [...BASE_VA_ITEMS, ...extras];
};

export const ThiLucInput: React.FC<ThiLucInputProps> = ({
	value,
	onChange,
	className = '',
	placeholder,
	disabled,
	dataNavOrder,
	dataFirstFocus,
	customValues,
}) => {
	const [raw, setRaw] = useState(value || '');
	const [focused, setFocused] = useState(false);
	const [status, setStatus] = useState<'idle' | 'valid' | 'error'>('idle');
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const [mounted, setMounted] = useState(false);
	const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 0 });

	const inputRef = useRef<HTMLInputElement | null>(null);
	const wrapperRef = useRef<HTMLSpanElement | null>(null);
	const panelRef = useRef<HTMLDivElement | null>(null);

	const allItems = useMemo(() => buildItems(customValues), [customValues]);
	const matches = useMemo(() => findMatches(raw, allItems), [raw, allItems]);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!focused) {
			setRaw(value || '');
			setStatus(value && resolveDisplayValue(value, allItems) ? 'valid' : 'idle');
		}
	}, [value, focused, allItems]);

	const updateDropdownPosition = () => {
		if (!inputRef.current) return;
		const rect = inputRef.current.getBoundingClientRect();
		const rows = Math.min(matches.length, 8);
		const estimatedHeight = Math.min(280, rows * 36 + 36);
		const spaceBelow = window.innerHeight - rect.bottom;
		const openUp = spaceBelow < estimatedHeight + 8 && rect.top > estimatedHeight;
		setDropdownPos({
			left: rect.left,
			width: rect.width,
			top: openUp ? Math.max(8, rect.top - estimatedHeight - 2) : rect.bottom + 2,
		});
	};

	useEffect(() => {
		if (!open) return;
		updateDropdownPosition();
		const onResize = () => updateDropdownPosition();
		window.addEventListener('resize', onResize);
		window.addEventListener('scroll', onResize, true);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('scroll', onResize, true);
		};
	}, [open, matches.length]);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (evt: MouseEvent) => {
			const target = evt.target as Node;
			if (wrapperRef.current?.contains(target)) return;
			if (panelRef.current?.contains(target)) return;
			setOpen(false);
		};
		document.addEventListener('mousedown', onPointerDown);
		return () => document.removeEventListener('mousedown', onPointerDown);
	}, [open]);

	const commitItem = (item: VaItem) => {
		setRaw(item.display);
		setStatus('valid');
		onChange(item.display);
		setOpen(false);
	};

	const commitRaw = () => {
		const text = raw.trim();
		if (!text) {
			setStatus('idle');
			setOpen(false);
			if (value !== '') onChange('');
			return true;
		}
		const resolved = resolveDisplayValue(text, allItems);
		if (resolved) {
			setRaw(resolved);
			setStatus('valid');
			onChange(resolved);
			setOpen(false);
			return true;
		}
		setStatus('error');
		setOpen(false);
		return false;
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const text = e.target.value;
		setRaw(text);
		if (!text.trim()) {
			setStatus('idle');
			setOpen(false);
			return;
		}
		setStatus(resolveDisplayValue(text, allItems) ? 'valid' : 'idle');
		setOpen(true);
		setActiveIndex(0);
	};

	const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
		setFocused(true);
		if (raw.trim()) {
			setOpen(true);
			setActiveIndex(0);
		}
		try { e.target.select(); } catch {}
	};

	const handleBlur = () => {
		setFocused(false);
		commitRaw();
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown') {
			if (!open && matches.length > 0) setOpen(true);
			if (matches.length > 0) {
				e.preventDefault();
				setActiveIndex((prev) => Math.min(prev + 1, matches.length - 1));
			}
			return;
		}
		if (e.key === 'ArrowUp') {
			if (matches.length > 0) {
				e.preventDefault();
				setActiveIndex((prev) => Math.max(prev - 1, 0));
			}
			return;
		}
		if (e.key === 'Escape') {
			setOpen(false);
			return;
		}
		if (e.key === 'Enter') {
			if (open && matches[activeIndex]) {
				e.preventDefault();
				commitItem(matches[activeIndex]);
				return;
			}
			const ok = commitRaw();
			if (!ok) {
				e.preventDefault();
				e.stopPropagation();
			}
		}
		if (e.key === 'Tab' && open && matches[activeIndex]) {
			commitItem(matches[activeIndex]);
		}
	};

	const dropdown = open && matches.length > 0 && mounted ? createPortal(
		<div
			ref={panelRef}
			className="z-[1400] bg-white border border-gray-200 rounded-md overflow-hidden shadow-lg"
			style={{
				position: 'fixed',
				left: dropdownPos.left,
				top: dropdownPos.top,
				width: dropdownPos.width,
				maxHeight: 280,
				overflowY: 'auto',
			}}
		>
			{matches.map((item, idx) => {
				return (
					<React.Fragment key={`${item.group}-${item.display}`}>
						<button
							type="button"
							className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 ${idx === activeIndex ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}
							onMouseDown={(evt) => {
								evt.preventDefault();
								commitItem(item);
							}}
						>
							<span className="font-mono font-semibold text-gray-900 min-w-[70px]">{item.display}</span>
							<span className="text-[10px] text-gray-500 truncate">{item.full}</span>
							{item.snellen && <span className="ml-auto text-[10px] text-gray-400">{item.snellen}</span>}
						</button>
					</React.Fragment>
				);
			})}
		</div>,
		document.body,
	) : null;

	return (
		<>
			<span ref={wrapperRef} className="relative inline-block w-full">
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
					data-first-focus={dataFirstFocus}
					disabled={disabled}
					placeholder={placeholder ?? 'vd: 3, 10, cf...'}
					autoComplete="off"
					spellCheck={false}
					className={`${status === 'error' ? 'border-red-500 ring-1 ring-red-300' : ''} ${status === 'valid' ? 'border-green-600' : ''} ${className}`}
				/>
			</span>
			{dropdown}
		</>
	);
};

export default ThiLucInput;