-- V030: Tạo bảng nhắc việc nội bộ phòng khám
create table if not exists nhac_viec (
  id            bigserial primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  branch_id     uuid references branches(id) on delete set null,
  tieu_de       text not null,
  mo_ta         text,
  loai          text not null default 'general'
                  check (loai in ('general','policy','training','inventory','other')),
  do_uu_tien    text not null default 'normal'
                  check (do_uu_tien in ('low','normal','high','urgent')),
  trang_thai    text not null default 'chua_lam'
                  check (trang_thai in ('chua_lam','dang_lam','hoan_thanh','da_huy')),
  assigned_to   uuid references auth.users(id) on delete set null,   -- null = giao cho tất cả
  created_by    uuid not null references auth.users(id) on delete cascade,
  han_chot      date,
  hoan_thanh_luc timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_nhac_viec_tenant     on nhac_viec(tenant_id);
create index if not exists idx_nhac_viec_assigned   on nhac_viec(tenant_id, assigned_to);
create index if not exists idx_nhac_viec_trangthai  on nhac_viec(tenant_id, trang_thai);
create index if not exists idx_nhac_viec_han_chot   on nhac_viec(han_chot);

-- RLS
alter table nhac_viec enable row level security;

-- Xem: thành viên tenant
drop policy if exists "nhac_viec_select" on nhac_viec;
create policy "nhac_viec_select" on nhac_viec
  for select using (
    tenant_id in (
      select tenant_id from tenantmembership
      where user_id = auth.uid() and active = true
    )
  );

-- Insert: thành viên tenant
drop policy if exists "nhac_viec_insert" on nhac_viec;
create policy "nhac_viec_insert" on nhac_viec
  for insert with check (
    tenant_id in (
      select tenant_id from tenantmembership
      where user_id = auth.uid() and active = true
    )
  );

-- Update: người tạo hoặc owner/admin
drop policy if exists "nhac_viec_update" on nhac_viec;
create policy "nhac_viec_update" on nhac_viec
  for update using (
    tenant_id in (
      select tenant_id from tenantmembership
      where user_id = auth.uid() and active = true
    )
  );

-- Delete: người tạo hoặc owner/admin (kiểm tra trong API)
drop policy if exists "nhac_viec_delete" on nhac_viec;
create policy "nhac_viec_delete" on nhac_viec
  for delete using (
    tenant_id in (
      select tenant_id from tenantmembership
      where user_id = auth.uid() and active = true
    )
  );
