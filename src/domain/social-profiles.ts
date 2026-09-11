export const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E7357D', host: 'www.instagram.com', domains: ['instagram.com'], placeholder: 'e.g. instagram_username' },
  { key: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', host: 'www.facebook.com', domains: ['facebook.com', 'fb.com'], placeholder: 'e.g. facebook_username' },
  { key: 'twitter', label: 'Twitter / X', icon: 'logo-twitter', color: '#242936', host: 'x.com', domains: ['x.com', 'twitter.com'], placeholder: 'e.g. twitter_username' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'logo-linkedin', color: '#0A78B5', host: 'www.linkedin.com', domains: ['linkedin.com'], placeholder: 'e.g. linkedin_username' },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube', color: '#F12D39', host: 'www.youtube.com', domains: ['youtube.com'], placeholder: 'e.g. youtube_channel' },
] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number]['key'];
export type SocialLinks = Partial<Record<SocialPlatform, string | null>>;

/** The existing persistence API accepts HTTPS URLs. Upgrade HTTP and normalize handles before saving. */
export function normalizeSocialUrl(platform: SocialPlatform, input: string): string {
  const value = input.trim();
  if (!value) return '';
  const config = SOCIAL_PLATFORMS.find(item => item.key === platform)!;
  const invalid = () => new Error(`Enter a valid ${config.label} username or profile URL.`);
  if (value.length > 250 || /[\s\\\u0000-\u001f\u007f]/.test(value)) throw invalid();
  const domainInput = /^(?:www\.|m\.)?(?:instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com)(?:[/?#]|$)/i.test(value);
  let candidate: string;
  if (/^https?:\/\//i.test(value) || domainInput) candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  else {
    // A handle is never interpreted as a scheme, authority, or arbitrary destination.
    if (/[:?#%]/.test(value) || value.startsWith('//')) throw invalid();
    const handle = value.replace(/^@/, '').replace(/\/$/, '');
    if (!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(handle) || handle.split('/').some(part => part === '.' || part === '..')) throw invalid();
    const path = platform === 'linkedin' && !/^(in|company|school)\//.test(handle) ? `in/${handle}`
      : platform === 'youtube' && !/^(channel|c|user)\//.test(handle) ? `@${handle}` : handle;
    candidate = `https://${config.host}/${path}`;
  }
  let url: URL;
  try { url = new URL(candidate); } catch { throw invalid(); }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  if (!(config.domains as readonly string[]).includes(host) || url.username || url.password || url.port || !['http:', 'https:'].includes(url.protocol)) throw invalid();
  url.protocol = 'https:';
  url.hostname = config.host;
  url.hash = '';
  const result = url.toString();
  if (result.length > 250) throw invalid();
  return result;
}

export function safeSocialUrl(platform: SocialPlatform, input?: string | null) {
  try { return normalizeSocialUrl(platform, input || ''); } catch { return ''; }
}
