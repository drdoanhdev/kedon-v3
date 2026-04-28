"use client"

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth, supabaseAuth } from './AuthContext'

export interface Branch {
  id: string
  tenant_id: string
  ten_chi_nhanh: string
  dia_chi?: string | null
  dien_thoai?: string | null
  is_main: boolean
  status: string
}

interface BranchContextType {
  branches: Branch[]
  currentBranchId: string | null
  currentBranch: Branch | null
  switchBranch: (branchId: string | null) => void
  refreshBranches: () => Promise<void>
  branchLoading: boolean
  /** true if tenant has enterprise plan with multi-branch */
  isMultiBranch: boolean
}

const BranchContext = createContext<BranchContextType | undefined>(undefined)

export const useBranch = () => {
  const context = useContext(BranchContext)
  if (context === undefined) {
    throw new Error('useBranch must be used within BranchProvider')
  }
  return context
}

export const BranchProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, currentTenantId, currentTenant, currentRole } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null)
  const [branchLoading, setBranchLoading] = useState(false)

  const isMultiBranch = currentTenant?.plan === 'enterprise'

  const fetchBranches = useCallback(async () => {
    if (!user || !currentTenantId) {
      setBranches([])
      setCurrentBranchId(null)
      return
    }

    setBranchLoading(true)
    try {
      // For enterprise: load branches from staff_assignments (what user has access to)
      // Owner/admin see all branches
      const isAdmin = currentRole === 'owner' || currentRole === 'admin'

      if (isAdmin) {
        const { data, error } = await supabaseAuth
          .from('branches')
          .select('id, tenant_id, ten_chi_nhanh, dia_chi, dien_thoai, is_main, status')
          .eq('tenant_id', currentTenantId)
          .eq('status', 'active')
          .order('is_main', { ascending: false })
          .order('ten_chi_nhanh')

        if (!error && data) setBranches(data)
      } else {
        // Staff/doctor: only branches they're assigned to
        const { data, error } = await supabaseAuth
          .from('staff_assignments')
          .select('branch_id, branches!inner(id, tenant_id, ten_chi_nhanh, dia_chi, dien_thoai, is_main, status)')
          .eq('tenant_id', currentTenantId)
          .eq('user_id', user.id)
          .is('to_date', null)

        if (!error && data) {
          const branchList = data
            .map((sa: any) => sa.branches)
            .filter((b: any) => b && b.status === 'active')
          setBranches(branchList)
        }
      }
    } catch {
      // silent
    } finally {
      setBranchLoading(false)
    }
  }, [user, currentTenantId, currentRole])

  // Auto-select branch
  useEffect(() => {
    if (!isMultiBranch) {
      // Non-enterprise: no branch filtering
      setCurrentBranchId(null)
      return
    }

    if (branches.length === 0) {
      setCurrentBranchId(null)
      return
    }

    // Try restore from localStorage
    const storageKey = `currentBranchId_${currentTenantId}`
    let stored: string | null = null
    try { stored = localStorage.getItem(storageKey) } catch {}

    if (stored && branches.some(b => b.id === stored)) {
      setCurrentBranchId(stored)
      return
    }

    // Default: main branch or first
    const main = branches.find(b => b.is_main)
    const fallbackBranchId = main?.id || branches[0]?.id || null
    setCurrentBranchId(fallbackBranchId)
    if (fallbackBranchId && currentTenantId) {
      try {
        localStorage.setItem(`currentBranchId_${currentTenantId}`, fallbackBranchId)
      } catch {}
    }
  }, [branches, isMultiBranch, currentTenantId])

  // Fetch branches when tenant changes
  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  const switchBranch = useCallback((branchId: string | null) => {
    setCurrentBranchId(branchId)
    if (currentTenantId) {
      const storageKey = `currentBranchId_${currentTenantId}`
      try {
        if (branchId) localStorage.setItem(storageKey, branchId)
        else localStorage.removeItem(storageKey)
      } catch {}
    }
  }, [currentTenantId])

  const currentBranch = branches.find(b => b.id === currentBranchId) || null

  return (
    <BranchContext.Provider value={{
      branches,
      currentBranchId,
      currentBranch,
      switchBranch,
      refreshBranches: fetchBranches,
      branchLoading,
      isMultiBranch,
    }}>
      {children}
    </BranchContext.Provider>
  )
}
