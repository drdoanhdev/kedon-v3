import { BottomSheet } from './BottomSheet';
import { PatientSearchPanel, type PatientSearchPanelProps } from './PatientSearchPanel';

export function PatientSearchSheet({
  open,
  isDesktop,
  onClose,
  panelProps,
}: {
  open: boolean;
  isDesktop: boolean;
  onClose: () => void;
  panelProps: Omit<PatientSearchPanelProps, 'variant' | 'onClose'>;
}) {
  if (!open) return null;

  if (isDesktop) {
    return (
      <div className="hidden md:block fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Tìm khách hàng nhanh">
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
          aria-label="Đóng tìm kiếm nhanh"
        />
        <div className="absolute left-1/2 top-12 w-[min(520px,86vw)] -translate-x-1/2">
          <PatientSearchPanel variant="desktop" onClose={onClose} {...panelProps} />
        </div>
      </div>
    );
  }

  return (
    <BottomSheet onClose={onClose} fullHeight sheetId="mbn-search-sheet" ariaLabelledBy="mbn-search-title">
      <PatientSearchPanel variant="mobile" onClose={onClose} {...panelProps} />
    </BottomSheet>
  );
}
