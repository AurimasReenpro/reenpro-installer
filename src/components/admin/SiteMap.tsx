import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { LITHUANIA_CENTER, LITHUANIA_ZOOM } from '../../config/map';
import { Users } from 'lucide-react';

// ─── Fix Leaflet default icon paths broken by Vite bundling ────────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Fallback base (Lithuania center) used when company_settings is empty ────
const FALLBACK_BASE = { lat: 55.3, lng: 23.9, label: 'Baze' };

// ─── Custom SVG marker factory ──────────────────────────────────────────────
type MarkerColor = 'green' | 'orange' | 'gray' | 'purple';

function createSvgIcon(color: MarkerColor, pulse = false): L.DivIcon {
  const COLORS: Record<MarkerColor, { fill: string; glow: string }> = {
    green:  { fill: '#10B981', glow: 'rgba(16,185,129,0.4)' },
    orange: { fill: '#F59E0B', glow: 'rgba(245,158,11,0.4)' },
    gray:   { fill: '#9CA3AF', glow: 'rgba(156,163,175,0.3)' },
    purple: { fill: '#D95A1A', glow: 'rgba(217,90,26,0.4)' },
  };

  const { fill, glow } = COLORS[color];
  const pulseAnim = pulse
    ? `<circle cx="12" cy="10" r="14" fill="${glow}" opacity="0"><animate attributeName="r" from="10" to="22" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/></circle>`
    : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      ${pulseAnim}
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.268 21.732 0 14 0z"
            fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  });
}

// Base / warehouse marker — house shape
function createBaseIcon(): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42">
      <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 24 18 24S36 31.5 36 18C36 8.059 27.941 0 18 0z"
            fill="#D95A1A" stroke="white" stroke-width="2.5"/>
      <path d="M18 10 L26 17 L23.5 17 L23.5 26 L12.5 26 L12.5 17 L10 17 Z" fill="white"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [36, 42],
    iconAnchor: [18, 42],
    popupAnchor: [0, -42],
  });
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface MapSite {
  id: string;
  client_name: string | null;
  code: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  team: { name: string } | null;
}

export interface BaseCoords {
  lat: number;
  lng: number;
  label?: string;
}

interface SiteMapProps {
  sites: MapSite[];
  /** Base/warehouse coords from company_settings. Falls back to Lithuania center if not set. */
  baseCoords?: BaseCoords | null;
}

// ─── Popup content ───────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  in_progress: { label: 'Vyksta',      color: 'text-[#10B981] bg-[#ECFDF5]' },
  paused:      { label: 'Pristabdyta', color: 'text-[#F59E0B] bg-[#FFFBEB]' },
  pending:     { label: 'Planuojama',  color: 'text-[#6B7280] bg-[#F3F4F6]' },
  archived:    { label: 'Archyvuota',  color: 'text-zinc-500 bg-zinc-100' },
};

function SitePopup({ site }: { site: MapSite }) {
  const navigate = useNavigate();
  const statusInfo = STATUS_LABELS[site.status ?? ''] ?? {
    label: site.status ?? '—',
    color: 'text-muted bg-surface-2',
  };

  return (
    <div className="min-w-[190px] font-sans">
      <div className="mb-2">
        <p className="font-bold text-text text-[14px] leading-tight">
          {site.client_name || 'Nežinomas klientas'}
        </p>
        <p className="text-[11px] text-muted mt-0.5">{site.code}</p>
      </div>

      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold mb-2 ${statusInfo.color}`}>
        {statusInfo.label}
      </span>

      {site.team && (
        <div className="flex items-center gap-1.5 text-[12px] text-muted mt-1">
          <Users size={12} className="text-primary" />
          <span>{site.team.name}</span>
        </div>
      )}

      <button
        onClick={() => { void navigate(`/admin/sites/${site.id}`); }}
        className="mt-3 w-full text-[12px] font-semibold text-primary hover:underline text-left cursor-pointer"
      >
        Žiūrėti →
      </button>
    </div>
  );
}

// ─── Auto-fit map bounds to markers ─────────────────────────────────────────
function FitBounds({ sites, base }: { sites: MapSite[]; base: BaseCoords }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    const validSites = sites.filter((s) => s.latitude && s.longitude);
    if (validSites.length === 0) return;

    const bounds = L.latLngBounds(
      validSites.map((s) => [s.latitude!, s.longitude!])
    );
    bounds.extend([base.lat, base.lng]);

    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
    fitted.current = true;
  }, [map, sites, base]);

  return null;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function SiteMap({ sites, baseCoords }: SiteMapProps) {
  const base: BaseCoords = baseCoords ?? FALLBACK_BASE;

  const validSites = sites.filter(
    (s) => typeof s.latitude === 'number' && typeof s.longitude === 'number'
  );

  const getIcon = useCallback((status: string | null): L.DivIcon => {
    if (status === 'in_progress') return createSvgIcon('green', true);
    if (status === 'paused')      return createSvgIcon('orange');
    return createSvgIcon('gray');
  }, []);

  return (
    <div className="relative isolate w-full h-full">
    <MapContainer
      center={LITHUANIA_CENTER}
      zoom={LITHUANIA_ZOOM}
      style={{ width: '100%', height: '100%', borderRadius: '12px' }}
      scrollWheelZoom
      zoomControl
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Gatvių vaizdas (OSM)">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Palydovinis vaizdas (Esri)">
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {/* Auto-fit bounds when sites load */}
      {validSites.length > 0 && <FitBounds sites={validSites} base={base} />}

      {/* Company base marker */}
      <Marker
        position={[base.lat, base.lng]}
        icon={createBaseIcon()}
      >
        <Popup>
          <div className="font-sans text-[13px]">
            <p className="font-bold text-text">{base.label ?? 'Įmonės sandėlis'}</p>
            <p className="text-[11px] text-muted mt-0.5">
              {base.lat.toFixed(4)}, {base.lng.toFixed(4)}
            </p>
          </div>
        </Popup>
      </Marker>

      {/* Site markers */}
      {validSites.map((site) => (
        <Marker
          key={site.id}
          position={[site.latitude!, site.longitude!]}
          icon={getIcon(site.status)}
        >
          <Popup minWidth={210}>
            <SitePopup site={site} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
    </div>
  );
}
