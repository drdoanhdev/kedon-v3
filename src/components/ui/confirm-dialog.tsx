"use client"

import * as React from "react"
import { createContext, useContext, useState, useCallback, useRef } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { AlertTriangle, Trash2, Info, HelpCircle, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type ConfirmVariant = "danger" | "warning" | "info" | "confirm"

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>
  alert: (options: Omit<ConfirmOptions, 'cancelText'> | string) => Promise<void>
}

const ConfirmContext = createContext<ConfirmContextType | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider")
  return ctx
}

const variantConfig = {
  danger: {
    icon: Trash2,
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    confirmBtn: "bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    confirmBtn: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 text-white",
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    confirmBtn: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white",
  },
  confirm: {
    icon: HelpCircle,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    confirmBtn: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white",
  },
}

function detectVariant(message: string): ConfirmVariant {
  if (/xóa|xoá|delete|remove/i.test(message)) return "danger"
  if (/cảnh báo|warning/i.test(message)) return "warning"
  return "confirm"
}

function detectTitle(message: string, variant: ConfirmVariant): string {
  switch (variant) {
    case "danger": return "Xác nhận xóa"
    case "warning": return "Cảnh báo"
    case "info": return "Thông báo"
    case "confirm": return "Xác nhận"
  }
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions & { isAlert?: boolean }>({
    message: "",
  })
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const normalized: ConfirmOptions =
        typeof opts === "string" ? { message: opts } : opts
      const variant = normalized.variant || detectVariant(normalized.message)
      const title = normalized.title || detectTitle(normalized.message, variant)
      setOptions({
        ...normalized,
        variant,
        title,
        confirmText: normalized.confirmText || "Xác nhận",
        cancelText: normalized.cancelText || "Hủy",
      })
      resolveRef.current = resolve
      setOpen(true)
    })
  }, [])

  const alert = useCallback((opts: Omit<ConfirmOptions, 'cancelText'> | string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const normalized: ConfirmOptions =
        typeof opts === "string" ? { message: opts } : opts
      const variant = normalized.variant || "info"
      const title = normalized.title || detectTitle(normalized.message, variant)
      setOptions({
        ...normalized,
        variant,
        title,
        confirmText: normalized.confirmText || "Đã hiểu",
        isAlert: true,
      })
      resolveRef.current = () => resolve()
      setOpen(true)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setOpen(false)
    resolveRef.current?.(true)
    resolveRef.current = null
  }, [])

  const handleCancel = useCallback(() => {
    setOpen(false)
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  const variant = options.variant || "confirm"
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) handleCancel() }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed top-[50%] left-[50%] z-[10000] w-full max-w-[420px] translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-white shadow-2xl border border-gray-200/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className={cn("w-14 h-14 rounded-full flex items-center justify-center", config.iconBg)}>
                  <Icon className={cn("w-7 h-7", config.iconColor)} />
                </div>
              </div>

              {/* Title */}
              <DialogPrimitive.Title className="text-lg font-semibold text-gray-900 text-center mb-2">
                {options.title}
              </DialogPrimitive.Title>

              {/* Message */}
              <DialogPrimitive.Description className="text-sm text-gray-600 text-center leading-relaxed whitespace-pre-line">
                {options.message}
              </DialogPrimitive.Description>
            </div>

            {/* Actions */}
            <div className={cn(
              "flex gap-3 px-6 pb-6",
              options.isAlert ? "justify-center" : "justify-center"
            )}>
              {!options.isAlert && (
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {options.cancelText}
                </button>
              )}
              <button
                onClick={handleConfirm}
                autoFocus
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1",
                  config.confirmBtn
                )}
              >
                {options.confirmText}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </ConfirmContext.Provider>
  )
}
