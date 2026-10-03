import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import http from 'node:http';
import { chromium } from 'playwright';

const source = fs.readFileSync('src/services/live-selfie-camera.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} }; vm.runInNewContext(compiled, module);
const { createLiveSelfieSession, selfieCameraError } = module.exports;
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(overrides = {}) {
  let stopped = 0, drawn = 0, constraints;
  const track = { readyState: 'live', stop() { stopped++; this.readyState = 'ended'; } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = { srcObject: null, readyState: 2, videoWidth: 1920, videoHeight: 1080, pause() {}, play: async () => {} };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage(v) { assert.equal(v, video); drawn++; } }), toDataURL: () => 'data:image/jpeg;base64,camera-frame' };
  const environment = { secure: true, mediaDevices: { getUserMedia: async input => { constraints = input; return stream; } }, createCanvas: () => canvas, ...overrides };
  return { session: createLiveSelfieSession(video, environment), video, stream, track, canvas, get stopped() { return stopped; }, get drawn() { return drawn; }, get constraints() { return constraints; } };
}
const live = fixture(); assert.equal(await live.session.start(), true);
assert.equal(live.constraints.audio, false, 'Selfie never requests microphone');
assert.equal(live.constraints.video.facingMode.ideal, 'user');
const photo = live.session.capture();
assert.equal(photo.mimeType, 'image/jpeg'); assert.equal(photo.width, 1280); assert.equal(photo.height, 720);
assert.equal(live.drawn, 1); assert.equal(live.stopped, 1); assert.equal(live.video.srcObject, null);
assert.throws(() => live.session.capture(), /no longer active/);
live.session.stop(); assert.equal(live.stopped, 1, 'cleanup is safe after capture');
const late = deferred(); const cancelled = fixture({ mediaDevices: { getUserMedia: () => late.promise } });
const opening = cancelled.session.start(); cancelled.session.stop(); late.resolve(cancelled.stream);
assert.equal(await opening, false); assert.equal(cancelled.stopped, 1, 'late permission grant after close/unmount stops every acquired track');
assert.equal(cancelled.video.srcObject, null);
await assert.rejects(fixture({ secure: false }).session.start(), /HTTPS/);
await assert.rejects(fixture({ mediaDevices: undefined }).session.start(), /does not support/);
const denied = fixture({ mediaDevices: { getUserMedia: async () => { throw { name: 'NotAllowedError' }; } } });
await assert.rejects(denied.session.start(), error => /Allow camera access/.test(selfieCameraError(error)));
assert.match(selfieCameraError({ name: 'NotFoundError' }), /camera-equipped/);
assert.match(selfieCameraError({ name: 'NotReadableError' }), /Close other camera apps/);
const unready = fixture(); await unready.session.start(); unready.video.videoWidth = 0;
assert.throws(() => unready.session.capture(), /still starting/); assert.equal(unready.drawn, 0); unready.session.stop();
const playback = fixture(); playback.video.play = async () => { throw Error('Playback blocked'); };
await assert.rejects(playback.session.start(), /Playback blocked/); assert.equal(playback.stopped, 1);

// Execute the actual verification callbacks with deferred private preview/native capture.
const component = fs.readFileSync('src/components/reconstruction/profile-utilities.tsx', 'utf8');
const ast = ts.createSourceFile('profile.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) { if (predicate(node)) return node; return ts.forEachChild(node, child => find(child, predicate)); }
const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ReferenceVerification');
const variable = name => find(screen, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name).initializer.getText(ast);
let changes = [], preview = deferred(), permission = deferred(), pickerCalls = 0;
const state = { alive: { current: true }, cameraRequest: { current: false }, busy: false, Platform: { OS: 'web' }, ImagePicker: { requestCameraPermissionsAsync: () => permission.promise, launchCameraAsync: async () => { pickerCalls++; return { canceled: false, assets: [{ uri: 'private-native-selfie' }] }; }, CameraType: { front: 'front' } }, verificationService: { syncMethods: async () => ({ live_photo_pending: true, email_verified: true }), previewLivePhoto: () => preview.promise }, supabase: { rpc: async () => ({ data: { total: 10 } }), auth: { getUser: async () => ({ data: { user: { email: 'private@example.invalid' } } }) } }, derivedTrustScore: () => 10 };
for (const name of ['setPhoneVerified','setEmailVerified','setEmail','setMethods','setMetrics','setTrustScore','setPhone','setSelfiePreview','setCameraOpen','setIdentityPhoto','setError']) state[name] = value => changes.push([name, value]);
vm.runInNewContext(ts.transpileModule(`openCamera=${variable('openCamera')}; load=${variable('load')};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, Object.assign(state, { openCamera: null, load: null }));
await state.openCamera(); assert.equal(pickerCalls, 0, 'Web never invokes Expo file chooser'); assert.deepEqual(changes.at(-1), ['setCameraOpen', true]);
changes = []; const oldLoad = state.load(); await Promise.resolve(); await Promise.resolve(); state.alive.current = false; preview.resolve('private-old-user-url'); await oldLoad;
assert.equal(changes.length, 0, 'Disposed verification load cannot reveal old private methods/photo');
state.alive.current = true; state.Platform.OS = 'ios'; changes = []; const oldCamera = state.openCamera(); state.alive.current = false; permission.resolve({ granted: true }); await oldCamera;
assert.equal(pickerCalls, 0, 'Disposed native permission request does not open camera');
assert.equal(changes.some(([name]) => name === 'setIdentityPhoto'), false);
state.alive.current = true; permission = deferred(); const deniedNative = state.openCamera(); permission.resolve({ granted: false }); await deniedNative;
assert.match(changes.at(-1)[1], /Allow camera access in device settings/);
permission = deferred(); const validNative = state.openCamera(); permission.resolve({ granted: true }); await validNative;
assert.equal(pickerCalls, 1); assert.equal(changes.at(-2)[0], 'setIdentityPhoto');
state.ImagePicker.launchCameraAsync = async () => { throw Error('Native camera unavailable'); };
permission = deferred(); const failedNative = state.openCamera(); permission.resolve({ granted: true }); await failedNative;
assert.equal(changes.at(-1)[0], 'setError', 'Native camera rejection is visible, not an unhandled promise');
assert.match(fs.readFileSync('App.tsx','utf8'), /<ReferenceVerification key=\{`verification:\$\{data\.userId\}`\}/);
assert.doesNotMatch(fs.readFileSync('src/components/reconstruction/live-selfie-camera.web.tsx','utf8'), /type=["']file|launchImageLibrary|launchCameraAsync/);

// Real browser media/canvas APIs with a synthetic local virtual camera. No network upload or identity approval.
const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><body>Local synthetic camera test</body></html>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(fs.existsSync(systemChrome) ? { executablePath: systemChrome } : {}), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await browser.newPage();
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ content: `var exports={}; ${compiled}; window.cameraFactory=exports.createLiveSelfieSession;` });
  const result = await page.evaluate(async () => {
    const video = document.createElement('video'); video.muted = true; video.playsInline = true; document.body.appendChild(video);
    const camera = window.cameraFactory(video); await camera.start();
    const stream = video.srcObject; const asset = camera.capture();
    return { jpeg: asset.uri.startsWith('data:image/jpeg;base64,'), width: asset.width, height: asset.height, stopped: stream.getTracks().every(track => track.readyState === 'ended'), detached: video.srcObject === null };
  });
  assert.equal(result.jpeg, true); assert.ok(result.width > 0 && result.height > 0); assert.equal(result.stopped, true); assert.equal(result.detached, true);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
console.log('PASS: secure live front-camera only, no microphone/file picker; permission/error/late-grant cleanup; capture and cancel; account disposal; native path; real local Chromium synthetic stream→JPEG→tracks stopped. Physical camera and production upload are not claimed.');
