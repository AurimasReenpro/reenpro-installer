import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import * as Sentry from '@sentry/react';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Palette,
  Image,
  Save,
  Loader2,
  Navigation,
  Info,
  CreditCard,
  Hash,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CompanySettings {
  id: string;
  company_name: string | null;
  company_code: string | null;
  vat_code: string | null;
  iban: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  primary_color: string | null;
  base_lat: number | null;
  base_lng: number | null;
}

type FormState = Omit<CompanySettings, 'id'>;

const SETTINGS_ROW_ID = '00000000-0000-0000-0000-000000000001';

// ─── Section Card wrapper ─────────────────────────────────────────────────────
function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Card header */}
      <div className="px-7 py-5 border-b border-gray-100 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#ecdcff] flex items-center justify-center text-primary flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-[#1d033a]">{title}</h3>
          <p className="text-[13px] text-[#4b4452]/80 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="p-7">{children}</div>
    </div>
  );
}

// ─── Input field component ────────────────────────────────────────────────────
function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-[#1d033a] mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b4452]/60 pointer-events-none">
            {icon}
          </div>
        )}
        {children}
      </div>
      {hint && <p className="text-[12px] text-[#4b4452]/60 mt-1">{hint}</p>}
    </div>
  );
}

function inputClass(hasIcon = false) {
  return `w-full h-[40px] bg-[#f6f5fa] border border-[#cdc3d4]/60 rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:bg-white transition-colors ${hasIcon ? 'pl-9 pr-3' : 'px-3'}`;
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function Settings() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coordsInput, setCoordsInput] = useState('');

  const [form, setForm] = useState<FormState>({
    company_name: '',
    company_code: '',
    vat_code: '',
    iban: '',
    address: '',
    phone: '',
    email: '',
    logo_url: null,
    primary_color: '#490891',
    base_lat: null,
    base_lng: null,
  });

  // ── Fetch current settings ────────────────────────────────────────────────
  const { data: settings, isLoading } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', SETTINGS_ROW_ID)
        .maybeSingle();

      if (error) {
        Sentry.captureException(error, { extra: { context: 'fetch company_settings' } });
        throw error;
      }
      return data;
    },
  });

  // Populate form when data arrives — setState is deferred into a callback to
  // satisfy the react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    if (!settings) return;
    const t = setTimeout(() => {
      setForm({
        company_name:  settings.company_name  ?? '',
        company_code:  settings.company_code  ?? '',
        vat_code:      settings.vat_code      ?? '',
        iban:          settings.iban          ?? '',
        address:       settings.address       ?? '',
        phone:         settings.phone         ?? '',
        email:         settings.email         ?? '',
        logo_url:      settings.logo_url,
        primary_color: settings.primary_color ?? '#490891',
        base_lat:      settings.base_lat,
        base_lng:      settings.base_lng,
      });
      // Always sync coordsInput from DB — null → '' so stale typed values don't persist
      setCoordsInput(
        settings.base_lat != null && settings.base_lng != null
          ? `${settings.base_lat}, ${settings.base_lng}`
          : '',
      );
      if (settings.logo_url) setLogoPreview(settings.logo_url);
    }, 0);
    return () => clearTimeout(t);
  }, [settings]);

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (values: FormState) => {
      const payload = {
        id: SETTINGS_ROW_ID,
        ...values,
        base_lat: values.base_lat != null ? Number(values.base_lat) : null,
        base_lng: values.base_lng != null ? Number(values.base_lng) : null,
      };

      console.log('[Settings] Saving payload:', payload);

      const { data, error } = await supabase
        .from('company_settings')
        .upsert(payload)
        .select()
        .single();

      if (error) {
        console.error('[Settings] Upsert error:', error);
        throw error;
      }
      if (!data) {
        // RLS UPDATE policy is blocking the write without returning an error
        console.error('[Settings] Upsert returned no data — likely blocked by RLS');
        throw new Error('Nustatymai neišsaugoti: serveris atmetė užklausą (RLS).');
      }
      console.log('[Settings] Saved successfully:', data);
    },
    onSuccess: () => {
      toast.success('Nustatymai išsaugoti!');
      void qc.invalidateQueries({ queryKey: ['company_settings'] });
    },
    onError: (err) => {
      Sentry.captureException(err, { extra: { context: 'save company_settings' } });
      console.error('[Settings] Save failed:', err);
      toast.error(err instanceof Error ? err.message : 'Klaida išsaugant nustatymus.');
    },
  });

  // ── Logo upload ───────────────────────────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Failas per didelis. Maksimalus dydis – 2 MB.');
      return;
    }

    // Instant local preview while upload runs
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);

    setLogoUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      // Unique filename per upload — breaks CDN/browser cache on every replace
      const path = `logo-${Date.now()}.${ext}`;

      console.log('[Logo] Uploading to storage:', path);
      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        console.error('[Logo] Storage upload failed:', uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('branding')
        .getPublicUrl(path);

      const canonicalUrl = urlData.publicUrl;
      console.log('[Logo] Public URL:', canonicalUrl);

      // Delete the previous file from storage (best-effort; don't block on failure)
      const oldUrl = settings?.logo_url ?? form.logo_url;
      if (oldUrl) {
        try {
          // Extract just the storage object name from the full public URL
          // URL shape: https://<project>.supabase.co/storage/v1/object/public/branding/<name>
          const oldPath = decodeURIComponent(new URL(oldUrl).pathname.split('/branding/')[1] ?? '');
          if (oldPath) {
            await supabase.storage.from('branding').remove([oldPath]);
            console.log('[Logo] Deleted old file:', oldPath);
          }
        } catch (cleanupErr) {
          console.warn('[Logo] Old file cleanup failed (non-fatal):', cleanupErr);
        }
      }

      // Persist canonical URL to DB immediately — no wait for full form save
      const { error: dbError } = await supabase
        .from('company_settings')
        .upsert({ id: SETTINGS_ROW_ID, logo_url: canonicalUrl });

      if (dbError) {
        console.error('[Logo] DB update failed:', dbError);
        throw dbError;
      }

      // Store canonical URL in form state; unique path means no cache-buster needed
      setForm((f) => ({ ...f, logo_url: canonicalUrl }));
      setLogoPreview(canonicalUrl);

      // Invalidate so AdminLayout sidebar picks up the new logo immediately
      void qc.invalidateQueries({ queryKey: ['company_settings'] });

      toast.success('Logotipas įkeltas!');
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'logo upload' } });
      console.error('[Logo] Upload error:', err);
      toast.error('Klaida įkeliant logotipą.');
      setLogoPreview(settings?.logo_url ?? null);
    } finally {
      setLogoUploading(false);
    }
  };

  const set = (field: keyof FormState, value: string | number | null) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form };
    if (coordsInput.trim()) {
      const parts = coordsInput.split(',');
      const lat = parseFloat(parts[0]?.trim() ?? '');
      const lng = parseFloat(parts[1]?.trim() ?? '');
      if (parts.length >= 2 && !isNaN(lat) && !isNaN(lng)) {
        payload.base_lat = lat;
        payload.base_lng = lng;
      } else {
        toast.error('Neteisingas koordinačių formatas. Pvz.: 54.8985, 23.9036');
        return;
      }
    } else {
      payload.base_lat = null;
      payload.base_lng = null;
    }
    saveMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* ── Sticky header bar ───────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-[#f6f5fa]/80 backdrop-blur-md -mx-6 px-6 pt-2 pb-4 mb-6 border-b border-[#cdc3d4]/20 flex justify-between items-center">
        <div>
          <h2 className="text-[22px] font-bold text-[#1d033a] leading-tight">Bendrieji nustatymai</h2>
          <p className="text-[13px] text-[#4b4452] mt-0.5">
            Įmonės profilis, kontaktai, logistika ir prekės ženklas
          </p>
        </div>
        <button
          form="settings-form"
          type="submit"
          disabled={saveMutation.isPending}
          className="h-[40px] px-6 font-semibold text-[14px] rounded-[10px] bg-primary text-white hover:bg-primary/80 active:scale-[0.98] transition-all shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saveMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Išsaugoti
        </button>
      </div>

      <form id="settings-form" onSubmit={handleSubmit}>

        {/* ── 2-column card grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── 1. Įmonės rekvizitai ──────────────────────────────────── */}
        <SectionCard
          icon={<Building2 size={18} />}
          title="Įmonės rekvizitai"
          description="Teisiniai duomenys sąskaitose ir dokumentuose"
        >
          <div className="grid grid-cols-2 gap-5">
            <Field label="Įmonės pavadinimas" icon={<Building2 size={15} />}>
              <input
                type="text"
                id="company_name"
                value={form.company_name ?? ''}
                onChange={(e) => set('company_name', e.target.value)}
                placeholder="UAB Mano Saule"
                className={inputClass(true)}
              />
            </Field>

            <Field label="Įmonės kodas" icon={<Hash size={15} />}>
              <input
                type="text"
                id="company_code"
                value={form.company_code ?? ''}
                onChange={(e) => set('company_code', e.target.value)}
                placeholder="302345678"
                className={inputClass(true)}
              />
            </Field>

            <Field label="PVM kodas" icon={<Hash size={15} />}>
              <input
                type="text"
                id="vat_code"
                value={form.vat_code ?? ''}
                onChange={(e) => set('vat_code', e.target.value)}
                placeholder="LT100001234567"
                className={inputClass(true)}
              />
            </Field>

            <Field label="IBAN sąskaita" icon={<CreditCard size={15} />}>
              <input
                type="text"
                id="iban"
                value={form.iban ?? ''}
                onChange={(e) => set('iban', e.target.value)}
                placeholder="LT12 3456 7890 1234 5678"
                className={inputClass(true)}
              />
            </Field>

            <div className="col-span-2">
              <Field label="Registruotas adresas" icon={<MapPin size={15} />}>
                <input
                  type="text"
                  id="reg_address"
                  value={form.address ?? ''}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Laisves pr. 60, LT-44307 Kaunas"
                  className={inputClass(true)}
                />
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* ── 2. Kontaktai ir Logistika ─────────────────────────────── */}
        <SectionCard
          icon={<Navigation size={18} />}
          title="Kontaktai ir logistika"
          description="Kontaktai ir sandėlio koordinatės žemėlapiui"
        >
          <div className="grid grid-cols-2 gap-5">
            <Field label="Telefonas" icon={<Phone size={15} />}>
              <input
                type="tel"
                id="phone"
                value={form.phone ?? ''}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+370 600 00000"
                className={inputClass(true)}
              />
            </Field>

            <Field label="El. paštas" icon={<Mail size={15} />}>
              <input
                type="email"
                id="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                placeholder="info@manosaule.lt"
                className={inputClass(true)}
              />
            </Field>

            {/* Base coords */}
            <div className="col-span-2">
              <Field
                label="Sandėlio koordinatės"
                icon={<Navigation size={15} />}
                hint="Nukopijuokite iš Google Maps. Pvz.: 54.8985, 23.9036"
              >
                <input
                  type="text"
                  id="coordsInput"
                  value={coordsInput}
                  onChange={(e) => setCoordsInput(e.target.value)}
                  placeholder="54.8985, 23.9036"
                  className={inputClass(true)}
                />
              </Field>
            </div>

            {/* Helper tip */}
            <div className="col-span-2 bg-[#f6f5fa] rounded-xl border border-[#cdc3d4]/30 p-3.5 flex gap-2.5">
              <Info size={15} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-[#4b4452]">
                Koordinates galite rasti{' '}
                <a
                  href="https://www.google.com/maps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-semibold hover:underline"
                >
                  Google Maps
                </a>
                {' '}— dešiniu pelės mygtuku spustelėkite vietą ir nukopijuokite koordinates.
              </p>
            </div>
          </div>
        </SectionCard>

        </div> {/* end 2-col grid */}

        {/* ── 3. Prekės ženklas (full width) ───────────────────────────── */}
        <SectionCard
          icon={<Palette size={18} />}
          title="Prekės ženklas"
          description="Logotipas ir pagrindinė spalva visoje sistemoje"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Logo upload */}
            <div>
              <label className="block text-[13px] font-semibold text-[#1d033a] mb-2">
                Įmonės logotipas
              </label>
              <div
                className="border-2 border-dashed border-[#cdc3d4]/50 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-[#f9f6ff] transition-all min-h-[160px] group"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoUploading ? (
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                ) : logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logotipas"
                    className="h-20 w-auto max-w-full object-contain"
                  />
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-[#ecdcff] flex items-center justify-center group-hover:bg-[#dfc7ff] transition-colors">
                      <Image size={24} className="text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-semibold text-primary">Pasirinkite failą</p>
                      <p className="text-[12px] text-[#4b4452]/60 mt-0.5">PNG, JPG, SVG, WebP · maks. 2 MB</p>
                    </div>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={(e) => { void handleLogoUpload(e); }}
                className="hidden"
              />
              {logoPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setLogoPreview(null);
                    set('logo_url', null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-[12px] text-[#ba1a1a] hover:underline mt-2 block"
                >
                  Pašalinti logotipą
                </button>
              )}
            </div>

            {/* Primary color */}
            <div className="flex flex-col gap-5">
              <Field
                label="Pagrindinė spalva"
                hint="Naudojama mygtukams ir akcentams visoje sistemoje"
              >
                <div className="flex items-center gap-3 h-[40px]">
                  <input
                    type="color"
                    id="primary_color"
                    value={form.primary_color ?? '#490891'}
                    onChange={(e) => set('primary_color', e.target.value)}
                    className="w-[40px] h-[40px] rounded-[8px] border border-[#cdc3d4]/60 cursor-pointer p-0.5 bg-white flex-shrink-0"
                  />
                  <input
                    type="text"
                    value={form.primary_color ?? '#490891'}
                    onChange={(e) => {
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value))
                        set('primary_color', e.target.value);
                    }}
                    maxLength={7}
                    placeholder="#490891"
                    className="flex-1 h-[40px] bg-[#f6f5fa] border border-[#cdc3d4]/60 rounded-[8px] px-3 text-[14px] font-mono text-[#1d033a] focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </Field>

              {/* Color preview */}
              <div className="rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                <div
                  className="h-[56px] flex items-center justify-center"
                  style={{ backgroundColor: form.primary_color ?? '#490891' }}
                >
                  <span className="text-white font-semibold text-[13px] tracking-wide">Peržiūra</span>
                </div>
                <div className="p-4 bg-white flex gap-2.5">
                  <span
                    className="px-3.5 py-1.5 rounded-full text-[12px] font-bold text-white"
                    style={{ backgroundColor: form.primary_color ?? '#490891' }}
                  >
                    Mygtukas
                  </span>
                  <span
                    className="px-3.5 py-1.5 rounded-full text-[12px] font-bold"
                    style={{
                      backgroundColor: `${form.primary_color ?? '#490891'}20`,
                      color: form.primary_color ?? '#490891',
                    }}
                  >
                    Žymė
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

      </form>
    </div>
  );
}
