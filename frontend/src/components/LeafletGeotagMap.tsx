import React, { useEffect, useRef, useState } from 'react';
import { Layers, MapPin, Maximize2, Navigation, RefreshCw } from 'lucide-react';
import { GeotagEvidenceRecord } from '../lib/geotagEvidence';

interface LeafletGeotagMapProps {
  records: GeotagEvidenceRecord[];
  selectedConstituency: 'ALL' | 'Anakapalle' | 'Vijayawada';
  onOpenPhoto: (record: GeotagEvidenceRecord, imageName?: string) => void;
  onOpenBills: (record: GeotagEvidenceRecord) => void;
  onOpenDossier: (record: GeotagEvidenceRecord) => void;
}

export const LeafletGeotagMap: React.FC<LeafletGeotagMapProps> = ({
  records,
  selectedConstituency,
  onOpenPhoto,
  onOpenBills,
  onOpenDossier,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const geofenceLayerRef = useRef<any>(null);
  const radiusLayerRef = useRef<any>(null);
  const [activeLayer, setActiveLayer] = useState<'dark' | 'osm' | 'satellite'>('dark');
  const [showRadius, setShowRadius] = useState<boolean>(true);
  const [showGeofences, setShowGeofences] = useState<boolean>(true);
  const [mapReady, setMapReady] = useState(false);

  // Store records in ref for popup callbacks
  const recordsMapRef = useRef<Map<string, GeotagEvidenceRecord>>(new Map());
  useEffect(() => {
    const map = new Map<string, GeotagEvidenceRecord>();
    records.forEach((r) => {
      map.set(String(r.workId), r);
      if (r.fullWorkId) map.set(String(r.fullWorkId), r);
    });
    recordsMapRef.current = map;
  }, [records]);

  // Handle global popup button clicks
  useEffect(() => {
    const handlePopupAction = (e: any) => {
      const target = e.target.closest('[data-map-action]');
      if (!target) return;
      const action = target.getAttribute('data-map-action');
      const workId = target.getAttribute('data-work-id');
      const record = recordsMapRef.current.get(workId);
      if (!record) return;

      if (action === 'photo') {
        onOpenPhoto(record);
      } else if (action === 'bills') {
        onOpenBills(record);
      } else if (action === 'dossier') {
        onOpenDossier(record);
      }
    };

    window.addEventListener('click', handlePopupAction);
    return () => window.removeEventListener('click', handlePopupAction);
  }, [onOpenPhoto, onOpenBills, onOpenDossier]);

  // Initialize Leaflet Map
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      }).setView([17.15, 81.8], 8);

      // Tile layers
      const darkMatter = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19 }
      );
      const osm = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19 }
      );
      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
      );

      darkMatter.addTo(map);
      mapInstanceRef.current = map;
      (map as any)._tileLayers = { dark: darkMatter, osm, satellite };

      // Geofences
      const geofenceGroup = L.layerGroup().addTo(map);
      geofenceLayerRef.current = geofenceGroup;

      // 1. Anakapalli District Boundary (Cyan)
      const anakapalliBbox = [
        [17.35, 82.65],
        [18.05, 82.65],
        [18.05, 83.35],
        [17.35, 83.35],
      ];
      L.polygon(anakapalliBbox, {
        color: '#06B6D4',
        weight: 2,
        fillColor: '#06B6D4',
        fillOpacity: 0.05,
        dashArray: '6, 8',
      })
        .bindTooltip('Anakapalli District Geofence (17.35°-18.05°N, 82.65°-83.35°E)', {
          permanent: false,
          className: 'leaflet-tooltip-dark',
        })
        .addTo(geofenceGroup);

      // 2. Vijayawada / NTR District Boundary (Purple)
      const vijayawadaBbox = [
        [16.4, 80.0],
        [17.15, 80.0],
        [17.15, 80.85],
        [16.4, 80.85],
      ];
      L.polygon(vijayawadaBbox, {
        color: '#8B5CF6',
        weight: 2,
        fillColor: '#8B5CF6',
        fillOpacity: 0.05,
        dashArray: '6, 8',
      })
        .bindTooltip('Vijayawada / NTR District Geofence (16.40°-17.15°N, 80.00°-80.85°E)', {
          permanent: false,
          className: 'leaflet-tooltip-dark',
        })
        .addTo(geofenceGroup);

      const radiusGroup = L.layerGroup().addTo(map);
      radiusLayerRef.current = radiusGroup;

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;

      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 250);
    } catch (err) {
      console.error('Error initializing Leaflet in React:', err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Toggle Geofences Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    const geofenceGroup = geofenceLayerRef.current;
    if (!map || !geofenceGroup) return;

    if (showGeofences) {
      if (!map.hasLayer(geofenceGroup)) geofenceGroup.addTo(map);
    } else {
      if (map.hasLayer(geofenceGroup)) map.removeLayer(geofenceGroup);
    }
  }, [showGeofences]);

  // Toggle Radius Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    const radiusGroup = radiusLayerRef.current;
    if (!map || !radiusGroup) return;

    if (showRadius) {
      if (!map.hasLayer(radiusGroup)) radiusGroup.addTo(map);
    } else {
      if (map.hasLayer(radiusGroup)) map.removeLayer(radiusGroup);
    }
  }, [showRadius]);

  // Update Tile Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !(map as any)._tileLayers) return;
    const layers = (map as any)._tileLayers;

    Object.values(layers).forEach((layer: any) => map.removeLayer(layer));
    if (layers[activeLayer]) {
      layers[activeLayer].addTo(map);
    }
  }, [activeLayer]);

  // Update Markers & Radius Circles
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const radiusLayer = radiusLayerRef.current;
    if (!L || !map || !markersLayer || !radiusLayer || !mapReady) return;

    markersLayer.clearLayers();
    radiusLayer.clearLayers();

    const verifiedRecords = records.filter(
      (r) => r.gps && Number.isFinite(r.gps.latitude) && Number.isFinite(r.gps.longitude)
    );

    verifiedRecords.forEach((record) => {
      const lat = record.gps!.latitude;
      const lon = record.gps!.longitude;
      const isVijayawada = record.constituency === 'Vijayawada';
      const isFraud = Boolean(record.isFraudSuspected);
      const pinColor = isFraud ? '#F43F5E' : (isVijayawada ? '#A855F7' : '#10B981');
      const previewImg = record.gpsImages[0] || record.images[0];
      const hasBills = (record.handwrittenBillsCount || 0) > 0;
      const workId = record.fullWorkId || record.workId;

      // Add GPS 300m tolerance buffer circle
      const circle = L.circle([lat, lon], {
        radius: 300,
        color: pinColor,
        fillColor: pinColor,
        fillOpacity: isFraud ? 0.25 : 0.12,
        weight: isFraud ? 2 : 1.2,
        dashArray: isFraud ? '2, 4' : '4, 4',
      }).bindTooltip(`${isFraud ? '🚨 COLLISION RISK: ' : ''}${workId} (300m Precision Buffer)`, {
        permanent: false,
        className: 'leaflet-tooltip-dark',
      });
      radiusLayer.addLayer(circle);

      const customIcon = L.divIcon({
        className: 'leaflet-custom-marker',
        html: `
          <div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
            <span style="position: absolute; inset: 0; border-radius: 50%; background: ${pinColor}; opacity: 0.4; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
            <div style="width: 28px; height: 28px; font-size: 13px; background: ${pinColor}; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px ${pinColor}; border: 2px solid white; cursor: pointer; position: relative; z-index: 10;">
              ${isFraud ? '🚨' : '📍'}
            </div>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([lat, lon], { icon: customIcon });

      const popupHtml = `
        <div style="min-width: 250px; font-family: system-ui, -apple-system, sans-serif; color: #0F172A; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 800; font-family: monospace; font-size: 12px; color: ${isFraud ? '#E11D48' : (isVijayawada ? '#7C3AED' : '#047857')};">
              WORK ${workId}
            </span>
            <span style="background: ${isVijayawada ? '#F3E8FF' : '#ECFDF5'}; color: ${isVijayawada ? '#6B21A8' : '#065F46'}; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px;">
              ${record.constituency}
            </span>
          </div>
          <div style="font-size: 12px; font-weight: 700; margin: 4px 0 6px 0; color: #0F172A; line-height: 1.3;">
            ${record.title.substring(0, 56)}...
          </div>
          <div style="font-size: 11px; margin-bottom: 2px; color: #475569;">
            <strong>Mandal:</strong> ${record.mandal} · <strong>Status:</strong> ${record.status.replace(/_/g, ' ')}
          </div>
          <div style="background: ${isFraud ? '#FFF1F2' : '#F0FDF4'}; border: 1px solid ${isFraud ? '#FECDD3' : '#BBF7D0'}; border-radius: 6px; padding: 5px 8px; margin: 6px 0; font-size: 11px; color: ${isFraud ? '#9F1239' : '#166534'};">
            <div><strong>📍 Stamped GPS:</strong> ${lat.toFixed(6)}° N, ${lon.toFixed(6)}° E</div>
            <div style="font-size: 10px; color: ${isFraud ? '#BE123C' : '#15803D'}; margin-top: 1px;">Source: ${record.gps?.source || 'Visual GPS Stamp'} · 300m Precision</div>
          </div>
          ${
            previewImg
              ? `
            <div style="width: 100%; height: 95px; border-radius: 6px; overflow: hidden; margin-bottom: 6px; background: #0F172A; cursor: pointer;" data-map-action="photo" data-work-id="${record.workId}">
              <img src="${previewImg.url}" style="width: 100%; height: 100%; object-fit: cover;" alt="Site photo">
            </div>
          `
              : ''
          }
          <div style="display: flex; gap: 4px; margin-top: 6px;">
            <button data-map-action="photo" data-work-id="${record.workId}" style="
              flex: 1; background: #8B5CF6; color: white; border: none; padding: 6px 4px; border-radius: 6px; font-size: 10.5px; font-weight: 700; cursor: pointer;
            ">👁️ Photo</button>
            ${
              hasBills
                ? `
              <button data-map-action="bills" data-work-id="${record.workId}" style="
                flex: 1; background: #F59E0B; color: #000; border: none; padding: 6px 4px; border-radius: 6px; font-size: 10.5px; font-weight: 800; cursor: pointer;
              ">🧾 Bills (${record.handwrittenBillsCount})</button>
            `
                : ''
            }
            <button data-map-action="dossier" data-work-id="${record.workId}" style="
              flex: 1; background: #0284C7; color: white; border: none; padding: 6px 4px; border-radius: 6px; font-size: 10.5px; font-weight: 700; cursor: pointer;
            ">Inspect</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      markersLayer.addLayer(marker);
    });
  }, [records, mapReady]);

  // Constituency Focus Controller
  const focusConstituency = (cName: 'ALL' | 'Anakapalle' | 'Vijayawada') => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (cName === 'Anakapalle') {
      map.flyToBounds(
        [
          [17.35, 82.65],
          [18.05, 83.35],
        ],
        { duration: 1.2, padding: [30, 30] }
      );
    } else if (cName === 'Vijayawada') {
      map.flyToBounds(
        [
          [16.4, 80.0],
          [17.15, 80.85],
        ],
        { duration: 1.2, padding: [30, 30] }
      );
    } else {
      map.flyToBounds(
        [
          [16.2, 79.9],
          [18.15, 83.45],
        ],
        { duration: 1.2, padding: [30, 30] }
      );
    }
  };

  useEffect(() => {
    if (mapReady) {
      focusConstituency(selectedConstituency);
    }
  }, [selectedConstituency, mapReady]);

  const verifiedCount = records.filter((r) => r.gps && Number.isFinite(r.gps.latitude)).length;

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 shadow-xl">
      {/* Top Map Toolbar */}
      <div className="absolute left-4 top-4 z-[400] flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-700/90 bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-slate-200 shadow-md backdrop-blur-md">
          <MapPin className="h-3.5 w-3.5 text-emerald-400" />
          <span>{verifiedCount} Verified GPS Sites</span>
        </div>

        {/* Constituency quick jump */}
        <div className="flex items-center rounded-xl border border-slate-700/90 bg-slate-900/90 p-0.5 shadow-md backdrop-blur-md">
          {(['ALL', 'Anakapalle', 'Vijayawada'] as const).map((c) => (
            <button
              key={c}
              onClick={() => focusConstituency(c)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                selectedConstituency === c
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {c === 'ALL' ? 'All AP' : c}
            </button>
          ))}
        </div>

        {/* Visual Tolerance & Geofence Toggles */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-700/90 bg-slate-900/90 p-1 shadow-md backdrop-blur-md">
          <button
            onClick={() => setShowRadius((prev) => !prev)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              showRadius ? 'bg-emerald-600/90 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle 300m GPS Precision Radius Buffers"
          >
            <span>⭕</span> 300m Buffer
          </button>
          <button
            onClick={() => setShowGeofences((prev) => !prev)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              showGeofences ? 'bg-cyan-600/90 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle District Geofence Boundaries"
          >
            <span>⬡</span> Geofences
          </button>
        </div>
      </div>

      {/* Layer Switcher (Top-Right) */}
      <div className="absolute right-4 top-4 z-[400] flex items-center rounded-xl border border-slate-700/90 bg-slate-900/90 p-1 shadow-md backdrop-blur-md">
        <span className="flex items-center gap-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <Layers className="h-3 w-3" /> Map Layer
        </span>
        <button
          onClick={() => setActiveLayer('dark')}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
            activeLayer === 'dark' ? 'bg-slate-800 text-white ring-1 ring-slate-600' : 'text-slate-400 hover:text-white'
          }`}
        >
          Dark Matter
        </button>
        <button
          onClick={() => setActiveLayer('osm')}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
            activeLayer === 'osm' ? 'bg-slate-800 text-white ring-1 ring-slate-600' : 'text-slate-400 hover:text-white'
          }`}
        >
          Streets
        </button>
        <button
          onClick={() => setActiveLayer('satellite')}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
            activeLayer === 'satellite' ? 'bg-slate-800 text-white ring-1 ring-slate-600' : 'text-slate-400 hover:text-white'
          }`}
        >
          Satellite
        </button>
      </div>

      {/* Bottom Map Legend */}
      <div className="absolute bottom-3 left-3 z-[400] flex flex-wrap items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-[11px] font-semibold text-slate-300 shadow-lg backdrop-blur-md">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span> Anakapalle Sites
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-400"></span> Vijayawada Sites
        </span>
        <span className="flex items-center gap-1.5 border-l border-slate-700 pl-3">
          <span className="h-2 w-4 border border-dashed border-cyan-400 bg-cyan-400/10"></span> Geofence Boundaries
        </span>
      </div>

      {/* Leaflet DOM container */}
      <div ref={mapContainerRef} className="h-full w-full bg-slate-950" />
    </div>
  );
};

export default LeafletGeotagMap;
