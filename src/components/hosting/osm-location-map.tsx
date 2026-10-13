'use dom';

import React, { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './osm-location-map.css';

type Props = {
  latitude: number;
  longitude: number;
  selected: boolean;
  interactive?: boolean;
  height?: number;
  onPick?: (latitude: number, longitude: number) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
};

// Only coordinate/OSM locations enter this component. Google place content stays
// in the existing, separately attributed Google flow and is never plotted here.
export default function OsmLocationMap({ latitude, longitude, selected, interactive = true, height = 300, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const latest = useRef({ latitude, longitude, selected, onPick });
  latest.current = { latitude, longitude, selected, onPick };
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let resize: ResizeObserver | undefined;
    setReady(false);
    setError('');
    void import('leaflet').then(L => {
      if (!active || !container.current) return;
      leaflet.current = L;
      const current = latest.current;
      const instance = L.map(container.current, {
        center: [current.latitude, current.longitude], zoom: current.selected ? 16 : 12,
        minZoom: 3, maxZoom: 19, scrollWheelZoom: false, dragging: interactive,
        touchZoom: interactive, doubleClickZoom: interactive, boxZoom: interactive,
        keyboard: interactive, zoomControl: interactive, zoomAnimation: false,
        fadeAnimation: false, markerZoomAnimation: false,
      });
      map.current = instance;
      const tiles = L.tileLayer(process.env.EXPO_PUBLIC_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, noWrap: true, referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      }).addTo(instance);
      tiles.on('tileerror', () => active && setError('Some map tiles could not load. Check your connection or retry.'));
      tiles.on('tileload', () => active && setError(''));
      const pick = (point: Leaflet.LatLng) => {
        const wrapped = point.wrap();
        if (Math.abs(wrapped.lat) > 85.051129) return;
        void latest.current.onPick?.(Number(wrapped.lat.toFixed(7)), Number(wrapped.lng.toFixed(7)));
      };
      if (interactive) instance.on('click', (event: Leaflet.LeafletMouseEvent) => pick(event.latlng));
      // Resize after modal/layout changes without recreating or losing the pin.
      resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
      resize.observe(container.current);
      setReady(true);
    }).catch(() => { if (active) setError('The map could not load. Retry or use location search.'); });
    return () => { active = false; resize?.disconnect(); map.current?.remove(); map.current = null; marker.current = null; };
  }, [interactive, retry]);

  useEffect(() => {
    const instance = map.current, L = leaflet.current;
    if (!ready || !instance || !L) return;
    if (!selected) { marker.current?.remove(); marker.current = null; instance.setView([latitude, longitude], instance.getZoom(), { animate: false }); return; }
    const point: Leaflet.LatLngExpression = [latitude, longitude];
    if (!marker.current) {
      marker.current = L.marker(point, {
        draggable: interactive, keyboard: true, title: 'Selected meeting location',
        alt: 'Selected meeting location pin',
        icon: L.divIcon({ className: 'wenitro-map-marker', html: '<span aria-hidden="true"></span>', iconSize: [30, 38], iconAnchor: [15, 38] }),
      }).addTo(instance);
      marker.current.on('dragend', () => {
        const moved = marker.current?.getLatLng().wrap();
        if (moved && Math.abs(moved.lat) <= 85.051129) void latest.current.onPick?.(Number(moved.lat.toFixed(7)), Number(moved.lng.toFixed(7)));
      });
    } else marker.current.setLatLng(point);
    instance.setView(point, Math.max(instance.getZoom(), 16), { animate: false });
  }, [latitude, longitude, selected, ready, interactive]);

  return <div className="wenitro-osm-map" style={{ width: '100%' }}>
    <div ref={container} role="region" aria-label={interactive ? 'OpenStreetMap location selector' : 'Selected location on OpenStreetMap'} style={{ height, width: '100%', borderRadius: 12, background: '#e9edf0', isolation: 'isolate' }} />
    {!ready && !error ? <p role="status">Loading OpenStreetMap…</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry map</button></p> : null}
    {interactive && ready ? <button className="wenitro-map-center" type="button" onClick={() => {
      const center = map.current?.getCenter().wrap();
      if (center && Math.abs(center.lat) <= 85.051129) void onPick?.(Number(center.lat.toFixed(7)), Number(center.lng.toFixed(7)));
    }}>Place pin at map center</button> : null}
  </div>;
}
