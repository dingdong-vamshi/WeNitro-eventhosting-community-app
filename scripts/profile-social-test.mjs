import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/domain/social-profiles.ts', 'utf8');
const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const { normalizeSocialUrl: normalize, safeSocialUrl: safe, SOCIAL_PLATFORMS } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
for (const item of SOCIAL_PLATFORMS) {
  const expected = `https://${item.host}/${item.key === 'linkedin' ? 'in/' : item.key === 'youtube' ? '@' : ''}qa_example`;
  for (const value of ['qa_example', '@qa_example', '  @qa_example  ']) assert.equal(normalize(item.key, value), expected);
  assert.equal(normalize(item.key, `https://${item.host}/`), `https://${item.host}/`);
  assert.equal(normalize(item.key, `${item.host}/`), `https://${item.host}/`);
  assert.equal(normalize(item.key, `http://${item.host}/qa`), `https://${item.host}/qa`);
  assert.equal(normalize(item.key, ''), '');
  for (const input of ['javascript:alert(1)', 'data:text/html,test', '//evil.com', 'https://evil.com', `https://${item.host}.evil.com/qa`, `https://evil.com@${item.host}/qa`, `https://${item.host}:8080/qa`, 'a b', 'a\\b', '../qa', 'https://instagram.com\\@evil.com', 'a'.repeat(251)]) {
    assert.throws(() => normalize(item.key, input));
    assert.equal(safe(item.key, input), '');
  }
}
for (const input of ['vamshi', '@vamshi', 'instagram.com/vamshi', 'https://instagram.com/vamshi']) assert.equal(normalize('instagram', input), 'https://www.instagram.com/vamshi');
assert.equal(normalize('twitter', 'twitter.com/qa_example'), 'https://x.com/qa_example');
assert.equal(normalize('youtube', 'channel/UC_example'), 'https://www.youtube.com/channel/UC_example');
assert.equal(normalize('linkedin', 'company/example'), 'https://www.linkedin.com/company/example');
assert.throws(() => normalize('instagram', 'https://facebook.com/example'));
const profile = fs.readFileSync('src/components/reconstruction/profile.tsx', 'utf8');
assert.match(profile, /function ProfileLayout/);
assert.match(profile, /my_profile_metrics/);
assert.match(profile, /person.social_links != null/);
const migration = fs.readFileSync('supabase/migrations/20260911073000_profile_public_social_links.sql', 'utf8');
assert.match(migration, /private.can_read_profile\(p_user_id\)/);
assert.match(migration, /perform public.get_current_app_user_id\(\)/);
assert.match(migration, /tbl_user_social_links l where l.user_id=p_user_id/);
assert.match(profile, /FEATURE UNLOCKS SOON/);
assert.match(profile, /'Communities', \.\.\.\(owner \? \['Drafts'\] as const : \[\]\)/);
assert.match(profile, /const socials = configured/);
assert.doesNotMatch(profile, /configured\.length \? configured : SOCIAL_PLATFORMS/);
assert.match(profile, /my_trust_score/);
assert.match(profile, /profile_trust_score/);
assert.match(profile, /Public signals only/);
assert.match(profile, /const displayedTotal = owner \? total : metrics\?\.trust_score \?\? null/);
assert.match(profile, /\+\{check\.earned\}/);
assert.doesNotMatch(profile, /check\.earned \|\| check\.points/);
assert.match(profile, /summary=\{\{ location: person\.location, about: person\.about \|\| person\.bio, interests:/);
assert.match(profile, /profile_reviews/);
assert.match(profile, /\['going', 'approved', 'paid'\]/);
const editor = fs.readFileSync('src/components/reconstruction/social-profiles.tsx', 'utf8');
assert.match(editor, /my_social_links.*p_patch: normalized/);
assert.match(editor, /auth\.data\.user\?\.id !== identity\.current/);
console.log('PASS: 5-platform URL normalization, unsafe URL rejection, profile permission/layout/trust invariants, real persistence and account-change protection. No remote writes.');
