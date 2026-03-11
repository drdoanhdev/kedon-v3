import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from './button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showPageInfo?: boolean;
  className?: string;
}

export function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  showPageInfo = true,
  className = ""
}: PaginationProps) {
  const getVisiblePages = () => {
    const delta = 2; // Số trang hiển thị trước và sau trang hiện tại
    const range = [];
    const rangeWithDots = [];

    // Tính toán range pages
    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      range.push(i);
    }

    // Thêm trang đầu
    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    // Thêm range pages
    rangeWithDots.push(...range);

    // Thêm trang cuối
    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages);
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }

    return rangeWithDots;
  };

  if (totalPages <= 1) return null;

  const visiblePages = getVisiblePages();

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
      {showPageInfo && (
        <div className="text-sm text-muted-foreground order-2 sm:order-1">
          Trang {currentPage} / {totalPages}
        </div>
      )}
      
      <div className="flex items-center gap-1 order-1 sm:order-2">
        {/* Previous button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="h-9 w-9 p-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        {/* Page numbers */}
        {visiblePages.map((page, index) => {
          if (page === '...') {
            return (
              <div key={`dots-${index}`} className="flex items-center justify-center w-9 h-9">
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </div>
            );
          }

          const pageNumber = page as number;
          return (
            <Button
              key={pageNumber}
              variant={currentPage === pageNumber ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(pageNumber)}
              className="h-9 w-9 p-0"
            >
              {pageNumber}
            </Button>
          );
        })}

        {/* Next button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-9 w-9 p-0"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Quick jump input - Desktop only */}
      <div className="hidden lg:flex items-center gap-2 text-sm order-3">
        <span className="text-muted-foreground">Chuyển đến:</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          className="w-16 px-2 py-1 text-center border rounded text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const page = parseInt((e.target as HTMLInputElement).value);
              if (page >= 1 && page <= totalPages) {
                onPageChange(page);
                (e.target as HTMLInputElement).value = '';
              }
            }
          }}
          placeholder="..."
        />
      </div>
    </div>
  );
}

// Simplified pagination for mobile
export function SimplePagination({ 
  currentPage, 
  totalPages, 
  onPageChange,
  className = ""
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="flex items-center gap-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Trước
      </Button>

      <span className="text-sm text-muted-foreground font-medium">
        {currentPage} / {totalPages}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="flex items-center gap-2"
      >
        Sau
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
