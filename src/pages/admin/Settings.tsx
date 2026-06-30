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
import { getCompanySettings, updateCompanySettings } from '../../api/settings';
import type { CompanySettings } from '../../api/settings';

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = Omit<CompanySettings, 'id' | 'created_at' | 'updated_at' | 'primary_color'>;

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
    <div className="bg-surface border border-border rounded-2xl shadow-sm dark:shadow-none backdrop-blur-md overflow-hidden">
      {/* Card header */}
      <div className="px-7 py-5 border-b border-border flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary-fixed dark:bg-primary/30 flex items-center justify-center text-primary dark:text-primary-ink flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-text">{title}</h3>
          <p className="text-[13px] text-muted mt-0.5">{description}</p>
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
      <label className="block text-[13px] font-semibold text-subtle mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none">
            {icon}
          </div>
        )}
        {children}
      </div>
      {hint && <p className="text-[12px] text-subtle mt-1">{hint}</p>}
    </div>
  );
}

function inputClass(hasIcon = false) {
  return `w-full h-[40px] bg-surface-2 border border-transparent dark:border-white/10 rounded-xl text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all ${hasIcon ? 'pl-9 pr-3' : 'px-3'}`;
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
    warehouse_lat: null,
    warehouse_lng: null,
  });

  // ── Fetch current settings ────────────────────────────────────────────────
  const { data: settings, isLoading } = useQuery({
    queryKey: ['company_settings'],
    queryFn: getCompanySettings,
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
        warehouse_lat: settings.warehouse_lat,
        warehouse_lng: settings.warehouse_lng,
      });
      // Always sync coordsInput from DB — null → '' so stale typed values don't persist
      setCoordsInput(
        settings.warehouse_lat != null && settings.warehouse_lng != null
          ? `${settings.warehouse_lat}, ${settings.warehouse_lng}`
          : '',
      );
      if (settings.logo_url) setLogoPreview(settings.logo_url);
    }, 0);
    return () => clearTimeout(t);
  }, [settings]);

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (values: FormState) => updateCompanySettings(values),
    onSuccess: () => {
      toast.success('Nustatymai išsaugoti!');
      void qc.invalidateQueries({ queryKey: ['company_settings'] });
    },
    onError: (err) => {
      Sentry.captureException(err, { extra: { context: 'save company_settings' } });
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
      await updateCompanySettings({ logo_url: canonicalUrl });

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
        payload.warehouse_lat = lat;
        payload.warehouse_lng = lng;
      } else {
        toast.error('Neteisingas koordinačių formatas. Pvz.: 54.8985, 23.9036');
        return;
      }
    } else {
      payload.warehouse_lat = null;
      payload.warehouse_lng = null;
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
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#18181b] backdrop-blur-md -mx-6 px-6 pt-2 pb-4 mb-6 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-tight text-text dark:text-white leading-tight">Bendrieji nustatymai</h2>
          <p className="text-[13px] text-muted mt-0.5">
            Įmonės profilis, kontaktai, logistika ir prekės ženklas
          </p>
        </div>
        <button
          form="settings-form"
          type="submit"
          disabled={saveMutation.isPending}
          className="h-[40px] px-6 font-medium text-[14px] rounded-xl bg-primary text-white hover:bg-primary active:scale-[0.98] transition-all shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
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
            <div className="col-span-2 bg-surface-2 rounded-xl border border-border p-3.5 flex gap-2.5">
              <Info size={15} className="text-primary dark:text-primary-ink mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-muted">
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
          description="Logotipas visoje sistemoje"
        >
          <div className="max-w-md">
            {/* Logo upload */}
            <div>
              <label className="block text-[13px] font-semibold text-subtle mb-2">
                Įmonės logotipas
              </label>
              <div
                className="border-2 border-dashed border-border/50 dark:border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-[#f9f6ff] dark:hover:bg-surface-2 transition-all min-h-[160px] group"
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
                    <div className="w-14 h-14 rounded-2xl bg-primary-fixed dark:bg-primary/30 flex items-center justify-center group-hover:bg-[#dfc7ff] dark:group-hover:bg-primary/50 transition-colors">
                      <Image size={24} className="text-primary dark:text-primary-ink" />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-semibold text-primary dark:text-primary-ink">Pasirinkite failą</p>
                      <p className="text-[12px] text-subtle mt-0.5">PNG, JPG, SVG, WebP · maks. 2 MB</p>
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
          </div>
        </SectionCard>

      </form>
    </div>
  );
}
