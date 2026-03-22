"use client"

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

// Tạo client riêng cho auth với anon key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})
export const supabase = supabaseAuth // Alias để tương thích

// --- Multi-tenant temporary types (tạm thời) ---
export interface Tenant {
  id: string
  name?: string | null
  code?: string | null
  status?: string | null
}

export interface TenantMembership {
  tenant_id: string
  user_id: string
  role: string
  active?: boolean
  last_login_at?: string | null
}

export interface UserProfile {
  id: string
  full_name?: string | null
  phone?: string | null
  default_tenant_id?: string | null
  default_tenant?: string | null // fallback older column name
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  // Multi-tenant (mới)
  tenants: Tenant[]
  memberships: TenantMembership[]
  currentTenantId: string | null
  currentTenant: Tenant | null
  currentRole: string | null
  switchTenant: (tenantId: string) => void
  refreshTenancy: () => Promise<void>
  tenancyLoading: boolean
  userProfile: UserProfile | null
  // Role-based access control
  userRole: 'superadmin' | 'admin' | 'doctor' | 'staff' | null
  hasRole: (role: 'superadmin' | 'admin' | 'doctor' | 'staff') => boolean
  hasAnyRole: (roles: string[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // --- Multi-tenant state (tạm thời) ---
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [memberships, setMemberships] = useState<TenantMembership[]>([])
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [tenancyLoading, setTenancyLoading] = useState(false)
  // Role-based access control
  const [userRole, setUserRole] = useState<'superadmin' | 'admin' | 'doctor' | 'staff' | null>(null)
  // Auto-logout timer
  const sessionTimeout = Number(process.env.NEXT_PUBLIC_SESSION_TIMEOUT) || 1800000 // default 30min
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null)
  const userRef = useRef<User | null>(null)
  const signOutRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Đồng bộ ref với state mới nhất
  useEffect(() => { userRef.current = user }, [user])

  // Reset timer — dùng ref để tránh stale closure
  const resetLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
    if (userRef.current) {
      logoutTimerRef.current = setTimeout(() => {
        signOutRef.current()
      }, sessionTimeout)
    }
  }, [sessionTimeout])

  // Auth state + activity listener
  useEffect(() => {
    // Lấy session hiện tại
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Lắng nghe thay đổi auth state
    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    // Activity events — bỏ mousemove (fire quá nhiều), chỉ giữ các sự kiện có ý nghĩa
    const activityEvents = ['keydown', 'mousedown', 'touchstart']
    const handleActivity = () => resetLogoutTimer()
    activityEvents.forEach(evt =>
      window.addEventListener(evt, handleActivity, { passive: true })
    )

    return () => {
      subscription.unsubscribe()
      activityEvents.forEach(evt => window.removeEventListener(evt, handleActivity))
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
    }
  }, [resetLogoutTimer])

  // Reset timer khi user thay đổi (đăng nhập / đăng xuất)
  useEffect(() => {
    resetLogoutTimer()
  }, [user, resetLogoutTimer])

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      })
      if (!error && data?.user?.id) {
        // Sau khi đăng nhập, tải thông tin tenancy và role
        await refreshTenancyInternal(data.user.id)
        await fetchUserRole(data.user.id)
      }
      return { error }
    } catch (exception) {
      return { error: exception }
    }
  }

  const signOut = useCallback(async () => {
    // Luôn reset local state trước — đảm bảo đăng xuất ngay cả khi network lỗi
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
    setUser(null)
    setTenants([])
    setMemberships([])
    setCurrentTenantId(null)
    setUserProfile(null)
    setUserRole(null)
    try { localStorage.removeItem('currentTenantId') } catch {}

    try {
      // scope: 'local' — chỉ xóa session local, không gọi API revoke (tránh lỗi mạng block đăng xuất)
      await supabaseAuth.auth.signOut({ scope: 'local' })
    } catch (e) {
      // Nếu signOut Supabase lỗi, local state đã được xóa rồi → user vẫn đăng xuất thành công
      console.warn('signOut error (ignored):', e)
    }

    // Chuyển về trang login
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }, [])

  // Cập nhật signOutRef mỗi khi signOut thay đổi
  useEffect(() => { signOutRef.current = signOut }, [signOut])

  // --- Helper: chọn tenant ---
  const switchTenant = useCallback((tenantId: string) => {
    setCurrentTenantId(tenantId)
    try { localStorage.setItem('currentTenantId', tenantId) } catch {}
  }, [])

  // --- Fetch user role ---
  const fetchUserRole = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabaseAuth
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .maybeSingle()
      
      if (error) {
        setUserRole(null)
      } else if (data) {
        const role = data.role?.toLowerCase() as 'superadmin' | 'admin' | 'doctor' | 'staff' | null
        setUserRole(role)
      } else {
        setUserRole(null)
      }
    } catch (e) {
      setUserRole(null)
    }
  }, [])

  // --- Internal fetch tenancy (graceful fallback nếu bảng chưa tồn tại) ---
  const refreshTenancyInternal = useCallback(async (uid: string) => {
    setTenancyLoading(true)
    try {
      // 1. User profile (thử bảng user_profiles trước, fallback userprofile)
      let profile: UserProfile | null = null
      try {
        const { data: up, error: upErr } = await supabaseAuth
          .from('user_profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle()
        if (upErr) throw upErr
        if (up) profile = { ...up, default_tenant_id: up.default_tenant_id } as UserProfile
      } catch (e) {
        try {
          const { data: up2, error: upErr2 } = await supabaseAuth
            .from('userprofile')
            .select('*')
            .eq('user_id', uid)
            .maybeSingle()
          if (!upErr2 && up2) {
            profile = { id: up2.user_id, full_name: up2.full_name, phone: up2.phone, default_tenant: up2.default_tenant } as UserProfile
          }
        } catch {}
      }
      setUserProfile(profile)

      // 2. Memberships (bảng tenantmembership tham chiếu tenants - chú ý sự khác nhau tên bảng tenant vs tenants)
      let membershipRows: TenantMembership[] = []
      try {
        const { data: ms, error: msErr } = await supabaseAuth
          .from('tenantmembership')
          .select('tenant_id, user_id, role, active, last_login_at')
          .eq('user_id', uid)
        if (msErr) throw msErr
        if (ms) membershipRows = ms as TenantMembership[]
      } catch (e) {}
      
      setMemberships(membershipRows)

      // 3. Tenants (bảng tenants trước → fallback tenant)
      let tenantRows: Tenant[] = []
      if (membershipRows.length > 0) {
        const tenantIds = [...new Set(membershipRows.map(m => m.tenant_id))]
        if (tenantIds.length > 0) {
          try {
            const { data: tdata, error: terr } = await supabaseAuth
              .from('tenants')
              .select('id, name, code, status')
              .in('id', tenantIds)
            if (terr) throw terr
            if (tdata) tenantRows = tdata as Tenant[]
          } catch (e) {
            try {
              const { data: tdata2, error: terr2 } = await supabaseAuth
                .from('tenant')
                .select('id, name, code, status')
                .in('id', tenantIds)
              if (!terr2 && tdata2) tenantRows = tdata2 as Tenant[]
            } catch {}
          }
        }
      }
      setTenants(tenantRows)

      // 4. Xác định currentTenantId
      let chosen = currentTenantId
      if (!chosen) {
        // Ưu tiên profile.default_tenant_id hoặc profile.default_tenant
        chosen = profile?.default_tenant_id || profile?.default_tenant || null
      }
      if (!chosen && membershipRows.length === 1) {
        chosen = membershipRows[0].tenant_id
      }
      if (!chosen) {
        // lấy từ localStorage
        try { const stored = localStorage.getItem('currentTenantId'); if (stored) chosen = stored } catch {}
      }
      if (chosen) {
        setCurrentTenantId(chosen)
        try { localStorage.setItem('currentTenantId', chosen) } catch {}
      }
    } catch (e) {
      // silently fail
    } finally {
      setTenancyLoading(false)
    }
  }, [currentTenantId])

  const refreshTenancy = useCallback(async () => {
    if (!user?.id) return
    await refreshTenancyInternal(user.id)
  }, [user?.id, refreshTenancyInternal])

  // Khi user thay đổi, load tenancy (nếu đã có user)
  useEffect(() => {
    if (user?.id) {
      refreshTenancyInternal(user.id)
      fetchUserRole(user.id)
    } else {
      setTenants([])
      setMemberships([])
      setCurrentTenantId(null)
      setUserRole(null)
    }
  }, [user?.id, refreshTenancyInternal, fetchUserRole])

  const currentTenant = tenants.find(t => t.id === currentTenantId) || null
  const currentRole = memberships.find(m => m.tenant_id === currentTenantId)?.role || null

  // Helper functions for role checking
  const hasRole = useCallback((role: 'superadmin' | 'admin' | 'doctor' | 'staff') => {
    return userRole === role
  }, [userRole])

  const hasAnyRole = useCallback((roles: string[]) => {
    return userRole ? roles.includes(userRole) : false
  }, [userRole])



  const contextValue: AuthContextType = {
    user,
    loading,
    signIn,
    signOut,
    tenants,
    memberships,
    currentTenantId,
    currentTenant,
    currentRole,
    switchTenant,
    refreshTenancy,
    tenancyLoading,
    userProfile,
    userRole,
    hasRole,
    hasAnyRole
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}