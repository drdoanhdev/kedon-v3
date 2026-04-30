/**
 * Quản lý vai trò — UI ma trận tick/bỏ tick quyền.
 * V054 RBAC giai đoạn 1.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import ProtectedRoute from '../components/ProtectedRoute'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { fetchWithAuth } from '../lib/fetchWithAuth'

interface PermissionCatalogItem {
  code: string
  module: string
  label: string
  description: string | null
  sort_order: number
}

interface RoleItem {
  id: string
  code: string
  name: string
  description: string | null
  is_system: boolean
  is_protected: boolean
  permissions: string[]
  member_count: number
}

const MODULE_LABELS: Record<string, string> = {
  system: 'Hệ thống & cài đặt',
  inventory: 'Hàng hóa & kho',
  patients: 'Bệnh nhân & phòng chờ',
  medical: 'Khám & kê đơn',
  reports: 'Báo cáo',
  crm: 'Chăm sóc khách hàng',
}

function moduleLabel(m: string): string {
  return MODULE_LABELS[m] || m
}

export default function QuanLyVaiTro() {
  return (
    <ProtectedRoute>
      <QuanLyVaiTroInner />
    </ProtectedRoute>
  )
}

export function QuanLyVaiTroSection() {
  return <QuanLyVaiTroInner embedded />
}

function QuanLyVaiTroInner({ embedded = false }: { embedded?: boolean } = {}) {
  const { currentRole } = useAuth()
  const { confirm } = useConfirm()

  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([])
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<RoleItem | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const isAdmin = currentRole === 'owner' || currentRole === 'admin'

  async function loadAll() {
    setLoading(true)
    try {
      const [catRes, rolesRes] = await Promise.all([
        fetchWithAuth('/api/permissions/catalog'),
        fetchWithAuth('/api/roles'),
      ])
      const catJson = await catRes.json()
      const rolesJson = await rolesRes.json()
      if (!catRes.ok) throw new Error(catJson.message || 'Lỗi tải danh mục quyền')
      if (!rolesRes.ok) throw new Error(rolesJson.message || 'Lỗi tải vai trò')
      setCatalog(catJson.data || [])
      setRoles(rolesJson.data || [])
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) loadAll()
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Không có quyền truy cập</h1>
          <p className="text-gray-600">Chỉ chủ phòng khám hoặc quản lý mới được cấu hình vai trò.</p>
          <Link href="/" className="text-blue-600 hover:underline mt-4 block">Quay lại trang chủ</Link>
        </div>
      </div>
    )
  }

  async function handleDelete(role: RoleItem) {
    if (role.is_system) {
      toast.error('Không thể xóa vai trò hệ thống.')
      return
    }
    if (role.member_count > 0) {
      toast.error(`Vai trò đang gán cho ${role.member_count} thành viên.`)
      return
    }
    const ok = await confirm({
      title: `Xóa vai trò "${role.name}"?`,
      message: 'Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
      variant: 'danger',
    })
    if (!ok) return
    const r = await fetchWithAuth(`/api/roles/${role.id}`, { method: 'DELETE' })
    const j = await r.json()
    if (!r.ok) {
      toast.error(j.message || 'Lỗi xóa vai trò')
      return
    }
    toast.success('Đã xóa vai trò.')
    loadAll()
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gray-50 p-6'}>
      <div className={embedded ? '' : 'max-w-6xl mx-auto'}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quản lý vai trò</h1>
            <p className="text-sm text-gray-600 mt-1">
              Tùy chỉnh quyền cho từng vai trò trong phòng khám. Tick/bỏ tick các quyền theo nhu cầu.
            </p>
          </div>
          <div className="flex gap-2">
            {!embedded && (
              <Link href="/quan-ly-nguoi-dung" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">
                ← Quản lý người dùng
              </Link>
            )}
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              + Vai trò mới
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">Đang tải…</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Vai trò</th>
                  <th className="text-left px-4 py-3 font-medium">Mô tả</th>
                  <th className="text-center px-4 py-3 font-medium">Số quyền</th>
                  <th className="text-center px-4 py-3 font-medium">Thành viên</th>
                  <th className="text-right px-4 py-3 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {roles.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        {r.name}
                        {r.is_system && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">
                            hệ thống
                          </span>
                        )}
                        {r.is_protected && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                            khóa
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">{r.code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.description || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-center">{r.permissions.length} / {catalog.length}</td>
                    <td className="px-4 py-3 text-center">{r.member_count}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => setEditing(r)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Sửa quyền
                      </button>
                      {!r.is_system && (
                        <button
                          onClick={() => handleDelete(r)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Xóa
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Chưa có vai trò nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <RoleEditor
          role={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadAll()
          }}
        />
      )}

      {showCreate && (
        <RoleCreator
          catalog={catalog}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            loadAll()
          }}
        />
      )}
    </div>
  )
}

// ============================================================
// Editor: ma trận checkbox để tick/bỏ tick quyền
// ============================================================
function RoleEditor({
  role,
  catalog,
  onClose,
  onSaved,
}: {
  role: RoleItem
  catalog: PermissionCatalogItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description || '')
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions))
  const [saving, setSaving] = useState(false)

  const grouped = useMemo(() => {
    const g: Record<string, PermissionCatalogItem[]> = {}
    for (const p of catalog) {
      if (!g[p.module]) g[p.module] = []
      g[p.module].push(p)
    }
    return g
  }, [catalog])

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleModule(mod: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const p of grouped[mod] || []) {
        if (on) next.add(p.code)
        else next.delete(p.code)
      }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const r = await fetchWithAuth(`/api/roles/${role.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          permissions: Array.from(selected),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.message || 'Lỗi lưu')
      toast.success('Đã lưu vai trò.')
      onSaved()
    } catch (err: any) {
      toast.error(err.message || 'Lỗi lưu vai trò')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Sửa vai trò</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="px-6 py-4 grid grid-cols-2 gap-4 border-b">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tên vai trò</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              disabled={role.is_system && role.is_protected}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Mô tả</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="Mô tả ngắn vai trò"
            />
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {role.is_protected && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              ⚠ Đây là vai trò chủ phòng khám. Một số quyền cốt lõi (manage_billing, manage_clinic, manage_members)
              không thể bỏ chọn để tránh khóa chính bạn ra ngoài.
            </div>
          )}

          {Object.keys(grouped).map((mod) => {
            const items = grouped[mod]
            const allOn = items.every((p) => selected.has(p.code))
            const someOn = items.some((p) => selected.has(p.code))
            return (
              <div key={mod} className="mb-4 border rounded">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b">
                  <div className="font-medium text-sm">{moduleLabel(mod)}</div>
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => { if (el) el.indeterminate = !allOn && someOn }}
                      onChange={(e) => toggleModule(mod, e.target.checked)}
                    />
                    Chọn tất cả
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
                  {items.map((p) => (
                    <label key={p.code} className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(p.code)}
                        onChange={() => toggle(p.code)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="text-gray-900">{p.label}</span>
                        {p.description && (
                          <span className="block text-xs text-gray-500">{p.description}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-6 py-3 border-t flex items-center justify-between">
          <span className="text-xs text-gray-500">{selected.size} / {catalog.length} quyền được chọn</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded text-sm hover:bg-gray-100">
              Bỏ qua
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Creator: tạo vai trò mới
// ============================================================
function RoleCreator({
  catalog,
  onClose,
  onCreated,
}: {
  catalog: PermissionCatalogItem[]
  onClose: () => void
  onCreated: () => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!/^[a-z0-9_-]{2,32}$/.test(code)) {
      toast.error('Mã chỉ gồm chữ thường, số, "_" hoặc "-", 2–32 ký tự.')
      return
    }
    if (name.trim().length < 2) {
      toast.error('Tên vai trò phải có ít nhất 2 ký tự.')
      return
    }
    setSaving(true)
    try {
      const r = await fetchWithAuth('/api/roles', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          permissions: Array.from(selected),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.message || 'Lỗi tạo')
      toast.success('Đã tạo vai trò.')
      onCreated()
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tạo vai trò')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Tạo vai trò mới</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Mã (slug)</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              placeholder="cashier, receptionist…"
              className="w-full px-3 py-2 border rounded text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tên hiển thị</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhân viên thu ngân"
              className="w-full px-3 py-2 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              rows={2}
            />
          </div>
          <div className="text-xs text-gray-500">
            Sau khi tạo, có thể vào "Sửa quyền" để tick chi tiết. Mặc định vai trò mới chưa có quyền nào.
          </div>
        </div>
        <div className="px-6 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded text-sm hover:bg-gray-100">
            Bỏ qua
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Đang tạo…' : 'Tạo'}
          </button>
        </div>
      </div>
    </div>
  )
}
