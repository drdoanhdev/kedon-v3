export type FamilyRole = 'father' | 'mother' | 'child' | 'spouse' | 'other' | null;

export interface PatientLite {
  id: number;
  ten: string | null;
  namsinh?: string | null;
  dienthoai?: string | null;
  diachi?: string | null;
}

export interface FamilyMember {
  id: string;
  benhnhan_id: number;
  role: FamilyRole;
  is_primary: boolean;
  created_at: string;
  patient: PatientLite | null;
}

export interface FamilyGroup {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
  members: FamilyMember[];
}

export interface SearchHit {
  id: number;
  ten: string | null;
  namsinh: string | null;
  dienthoai: string | null;
  diachi: string | null;
  family_group_id: string | null;
}
