import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, MapPin } from 'lucide-react';
import { PublicWorkRecord } from '../types';

interface CitizenLeafletMapProps {
  records: PublicWorkRecord[];
  selectedId?: string;
  onSelect: (record: PublicWorkRecord) => void;
}

type LeafletInstance = any;

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const statusLabel = (status: string) => {
  switch (status) {
    case 'ONGOING': return 'Ongoing work';
    case 'COMPLETED': return 'Completed work';
    case 'NOT_STARTED': return 'Not started';
    default: return 'Other status';
  }
};

const statusClass = (status: string) => status.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const popupContent = (record: PublicWorkRecord) => {
  const coordinates = record.coordinate_available && record.latitude != null && record.longitude != null
    ? `${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)}`
    : 'Not published';

  return `<div class="citizen-leaflet-popup">
    <div class="citizen-leaflet-popup__topline">
      <span class="citizen-leaflet-popup__id">${escapeHtml(record.work_id)}</span>
      <span class="citizen-leaflet-popup__status">${escapeHtml(statusLabel(record.normalized_status))}</span>
    </div>
    <div class="citizen-leaflet-popup__title">${escapeHtml(record.description || 'Work description not published')}</div>
    <div class="citizen-leaflet-popup__meta">${escapeHtml(record.state || 'State not published')} · ${escapeHtml(record.constituency || 'Constituency not published')}</div>
    <div class="citizen-leaflet-popup__facts">
      <div><span>Category</span><strong>${escapeHtml(record.work_category || 'Not published')}</strong></div>
      <div><span>Published position</span><strong class="citizen-leaflet-popup__coordinates">${escapeHtml(coordinates)}</strong></div>
    </div>
    <div class="citizen-leaflet-popup__hint">Select this marker to open the full public work detail and submit proof.</div>
  </div>`;
};

export const CitizenLeafletMap: React.FC<CitizenLeafletMapProps> = ({ records, selectedId, onSelect }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletInstance>(null);
  const markerLayerRef = useRef<LeafletInstance>(null);
  const tileLayersRef = useRef<Record<string, LeafletInstance>>({});
  const markerRefs = useRef<Map<string, LeafletInstance>>(new Map());
  const [activeLayer, setActiveLayer] = useState<'osm' | 'dark' | 'satellite'>('osm');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');

  const positioned = useMemo(
    () => records.filter((record) => record.coordinate_available && record.latitude != null && record.longitude != null),
    [records],
  );

  useEffect(() => {
    const container = mapContainerRef.current;
    const L = (window as any).L;
    if (!container) return undefined;
    if (!L) {
      setMapError('The Leaflet map library is not available in this browser session.');
      return undefined;
    }

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    });

    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
    });

    tileLayersRef.current = { osm, dark, satellite };
    osm.addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('&copy; OpenStreetMap contributors · Esri/CARTO tiles')
      .addTo(map);

    const markerLayer = L.layerGroup().addTo(map);
    mapRef.current = map;
    markerLayerRef.current = markerLayer;
    setMapReady(true);
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      markerRefs.current.clear();
      markerLayer.clearLayers();
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const layers = tileLayersRef.current;
    Object.entries(layers).forEach(([name, layer]) => {
      if (name === activeLayer) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
  }, [activeLayer, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerLayerRef.current) return;
    const L = (window as any).L;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    markerLayer.clearLayers();
    markerRefs.current.clear();

    if (!positioned.length) {
      map.setView([20.5937, 78.9629], 5);
      window.setTimeout(() => map.invalidateSize(), 0);
      return;
    }

    const bounds = L.latLngBounds([]);
    positioned.forEach((record) => {
      const latitude = Number(record.latitude);
      const longitude = Number(record.longitude);
      const selected = selectedId === record.work_id;
      const markerClass = statusClass(record.normalized_status);
      const icon = L.divIcon({
        className: `citizen-leaflet-marker-shell ${selected ? 'is-selected' : ''}`,
        html: `<span class="citizen-leaflet-marker citizen-leaflet-marker--${escapeHtml(markerClass)}" aria-hidden="true"></span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
      });
      const marker = L.marker([latitude, longitude], {
        icon,
        title: `${record.work_id} · ${statusLabel(record.normalized_status)}`,
        alt: record.work_id,
      });
      marker.bindTooltip(escapeHtml(record.work_id), {
        direction: 'top',
        offset: [0, -12],
        opacity: 0.95,
      });
      marker.bindPopup(popupContent(record), { maxWidth: 320, closeButton: true });
      marker.on('click', () => onSelect(record));
      markerLayer.addLayer(marker);
      markerRefs.current.set(record.work_id, marker);
      bounds.extend([latitude, longitude]);
    });

    if (positioned.length === 1) {
      const only = positioned[0];
      map.setView([Number(only.latitude), Number(only.longitude)], 14);
    } else {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13 });
    }
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [mapReady, onSelect, positioned, selectedId]);

  return <div className="citizen-leaflet-map" aria-label="Leaflet map of public works">
    <div ref={mapContainerRef} className="citizen-leaflet-map__surface" />
    <div className="citizen-leaflet-map__topbar">
      <div className="citizen-leaflet-map__badge"><MapPin className="h-3.5 w-3.5 text-emerald-400" /> Leaflet GIS · {positioned.length} positioned works</div>
      <div className="citizen-leaflet-map__layers" aria-label="Map layer">
        <Layers className="h-3.5 w-3.5 text-slate-400" />
        {(['osm', 'dark', 'satellite'] as const).map((layer) => <button key={layer} type="button" onClick={() => setActiveLayer(layer)} className={activeLayer === layer ? 'is-active' : ''} aria-pressed={activeLayer === layer}>
          {layer === 'osm' ? 'Streets' : layer === 'dark' ? 'Dark' : 'Satellite'}
        </button>)}
      </div>
    </div>
    {mapError && <div className="citizen-leaflet-map__message"><MapPin className="mx-auto h-8 w-8 text-amber-400" /><p>{mapError}</p></div>}
    {!mapError && !positioned.length && <div className="citizen-leaflet-map__message"><MapPin className="mx-auto h-8 w-8 text-slate-400" /><p>No published work coordinates match these filters.</p><small>Works without a public position remain available in the list.</small></div>}
    <div className="citizen-leaflet-map__note">Markers use existing published coordinates only. Selecting a marker opens its public work detail.</div>
    <div className="citizen-leaflet-map__legend" aria-label="Work status legend"><span><i className="citizen-leaflet-legend-dot citizen-leaflet-legend-dot--ongoing" /> Ongoing</span><span><i className="citizen-leaflet-legend-dot citizen-leaflet-legend-dot--completed" /> Completed</span><span><i className="citizen-leaflet-legend-dot citizen-leaflet-legend-dot--other" /> Other</span></div>
  </div>;
};

export default CitizenLeafletMap;
