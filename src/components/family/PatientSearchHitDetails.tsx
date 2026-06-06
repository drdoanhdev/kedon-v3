import { Calendar, MapPin, Phone } from 'lucide-react';
import { calcAge } from '@/components/family/familyUtils';

type PatientSearchFields = {
  id: number;
  ten: string | null;
  namsinh?: string | null;
  dienthoai?: string | null;
  diachi?: string | null;
};

export function PatientSearchHitDetails({ patient }: { patient: PatientSearchFields }) {
  const age = calcAge(patient.namsinh);
  const birthDisplay = patient.namsinh
    ? age
      ? `${patient.namsinh} (${age})`
      : patient.namsinh
    : null;

  return (
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">{patient.ten || `#${patient.id}`}</div>
      <div className="text-xs text-gray-500 space-y-0.5 mt-0.5">
        {birthDisplay && (
          <div className="flex items-center gap-1 min-w-0">
            <Calendar className="w-3 h-3 shrink-0" />
            <span className="truncate">{birthDisplay}</span>
          </div>
        )}
        {patient.dienthoai && (
          <div className="flex items-center gap-1 min-w-0">
            <Phone className="w-3 h-3 shrink-0" />
            <span className="truncate">{patient.dienthoai}</span>
          </div>
        )}
        {patient.diachi && (
          <div className="flex items-start gap-1 min-w-0">
            <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{patient.diachi}</span>
          </div>
        )}
      </div>
    </div>
  );
}
