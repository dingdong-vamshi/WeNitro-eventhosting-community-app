import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(path, 'utf8');
const app = source('App.tsx');
const participants = app.slice(app.indexOf('if (participantsOpen)'), app.indexOf('if (participantsOpen)') + 5500);
assert.match(participants, /HOST · ORIGINAL CREATOR/);
assert.match(participants, /participant\.userId !== activity\.ownerId/);
assert.match(participants, /Remove Co-Host/);
assert.match(participants, /canHost&&!activityEnded&&approved&&!cohost/);
assert.match(participants, /Remove Participant/);
for (const path of ['src/components/reconstruction/profile.tsx', 'src/components/reconstruction/edit-profile.tsx', 'src/components/reconstruction/messages.tsx', 'src/components/community/reference-community.tsx']) {
  assert.match(source(path), /useResponsibleUpload/);
  assert.match(source(path), /await confirmUpload\(\)/);
  assert.match(source(path), /\{uploadNotice\}/);
}
assert.match(source('src/components/reconstruction/responsible-upload.tsx'), /label="Continue"/);
assert.match(app, /onSaved=\{\(\) => go\('profile'\)\}/);
assert.match(source('src/components/reconstruction/edit-profile.tsx'), /setSuccess\(true\);\s*onSaved\(\);/);
assert.match(source('src/components/reconstruction/settings.tsx'), /Redemption requires at least 200 Nitro Points/);
assert.match(source('src/components/reconstruction/settings.tsx'), /conversation\.map/);
assert.match(source('src/services/activities-production.ts'), /order\("is_admin_pinned", \{ ascending: false \}\)/);
console.log('PASS: Host identity/removal, upload-warning entry points, NitroBot turns, 200-point threshold and server-side pin ordering. Source contracts only; live UI verified separately.');
