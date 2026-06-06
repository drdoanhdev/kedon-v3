// src/components/FamilyCard.tsx
// Card hiển thị nhóm gia đình của một bệnh nhân trong trang chi tiết.
// Self-contained: tự fetch /api/benh-nhan/family, tự quản các modal con.
// Cache nhẹ ở module level để click-through giữa các thành viên tức thì.
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Users,
  Plus,
  Settings,
  Star,
  ArrowRight,
  Search as SearchIcon,
  Loader2,
  Trash2,
  Pencil,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import type { FamilyGroup, FamilyMember, FamilyRole, SearchHit } from "@/components/family/types";
import {
  ROLE_OPTIONS,
  calcAge,
  formatRole,
  sortFamilyMembers,
} from "@/components/family/familyUtils";
import { PatientSearchHitDetails } from "@/components/family/PatientSearchHitDetails";
import { invalidateFamilyCache, usePatientFamily } from "@/components/family/usePatientFamily";

export interface FamilyCardProps {
  /** ID bệnh nhân đang xem hồ sơ */
  benhnhanId: number;
  /** Tên bệnh nhân hiện tại (auto-fill khi tạo nhóm) */
  patientName: string;
  /** Callback khi click vào tên 1 thành viên khác trong nhóm.
   *  Nếu trả về undefined / không truyền: dùng default behaviour (focus query). */
  onSelectMember?: (memberPatientId: number) => void;
  /** Mở modal quản lý ngay khi mount (dùng từ desktop strip). */
  autoOpenManage?: boolean;
  onAutoOpenManageHandled?: () => void;
  /** Mở modal thêm thành viên ngay khi mount. */
  autoOpenAdd?: boolean;
  onAutoOpenAddHandled?: () => void;
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
  autoOpenLink?: boolean;
  onAutoOpenLinkHandled?: () => void;
  /** Đang nằm trong bottom sheet mobile — sub-modal mở ở layer riêng. */
  embeddedInSheet?: boolean;
  onRequestDialogMode?: (intent: "manage" | "add" | "create" | "link") => void;
  /** Chỉ hiển thị modal, ẩn card (mobile sau khi đóng sheet). */
  dialogOnlyMode?: boolean;
  onModalSessionEnd?: () => void;
  className?: string;
}


// Re-export for consumers
export type { FamilyGroup, FamilyMember, FamilyRole } from "@/components/family/types";

// =========================================================================
// Main component
// =========================================================================

export default function FamilyCard({
  benhnhanId,
  patientName,
  onSelectMember,
  autoOpenManage = false,
  onAutoOpenManageHandled,
  autoOpenAdd = false,
  onAutoOpenAddHandled,
  autoOpenCreate = false,
  onAutoOpenCreateHandled,
  autoOpenLink = false,
  onAutoOpenLinkHandled,
  embeddedInSheet = false,
  onRequestDialogMode,
  dialogOnlyMode = false,
  onModalSessionEnd,
  className,
}: FamilyCardProps) {
  const { has, loading: permLoading } = usePermissions();
  const canEdit = !permLoading && has("manage_patients");
  const { confirm } = useConfirm();

  const { family, loading, refetchAndInvalidate } = usePatientFamily(benhnhanId);

  const [showCreate, setShowCreate] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showLinkExisting, setShowLinkExisting] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const endModalSession = useCallback(() => {
    if (dialogOnlyMode) onModalSessionEnd?.();
  }, [dialogOnlyMode, onModalSessionEnd]);

  const requestDialog = useCallback(
    (intent: "manage" | "add" | "create" | "link") => {
      if (embeddedInSheet && onRequestDialogMode) {
        onRequestDialogMode(intent);
        return true;
      }
      return false;
    },
    [embeddedInSheet, onRequestDialogMode],
  );

  const openManageFlow = useCallback(() => {
    if (requestDialog("manage")) return;
    setShowManage(true);
  }, [requestDialog]);

  const openAddFlow = useCallback(() => {
    if (requestDialog("add")) return;
    setShowAddMember(true);
  }, [requestDialog]);

  const openCreateFlow = useCallback(() => {
    if (requestDialog("create")) return;
    setShowCreate(true);
  }, [requestDialog]);

  const openLinkFlow = useCallback(() => {
    if (requestDialog("link")) return;
    setShowLinkExisting(true);
  }, [requestDialog]);

  useEffect(() => {
    if (!autoOpenManage || loading) return;
    setShowManage(true);
    onAutoOpenManageHandled?.();
  }, [autoOpenManage, loading, onAutoOpenManageHandled]);

  useEffect(() => {
    if (!autoOpenLink || loading) return;
    setShowLinkExisting(true);
    onAutoOpenLinkHandled?.();
  }, [autoOpenLink, loading, onAutoOpenLinkHandled]);

  useEffect(() => {
    if (!autoOpenCreate || loading) return;
    setShowCreate(true);
    onAutoOpenCreateHandled?.();
  }, [autoOpenCreate, loading, onAutoOpenCreateHandled]);

  const handleSelectMember = useCallback(
    (memberPatientId: number) => {
      if (memberPatientId === benhnhanId) return; // chính mình
      if (onSelectMember) {
        onSelectMember(memberPatientId);
      } else {
        toast(`Mở hồ sơ #${memberPatientId} — chưa hỗ trợ điều hướng.`, { icon: "ℹ️" });
      }
    },
    [benhnhanId, onSelectMember]
  );

  const handleRemoveMember = useCallback(
    async (memberPatientId: number, memberName: string) => {
      if (!family) return;
      const ok = await confirm({
        title: "Gỡ khỏi gia đình",
        message: `Gỡ "${memberName}" khỏi nhóm "${family.name}"?`,
        confirmText: "Gỡ",
        variant: "danger",
      });
      if (!ok) return;
      try {
        await axios.delete(`/api/family-groups/${family.id}/members/${memberPatientId}`);
        toast.success("Đã gỡ khỏi gia đình");
        await refetchAndInvalidate();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Lỗi gỡ thành viên");
      }
    },
    [family, confirm, refetchAndInvalidate]
  );

  useEffect(() => {
    if (!autoOpenAdd || loading || !family) return;
    setShowAddMember(true);
    onAutoOpenAddHandled?.();
  }, [autoOpenAdd, family, loading, onAutoOpenAddHandled]);

  if (
    dialogOnlyMode
    && !loading
    && !showCreate
    && !showAddMember
    && !showLinkExisting
    && !showManage
    && !autoOpenManage
    && !autoOpenAdd
    && !autoOpenCreate
    && !autoOpenLink
  ) {
    return null;
  }

  // ----- Render -----

  if (loading) {
    return (
      <div className={`border rounded-lg bg-white overflow-hidden ${className || ""}`}>
        <div className="px-3 py-2 border-b flex items-center gap-2 bg-emerald-50/50">
          <Users className="w-4 h-4 text-emerald-700" />
          <span className="text-sm font-semibold text-emerald-900">Gia đình</span>
        </div>
        <div className="p-3 space-y-2 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (!family) {
    return (
      <>
        <div className={`border rounded-lg bg-white ${className || ""}`}>
          <div className="px-3 py-2 border-b flex items-center gap-2 bg-emerald-50/50">
            <Users className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-semibold text-emerald-900">Gia đình</span>
          </div>
          <div className="p-3 space-y-2">
            <p className="text-sm text-gray-600">Chưa thuộc gia đình nào</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit}
                onClick={() => openCreateFlow()}
              >
                <Plus className="w-4 h-4 mr-1" /> Tạo gia đình mới
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit}
                onClick={() => openLinkFlow()}
              >
                <SearchIcon className="w-4 h-4 mr-1" /> Liên kết gia đình có sẵn
              </Button>
            </div>
            {!canEdit && (
              <p className="text-[11px] text-gray-400">
                Cần quyền <code>manage_patients</code> để chỉnh sửa.
              </p>
            )}
          </div>
        </div>

        {showCreate && (
          <CreateFamilyModal
            patientName={patientName}
            benhnhanId={benhnhanId}
            onClose={() => { setShowCreate(false); endModalSession(); }}
            onCreated={async () => {
              setShowCreate(false);
              await refetchAndInvalidate();
              endModalSession();
            }}
          />
        )}
        {showLinkExisting && (
          <LinkExistingFamilyModal
            benhnhanId={benhnhanId}
            onClose={() => { setShowLinkExisting(false); endModalSession(); }}
            onLinked={async () => {
              setShowLinkExisting(false);
              await refetchAndInvalidate();
              endModalSession();
            }}
          />
        )}
      </>
    );
  }

  // Có family
  const sortedMembers = sortFamilyMembers(family.members);

  return (
    <>
      <div className={`border rounded-lg bg-white ${className || ""}`}>
        <div className="px-3 py-2 border-b flex items-center gap-2 bg-emerald-50/50">
          <Users className="w-4 h-4 text-emerald-700" />
          <span className="text-sm font-semibold text-emerald-900 truncate">
            {family.name}
          </span>
          <span className="text-xs text-emerald-700/80">
            ({family.members.length} người)
          </span>
        </div>

        <ul className="divide-y">
          {sortedMembers.map((m) => {
            const isCurrent = m.benhnhan_id === benhnhanId;
            const age = calcAge(m.patient?.namsinh);
            const roleLabel = formatRole(m.role);
            return (
              <li
                key={m.id}
                className={`px-3 py-2 flex items-center gap-2 text-sm ${
                  isCurrent ? "bg-amber-50/60" : "hover:bg-gray-50"
                }`}
              >
                {m.is_primary ? (
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 shrink-0" />
                )}
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left flex items-center gap-2 disabled:cursor-default"
                  disabled={isCurrent}
                  onClick={() => handleSelectMember(m.benhnhan_id)}
                >
                  <span className={`truncate ${isCurrent ? "font-semibold" : "text-blue-700 hover:underline"}`}>
                    {m.patient?.ten || `#${m.benhnhan_id}`}
                  </span>
                  {age && <span className="text-xs text-gray-500 shrink-0">{age}</span>}
                </button>
                {roleLabel && (
                  <span className="text-[11px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded shrink-0">
                    {roleLabel}
                  </span>
                )}
                {isCurrent ? (
                  <span className="text-[11px] text-amber-700 shrink-0">(đang xem)</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSelectMember(m.benhnhan_id)}
                    title="Mở hồ sơ"
                    className="text-gray-400 hover:text-blue-600 shrink-0"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="p-2 border-t flex flex-wrap gap-2 bg-gray-50/50">
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit}
            onClick={() => openAddFlow()}
          >
            <Plus className="w-4 h-4 mr-1" /> Thêm người thân
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canEdit}
            onClick={() => openManageFlow()}
          >
            <Settings className="w-4 h-4 mr-1" /> Quản lý
          </Button>
        </div>
      </div>

      {showAddMember && (
        <AddMemberModal
          familyId={family.id}
          excludePatientId={benhnhanId}
          existingMemberIds={family.members.map((m) => m.benhnhan_id)}
          onClose={() => { setShowAddMember(false); endModalSession(); }}
          onAdded={async () => {
            setShowAddMember(false);
            await refetchAndInvalidate();
            endModalSession();
          }}
        />
      )}

      {showManage && (
        <ManageFamilyModal
          family={family}
          onClose={() => { setShowManage(false); endModalSession(); }}
          onChanged={refetchAndInvalidate}
          onDeleted={async () => {
            setShowManage(false);
            await refetchAndInvalidate();
            endModalSession();
          }}
          onRemoveMember={handleRemoveMember}
        />
      )}
    </>
  );
}

// =========================================================================
// CreateFamilyModal
// =========================================================================

function CreateFamilyModal({
  patientName,
  benhnhanId,
  onClose,
  onCreated,
}: {
  patientName: string;
  benhnhanId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(`Gia đình ${patientName || ""}`.trim());
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên nhóm");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`/api/family-groups`, {
        name: name.trim(),
        phone: phone.trim() || null,
        note: note.trim() || null,
        first_member: {
          benhnhan_id: benhnhanId,
          is_primary: true,
        },
      });
      toast.success("Đã tạo gia đình");
      onCreated();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === "PATIENT_ALREADY_IN_FAMILY") {
        toast.error("Bệnh nhân đã thuộc gia đình khác.");
      } else {
        toast.error(err?.response?.data?.message || "Lỗi tạo gia đình");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo nhóm gia đình mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="fam-name">
              Tên nhóm <span className="text-red-500">*</span>
            </Label>
            <Input
              id="fam-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Gia đình anh Hùng"
              maxLength={150}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="fam-phone">SĐT đại diện</Label>
            <Input
              id="fam-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(tuỳ chọn)"
              maxLength={20}
            />
          </div>
          <div>
            <Label htmlFor="fam-note">Ghi chú</Label>
            <Textarea
              id="fam-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(tuỳ chọn)"
              rows={2}
            />
          </div>
          <p className="text-[11px] text-gray-500">
            Bệnh nhân hiện tại sẽ được thêm tự động làm người đại diện.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Tạo nhóm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// AddMemberModal — search + chọn role
// =========================================================================

function AddMemberModal({
  familyId,
  excludePatientId,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  familyId: string;
  excludePatientId: number;
  existingMemberIds: number[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [role, setRole] = useState<FamilyRole>(null);
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      setHits([]);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    axios
      .get(
        `/api/benh-nhan/search-for-family?q=${encodeURIComponent(debounced)}&exclude_patient_id=${excludePatientId}`,
        { signal: ctrl.signal }
      )
      .then((r) => setHits(r.data?.data || []))
      .catch(() => {})
      .finally(() => setSearching(false));
    return () => ctrl.abort();
  }, [debounced, excludePatientId]);

  const excludedSet = useMemo(() => new Set(existingMemberIds), [existingMemberIds]);

  const submit = async () => {
    if (!picked) return;
    setSubmitting(true);
    try {
      await axios.post(`/api/family-groups/${familyId}/members`, {
        benhnhan_id: picked.id,
        role,
      });
      toast.success("Đã thêm vào gia đình");
      onAdded();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === "PATIENT_ALREADY_IN_FAMILY") {
        const existing = err?.response?.data?.existing_family_group_id;
        toast.error(
          existing
            ? "Bệnh nhân đang thuộc gia đình khác — gỡ khỏi gia đình cũ trước rồi thêm lại."
            : "Bệnh nhân đã thuộc gia đình khác."
        );
      } else {
        toast.error(err?.response?.data?.message || "Lỗi thêm thành viên");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Thêm người thân vào gia đình</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
            <Input
              autoFocus
              className="pl-8"
              placeholder="Tìm theo SĐT hoặc tên..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
              }}
            />
          </div>

          {!picked && (
            <div className="border rounded max-h-72 overflow-auto">
              {debounced.length < 2 ? (
                <p className="p-3 text-xs text-gray-500">
                  Nhập tối thiểu 2 ký tự để tìm.
                </p>
              ) : searching ? (
                <p className="p-3 text-xs text-gray-500 inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tìm...
                </p>
              ) : hits.length === 0 ? (
                <div className="p-3 text-xs text-gray-500 space-y-2">
                  <p>Không có bệnh nhân nào khớp với "{debounced}".</p>
                  <a
                    href={`/benh-nhan?search=${encodeURIComponent(debounced)}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Mở trang Hồ sơ để tạo bệnh nhân mới
                  </a>
                </div>
              ) : (
                <ul className="divide-y">
                  {hits.map((h) => {
                    const inThisGroup = excludedSet.has(h.id);
                    const inOtherGroup = !inThisGroup && !!h.family_group_id;
                    return (
                      <li
                        key={h.id}
                        className={`p-2.5 flex items-start gap-2 text-sm ${
                          inThisGroup ? "bg-gray-50 text-gray-400" : "hover:bg-emerald-50 cursor-pointer"
                        }`}
                        onClick={() => {
                          if (inThisGroup) return;
                          setPicked(h);
                        }}
                      >
                        <PatientSearchHitDetails patient={h} />
                        {inThisGroup && (
                          <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                            Đã trong nhóm
                          </span>
                        )}
                        {inOtherGroup && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            Thuộc nhóm khác
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {picked && (
            <div className="border rounded p-3 bg-emerald-50/50 space-y-3">
              <div className="flex items-start gap-2">
                <PatientSearchHitDetails patient={picked} />
                <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                  Đổi
                </Button>
              </div>
              <div>
                <Label className="text-xs">Quan hệ (tuỳ chọn)</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      className={`text-xs px-2 py-1 rounded border ${
                        role === opt.value
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {picked.family_group_id && (
                <p className="text-xs text-amber-700">
                  ⚠ Bệnh nhân này đang thuộc một nhóm khác. Bạn cần gỡ khỏi nhóm cũ trước.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={!picked || submitting || !!picked.family_group_id}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Liên kết
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// LinkExistingFamilyModal — chọn 1 family hiện có để đưa BN hiện tại vào
// =========================================================================

interface FamilyListItem {
  id: string;
  name: string;
  phone: string | null;
  member_count: number;
}

function LinkExistingFamilyModal({
  benhnhanId,
  onClose,
  onLinked,
}: {
  benhnhanId: number;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<FamilyListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    axios
      .get(`/api/family-groups?q=${encodeURIComponent(debounced)}&pageSize=20`)
      .then((r) => {
        if (!aborted) setItems(r.data?.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [debounced]);

  const link = async (familyId: string) => {
    setSubmitting(true);
    try {
      await axios.post(`/api/family-groups/${familyId}/members`, {
        benhnhan_id: benhnhanId,
      });
      toast.success("Đã liên kết vào gia đình");
      onLinked();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === "PATIENT_ALREADY_IN_FAMILY") {
        toast.error("Bệnh nhân đã thuộc gia đình khác.");
      } else {
        toast.error(err?.response?.data?.message || "Lỗi liên kết");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Liên kết vào gia đình có sẵn</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
            <Input
              autoFocus
              className="pl-8"
              placeholder="Tìm theo tên nhóm hoặc SĐT..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="border rounded max-h-72 overflow-auto">
            {loading ? (
              <p className="p-3 text-xs text-gray-500 inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải...
              </p>
            ) : items.length === 0 ? (
              <p className="p-3 text-xs text-gray-500">Không có nhóm nào.</p>
            ) : (
              <ul className="divide-y">
                {items.map((f) => (
                  <li key={f.id} className="p-2 flex items-center gap-2 text-sm hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{f.name}</div>
                      <div className="text-xs text-gray-500">
                        {f.member_count} người{f.phone ? ` · ${f.phone}` : ""}
                      </div>
                    </div>
                    <Button size="sm" disabled={submitting} onClick={() => link(f.id)}>
                      Liên kết
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// ManageFamilyModal — đổi tên, đổi primary, xoá member, xoá nhóm
// =========================================================================

function ManageFamilyModal({
  family,
  onClose,
  onChanged,
  onDeleted,
  onRemoveMember,
}: {
  family: FamilyGroup;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  onRemoveMember: (memberPatientId: number, memberName: string) => void;
}) {
  const { confirm } = useConfirm();
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(family.name);
  const [phone, setPhone] = useState(family.phone || "");
  const [address, setAddress] = useState(family.address || "");
  const [note, setNote] = useState(family.note || "");
  const [saving, setSaving] = useState(false);
  const [busyMember, setBusyMember] = useState<number | null>(null);

  const saveInfo = async () => {
    if (!name.trim()) {
      toast.error("Tên nhóm không được để trống");
      return;
    }
    setSaving(true);
    try {
      await axios.patch(`/api/family-groups/${family.id}`, {
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        note: note.trim() || null,
      });
      toast.success("Đã lưu thông tin");
      setEditMode(false);
      await onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  };

  const setPrimary = async (memberPatientId: number) => {
    setBusyMember(memberPatientId);
    try {
      await axios.patch(`/api/family-groups/${family.id}/members/${memberPatientId}`, {
        is_primary: true,
      });
      await onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Lỗi cập nhật");
    } finally {
      setBusyMember(null);
    }
  };

  const setRole = async (memberPatientId: number, nextRole: FamilyRole) => {
    setBusyMember(memberPatientId);
    try {
      await axios.patch(`/api/family-groups/${family.id}/members/${memberPatientId}`, {
        role: nextRole,
      });
      await onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Lỗi cập nhật");
    } finally {
      setBusyMember(null);
    }
  };

  const deleteGroup = async () => {
    const ok = await confirm({
      title: "Xoá nhóm gia đình",
      message: `Xoá "${family.name}"? Tất cả thành viên sẽ bị gỡ khỏi nhóm (không xoá hồ sơ bệnh nhân).`,
      confirmText: "Xoá",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await axios.delete(`/api/family-groups/${family.id}`);
      toast.success("Đã xoá nhóm");
      onDeleted();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Lỗi xoá nhóm");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Quản lý gia đình</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Thông tin chung */}
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Thông tin chung</h3>
              {!editMode ? (
                <Button size="sm" variant="ghost" onClick={() => setEditMode(true)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Sửa
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditMode(false);
                  setName(family.name);
                  setPhone(family.phone || "");
                  setAddress(family.address || "");
                  setNote(family.note || "");
                }}>
                  Huỷ sửa
                </Button>
              )}
            </div>
            {!editMode ? (
              <div className="text-sm space-y-1">
                <div><span className="text-gray-500">Tên:</span> {family.name}</div>
                <div><span className="text-gray-500">SĐT:</span> {family.phone || "—"}</div>
                <div><span className="text-gray-500">Địa chỉ:</span> {family.address || "—"}</div>
                <div><span className="text-gray-500">Ghi chú:</span> {family.note || "—"}</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Tên nhóm *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
                </div>
                <div>
                  <Label className="text-xs">SĐT</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
                </div>
                <div>
                  <Label className="text-xs">Địa chỉ</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Ghi chú</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </div>
                <Button size="sm" onClick={saveInfo} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Lưu
                </Button>
              </div>
            )}
          </div>

          {/* Thành viên */}
          <div className="border rounded">
            <div className="px-3 py-2 border-b font-semibold text-sm">
              Thành viên ({family.members.length})
            </div>
            <ul className="divide-y max-h-72 overflow-auto">
              {family.members.map((m) => (
                <li key={m.id} className="p-2 flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    title={m.is_primary ? "Đại diện" : "Đặt làm đại diện"}
                    disabled={m.is_primary || busyMember === m.benhnhan_id}
                    onClick={() => setPrimary(m.benhnhan_id)}
                    className="shrink-0"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        m.is_primary
                          ? "text-amber-500 fill-amber-400"
                          : "text-gray-300 hover:text-amber-400"
                      }`}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {m.patient?.ten || `#${m.benhnhan_id}`}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {m.patient?.dienthoai || "—"}
                    </div>
                  </div>
                  <select
                    value={m.role || ""}
                    disabled={busyMember === m.benhnhan_id}
                    onChange={(e) =>
                      setRole(m.benhnhan_id, (e.target.value || null) as FamilyRole)
                    }
                    className="text-xs border rounded px-1.5 py-1 bg-white"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={String(opt.value)} value={opt.value || ""}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title="Gỡ khỏi nhóm"
                    onClick={() => onRemoveMember(m.benhnhan_id, m.patient?.ten || `#${m.benhnhan_id}`)}
                    className="text-gray-400 hover:text-red-600 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="justify-between">
          <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={deleteGroup}>
            <Trash2 className="w-4 h-4 mr-1" /> Xoá nhóm
          </Button>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
