import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Loader2, Sun, Battery } from 'lucide-react';
import { format } from 'date-fns';
import { updateClientInfo, updateSiteDetails, updateSiteType } from '../../../api/sites';
import { ensureDefaultSiteWorkPhases } from '../../../api/workPhases';
import { normalizeSiteType, siteTypeLabel, SITE_TYPE_OPTIONS, type SiteType } from '../../../lib/siteTypes';
import TechDataModal from './TechDataModal';
import SiteAnnotationNotes from './SiteAnnotationNotes';
import type { SiteWithTeam } from './types';

/** Clean iOS-style list row: muted label left, focal value right, hairline divider. */
function FieldRow({ label, icon: Icon, last, children }: { label: string; icon?: React.ElementType; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 ${last ? '' : 'border-b border-border'}`}>
      <span className="flex items-center gap-2 text-[12px] text-subtle font-medium tracking-wide shrink-0 pt-0.5">
        {Icon && <Icon className="w-4 h-4 text-subtle" />}
        {label}
      </span>
      <span className="text-[14px] text-text font-semibold text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function InfoTab({ site, siteId }: { site: SiteWithTeam; siteId: string }) {
  const queryClient = useQueryClient();

  const [editingTech, setEditingTech] = useState(false);
  const [siteType, setSiteType] = useState<SiteType>(() => normalizeSiteType(site.site_type));

  const [localNotes, setLocalNotes] = useState<string | null>(null);
  const notes = localNotes ?? site.notes ?? '';

  // Kliento laukai redaguojami vietoje, be atskiro „Redaguoti" režimo — taip
  // pat, kaip Objekto tipas ir Pastabos. Anksčiau viename ekrane veikė du
  // skirtingi būdai, ir nebuvo aišku, kuris laukas atrakintas.
  const serverClient = {
    client_name:    site.client_name    ?? '',
    contact_person: site.contact_person ?? '',
    client_phone:   site.client_phone   ?? '',
    client_email:   site.client_email   ?? '',
    address:        site.address        ?? '',
  };
  const [clientForm, setClientForm] = useState(serverClient);

  // Serveris atsakė naujomis reikšmėmis — persikrauname. `sig` keičiasi tik
  // tada, kai pasikeičia išsaugoti duomenys, todėl rašomas tekstas nedingsta.
  const clientSig = JSON.stringify(serverClient);
  const [syncedClientSig, setSyncedClientSig] = useState(clientSig);
  if (syncedClientSig !== clientSig) {
    setSyncedClientSig(clientSig);
    setClientForm(serverClient);
  }

  const clientDirty = (Object.keys(serverClient) as (keyof typeof serverClient)[])
    .some((k) => clientForm[k] !== serverClient[k]);

  const saveClientMutation = useMutation({
    mutationFn: () => updateClientInfo(siteId, {
      client_name:    clientForm.client_name,
      contact_person: clientForm.contact_person || null,
      client_phone:   clientForm.client_phone   || null,
      client_email:   clientForm.client_email   || null,
      address:        clientForm.address,
    }),
    onSuccess: () => {
      toast.success('Kliento informacija išsaugota!');
      void queryClient.invalidateQueries({ queryKey: ['admin_site', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const saveNotesMutation = useMutation({
    mutationFn: () => updateSiteDetails(siteId, { notes }),
    onSuccess: () => {
      toast.success('Pastabos išsaugotos!');
      void queryClient.invalidateQueries({ queryKey: ['admin_site', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  const saveSiteTypeMutation = useMutation({
    mutationFn: async () => {
      await updateSiteType(siteId, siteType);
      await ensureDefaultSiteWorkPhases(siteId, siteType);
    },
    onSuccess: () => {
      toast.success('Objekto tipas išsaugotas!');
      void queryClient.invalidateQueries({ queryKey: ['admin_site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['admin_sites_list'] });
      void queryClient.invalidateQueries({ queryKey: ['site_phase_time_summary', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      <div className="lg:col-span-2 space-y-5">
        <div className="bg-surface rounded-card border border-border shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-text text-[15px]">Kliento informacija</h3>
            {clientDirty && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setClientForm(serverClient)}
                  disabled={saveClientMutation.isPending}
                  className="text-[13px] text-subtle font-medium hover:text-muted transition-colors cursor-pointer disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  onClick={() => saveClientMutation.mutate()}
                  disabled={saveClientMutation.isPending}
                  className="flex items-center gap-1 text-[13px] text-primary font-semibold hover:opacity-70 transition-opacity cursor-pointer disabled:opacity-60"
                >
                  {saveClientMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Išsaugoti
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-1">
              <div>
                <label className="text-[12px] text-subtle font-medium tracking-wide block mb-1">Įmonė / Klientas</label>
                <input
                  type="text"
                  value={clientForm.client_name}
                  onChange={(e) => setClientForm(f => ({ ...f, client_name: e.target.value }))}
                  disabled={saveClientMutation.isPending}
                  className="w-full h-[40px] px-3 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-[12px] text-subtle font-medium tracking-wide block mb-1">Kontaktinis asmuo</label>
                <input
                  type="text"
                  value={clientForm.contact_person}
                  onChange={(e) => setClientForm(f => ({ ...f, contact_person: e.target.value }))}
                  disabled={saveClientMutation.isPending}
                  placeholder="Vardas Pavardė"
                  className="w-full h-[40px] px-3 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors disabled:opacity-60"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-subtle font-medium tracking-wide block mb-1">Tel. numeris</label>
                  <input
                    type="tel"
                    value={clientForm.client_phone}
                    onChange={(e) => setClientForm(f => ({ ...f, client_phone: e.target.value }))}
                    disabled={saveClientMutation.isPending}
                    placeholder="+370 600 00000"
                    className="w-full h-[40px] px-3 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-subtle font-medium tracking-wide block mb-1">El. paštas</label>
                  <input
                    type="email"
                    value={clientForm.client_email}
                    onChange={(e) => setClientForm(f => ({ ...f, client_email: e.target.value }))}
                    disabled={saveClientMutation.isPending}
                    placeholder="vardas@imone.lt"
                    className="w-full h-[40px] px-3 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors disabled:opacity-60"
                  />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-subtle font-medium tracking-wide block mb-1">Adresas</label>
                <input
                  type="text"
                  value={clientForm.address}
                  onChange={(e) => setClientForm(f => ({ ...f, address: e.target.value }))}
                  disabled={saveClientMutation.isPending}
                  placeholder="Pvz.: Vilniaus g. 1, Vilnius"
                  className="w-full h-[40px] px-3 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors disabled:opacity-60"
                />
                <p className="text-[12px] text-subtle italic mt-1.5">Koordinatės bus atnaujintos automatiškai pagal adresą.</p>
              </div>
          </div>
        </div>

        <div className="bg-surface rounded-card border border-border shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-text text-[15px]">Techniniai duomenys</h3>
            <button
              onClick={() => setEditingTech(true)}
              className="text-[13px] text-primary font-medium hover:opacity-70 transition-opacity cursor-pointer"
            >
              Redaguoti
            </button>
          </div>
          <div>
            <FieldRow label="Saulės galia" icon={Sun}>
              {site.kwp != null ? <>{site.kwp} <span className="text-subtle font-medium">kWp</span></> : '—'}
            </FieldRow>
            <FieldRow label="Baterijos talpa" icon={Battery}>
              {site.kwh != null ? <>{site.kwh} <span className="text-subtle font-medium">kWh</span></> : '—'}
            </FieldRow>
            <FieldRow label="Planuojama pradžia">
              {site.scheduled_start ? format(new Date(site.scheduled_start), 'yyyy-MM-dd HH:mm') : '—'}
            </FieldRow>
            <FieldRow label="Stogo tipas">{site.roof_type || '—'}</FieldRow>
            <FieldRow label="Stogo danga">{site.roof_material || '—'}</FieldRow>
            <FieldRow label="Stogo nuolydis" last>{site.roof_angle || '—'}</FieldRow>
          </div>
        </div>
      </div>

      <div className="lg:col-span-1 space-y-5">
        {/* Montuotojo pastabos — pirmas dalykas dešinėje, nes tai vienintelė
            gyva informacija šiame skirtuke. Likusieji laukai yra sutartis. */}
        <SiteAnnotationNotes siteId={siteId} />

        <div className="bg-surface rounded-card border border-border shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold text-text text-[15px] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Objekto tipas
            </h3>
            {siteType !== normalizeSiteType(site.site_type) && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSiteType(normalizeSiteType(site.site_type))}
                  disabled={saveSiteTypeMutation.isPending}
                  className="text-[13px] text-subtle font-medium hover:text-muted transition-colors cursor-pointer disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  onClick={() => saveSiteTypeMutation.mutate()}
                  disabled={saveSiteTypeMutation.isPending}
                  className="flex items-center gap-1 text-[13px] text-primary font-semibold hover:opacity-70 transition-opacity cursor-pointer disabled:opacity-60"
                >
                  {saveSiteTypeMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Išsaugoti
                </button>
              </div>
            )}
          </div>
          <select
            value={siteType}
            onChange={(e) => setSiteType(e.target.value as SiteType)}
            disabled={saveSiteTypeMutation.isPending}
            className="w-full h-[40px] px-3 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors disabled:opacity-60"
          >
            {SITE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="text-[12px] text-subtle mt-2">
            Dabartinis tipas: <span className="font-semibold text-muted">{siteTypeLabel(site.site_type)}</span>. Pakeitus tipą esamas checklist nebus trinamas ar perrašomas.
          </p>
        </div>

        <div className="bg-surface rounded-card border border-border shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold text-text text-[15px]">Pastabos / komentarai</h3>
            {notes !== (site.notes || '') && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setLocalNotes(null)}
                  disabled={saveNotesMutation.isPending}
                  className="text-[13px] text-subtle font-medium hover:text-muted transition-colors cursor-pointer disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  onClick={() => saveNotesMutation.mutate()}
                  disabled={saveNotesMutation.isPending}
                  className="flex items-center gap-1 text-[13px] text-primary font-semibold hover:opacity-70 transition-opacity cursor-pointer disabled:opacity-60"
                >
                  {saveNotesMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Išsaugoti
                </button>
              </div>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="Objekto specifika, prieigos niuansai, pastabos montuotojui..."
            rows={8}
            className="w-full min-h-[180px] p-3.5 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:border-primary focus:bg-surface transition-colors resize-y"
          />
        </div>
      </div>

      {editingTech && (
        <TechDataModal site={site} siteId={siteId} onClose={() => setEditingTech(false)} />
      )}
    </div>
  );
}
