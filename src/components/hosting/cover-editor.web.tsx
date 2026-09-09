import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MOBILE_APP_MAX_WIDTH, MobileOverlayFrame } from '../mobile-app-shell';
import { usePalette } from '../reconstruction/ui';
export default function CoverEditor({ uri, onCancel, onSave, square = false }: { uri: string; square?: boolean; onCancel: () => void; onSave: (uri: string) => void }) {
  const { width } = useWindowDimensions(); const canvas = useRef<HTMLCanvasElement>(null);
  const c = usePalette();
  const source = useRef<HTMLImageElement | null>(null); const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1); const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const size = Math.min(width - 24, MOBILE_APP_MAX_WIDTH - 24), outputHeight = square ? 1080 : 600, height = size * outputHeight / 1080;
  useEffect(() => { const img = new window.Image(); img.onload = () => { source.current = img; setReady(true); }; img.onerror = () => setError('This photo could not be opened. Choose a PNG or JPG.'); img.src = uri; return () => { img.onload = null; img.onerror = null; }; }, [uri]);
  useEffect(() => {
    const img = source.current, ctx = canvas.current?.getContext('2d'); if (!ready || !img || !ctx) return;
    const swapped = rotation % 180 !== 0; const iw = swapped ? img.height : img.width, ih = swapped ? img.width : img.height;
    const scale = Math.max(1080 / iw, outputHeight / ih) * zoom;
    const x = Math.max(-(iw * scale - 1080) / 2, Math.min((iw * scale - 1080) / 2, offset.x * 1080 / size));
    const y = Math.max(-(ih * scale - outputHeight) / 2, Math.min((ih * scale - outputHeight) / 2, offset.y * 1080 / size));
    ctx.clearRect(0, 0, 1080, outputHeight); ctx.save(); ctx.translate(540 + x, outputHeight / 2 + y); ctx.rotate(rotation * Math.PI / 180); ctx.scale(scale, scale); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
  }, [ready, zoom, rotation, offset, size, outputHeight]);
  return <Modal transparent visible animationType="slide" onRequestClose={onCancel}><MobileOverlayFrame><View style={[s.root, { backgroundColor: c.bg }]}>
    <View style={[s.bar, { backgroundColor: c.sheet, borderBottomColor: c.border }]}><Pressable accessibilityRole="button" accessibilityLabel="Cancel crop" onPress={onCancel} style={s.action}><Text style={{ color: c.text }}>✕</Text></Pressable><Text style={{ flex: 1, fontWeight: '600', color: c.text }}>Edit Photo</Text><Pressable accessibilityRole="button" accessibilityLabel="Confirm crop" disabled={!ready} onPress={() => { try { onSave(canvas.current!.toDataURL('image/jpeg', .88)); } catch { setError('Could not crop this image. Try a smaller photo.'); } }} style={s.action}><Text style={{ color: c.text }}>✓</Text></Pressable></View>
    <View style={s.preview}>{!ready && !error ? <ActivityIndicator /> : null}
      {React.createElement('canvas', { ref: canvas, width: 1080, height: outputHeight, 'aria-label': 'Photo crop preview; drag to reposition', style: { width: size, height, border: `1px solid ${c.border}`, touchAction: 'none', cursor: 'move' },
        onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; },
        onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => { if (drag.current) setOffset({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }); },
        onPointerUp: () => { drag.current = null; }, onPointerCancel: () => { drag.current = null; },
      })}<Text style={[s.hint, { color: c.muted }]}>Drag to position your photo</Text>{error ? <Text style={{ color: c.danger }}>{error}</Text> : null}</View>
    <View style={[s.controls, { backgroundColor: c.sheet, borderTopColor: c.border }]}><Text style={[s.hint, { color: c.muted }]}>Scale · {Math.round(zoom * 100)}%</Text>{React.createElement('input', { type: 'range', 'aria-label': 'Crop zoom', min: 1, max: 3, step: .01, value: zoom, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setZoom(Number(e.target.value)), style: { width: '90%', accentColor: c.accent } })}
      <Pressable accessibilityRole="button" onPress={() => { setRotation(v => (v + 90) % 360); setOffset({ x: 0, y: 0 }); }} style={s.action}><Text style={[s.hint, { color: c.text }]}>↻ Rotate</Text></Pressable></View>
  </View></MobileOverlayFrame></Modal>;
}
const s = StyleSheet.create({ root: { flex: 1 }, bar: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: 1 }, action: { padding: 18 }, preview: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }, hint: { textAlign: 'center', fontSize: 13 }, controls: { alignItems: 'center', gap: 15, padding: 16, paddingBottom: 24, borderTopWidth: 1 } });
