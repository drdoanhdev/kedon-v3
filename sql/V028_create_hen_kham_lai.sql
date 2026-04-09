-- Bảng hẹn khám lại
create table hen_kham_lai (
  id          bigserial primary key,
  tenant_id   uuid not null,
  benhnhanid  int references "BenhNhan"(id) on delete cascade,
  donkinhid   int,
  ten_benhnhan text,
  dienthoai   text,
  ngay_hen    date not null,
  gio_hen     time,
  ly_do       text,
  trang_thai  text default 'cho',  -- 'cho' | 'da_den' | 'huy' | 'qua_han'
  ghichu      text,
  created_at  timestamptz default now()
);

-- Index để query nhanh
create index idx_hen_kham_lai_ngay on hen_kham_lai(ngay_hen);
create index idx_hen_kham_lai_benhnhan on hen_kham_lai(benhnhanid);
create index idx_hen_kham_lai_trangthai on hen_kham_lai(trang_thai);
create index idx_hen_kham_lai_tenant on hen_kham_lai(tenant_id);

-- RLS
alter table hen_kham_lai enable row level security;

create policy "hen_kham_lai_tenant_select" on hen_kham_lai
  for select using (tenant_id in (select get_user_tenant_ids()));

create policy "hen_kham_lai_tenant_insert" on hen_kham_lai
  for insert with check (tenant_id in (select get_user_tenant_ids()));

create policy "hen_kham_lai_tenant_update" on hen_kham_lai
  for update using (tenant_id in (select get_user_tenant_ids()));

create policy "hen_kham_lai_tenant_delete" on hen_kham_lai
  for delete using (tenant_id in (select get_user_tenant_ids()));
