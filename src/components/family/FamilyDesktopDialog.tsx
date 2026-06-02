'use client';

import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface FamilyDesktopDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/** Dialog nhóm gia đình — chỉ hiển thị từ breakpoint lg trở lên. */
export default function FamilyDesktopDialog({
  open,
  onClose,
  title = 'Nhóm gia đình',
  children,
}: FamilyDesktopDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogPrimitive.Overlay
          className={cn(
            'max-lg:hidden fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'max-lg:hidden fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg',
            'max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-0',
            'overflow-hidden rounded-xl border bg-white p-0 shadow-lg duration-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-gray-100">
            <DialogTitle className="text-sm font-bold">{title}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto overscroll-y-contain px-4 py-3 max-h-[calc(85vh-56px)]">
            {children}
          </div>
          <DialogPrimitive.Close className="absolute top-3.5 right-3.5 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <span className="sr-only">Đóng</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
