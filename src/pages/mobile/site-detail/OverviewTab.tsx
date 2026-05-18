import type { SiteAssignment } from '../../../types/site.types';

interface OverviewTabProps {
  assignments: SiteAssignment[];
}

export default function OverviewTab({ assignments }: OverviewTabProps) {
  return (
    <div className="px-4 pb-[120px] pt-4">
      <h3 className="text-on-surface font-bold mb-3">Sistemos informacija</h3>
      
      <div className="bg-white rounded-xl p-4 mb-2 flex items-center gap-4 shadow-sm border border-outline-variant/30">
        <div className="w-10 h-10 bg-[#f6e9ff] text-primary rounded-lg flex items-center justify-center">
          <span className="material-symbols-outlined">grid_4x4</span>
        </div>
        <div>
          <p className="font-semibold text-on-surface">PV Moduliai</p>
          <p className="text-xs text-on-surface-variant">Informacija ruošiama</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 mb-2 flex items-center gap-4 shadow-sm border border-outline-variant/30">
        <div className="w-10 h-10 bg-[#f6e9ff] text-primary rounded-lg flex items-center justify-center">
          <span className="material-symbols-outlined">electric_meter</span>
        </div>
        <div>
          <p className="font-semibold text-on-surface">Inverteris</p>
          <p className="text-xs text-on-surface-variant">Informacija ruošiama</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 mb-2 flex items-center gap-4 shadow-sm border border-outline-variant/30">
        <div className="w-10 h-10 bg-[#f6e9ff] text-primary rounded-lg flex items-center justify-center">
          <span className="material-symbols-outlined">battery_charging_full</span>
        </div>
        <div>
          <p className="font-semibold text-on-surface">BESS</p>
          <p className="text-xs text-on-surface-variant">Informacija ruošiama</p>
        </div>
      </div>

      <h3 className="text-on-surface font-bold mt-6 mb-3">Komanda</h3>
      <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        {assignments?.map((assignment) => (
          <div key={assignment.installer_id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold text-xs">
              {assignment.user_profiles?.full_name?.charAt(0) || 'U'}
            </div>
            <span className="text-on-surface font-medium text-sm">
              {assignment.user_profiles?.full_name || 'Nežinomas vartotojas'}
              {assignment.is_lead ? ' (Vadovas)' : ''}
            </span>
          </div>
        ))}
        {(!assignments || assignments.length === 0) && (
          <p className="text-sm text-on-surface-variant">Nėra priskirtų montuotojų.</p>
        )}
      </div>
    </div>
  );
}
