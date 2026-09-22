/**
 * Input validation utilities for WeNitro
 */

const EMAIL_LOCAL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

// Client-specified prohibited terms and inappropriate words/profanities for Full Name
const DISALLOWED_NAME_WORDS = new Set([
  // Explicit client examples
  'playboy',
  'sex addict',
  'sex',
  'gamer',
  'addict',
  // Adult / sexual content
  'porn',
  'porno',
  'xxx',
  'nude',
  'escort',
  'hooker',
  'hookup',
  'whore',
  'slut',
  'penis',
  'vagina',
  'dick',
  'cock',
  'pussy',
  'boobs',
  'tits',
  'anal',
  'sexy',
  'stripper',
  // Common profanities / vulgarities
  'fuck',
  'fucker',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'motherfucker',
  // Hate speech / slurs
  'nigger',
  'nigga',
  'fag',
  'faggot',
  'hitler',
  'nazi',
  'terrorist',
]);

/**
 * Validates whether the given string is a properly formatted email.
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, error: 'Email address is required' };
  }
  if (trimmed.length > 254 || /\s/.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address (e.g. name@example.com)' };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { valid: false, error: 'Please enter a valid email address (e.g. name@example.com)' };
  }
  const [local, domain] = parts;
  if (
    !local ||
    local.length > 64 ||
    !EMAIL_LOCAL_REGEX.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  ) {
    return { valid: false, error: 'Please enter a valid email address (e.g. name@example.com)' };
  }

  const labels = domain.split('.');
  const topLevelDomain = labels.at(-1) ?? '';
  if (
    domain.length > 253 ||
    labels.length < 2 ||
    labels.some(label => !EMAIL_DOMAIN_LABEL_REGEX.test(label)) ||
    !/^[a-zA-Z]{2,63}$/.test(topLevelDomain)
  ) {
    return { valid: false, error: 'Please enter a valid email address (e.g. name@example.com)' };
  }
  return { valid: true };
}

/**
 * Validates whether the given string is a proper human name:
 * - Must be at least 2 characters and no more than 60 characters
 * - Must NOT be or contain an email address (no @ or domain patterns)
 * - Must contain only letters, spaces, hyphens, periods, and apostrophes
 * - Must NOT contain profanity or disallowed terms (Playboy, Sex Addict, Gamer, etc.)
 */
export function validateFullName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { valid: false, error: 'Full name is required' };
  }

  // Check 1: Cannot contain an email address or @ symbol
  if (trimmed.includes('@') || /(?:https?:\/\/|www\.)/i.test(trimmed)) {
    return { valid: false, error: 'Full name cannot be an email address' };
  }

  // Check 2: Length requirements
  if (trimmed.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }
  if (trimmed.length > 60) {
    return { valid: false, error: 'Name cannot exceed 60 characters' };
  }

  // Check 3: Human-name shape. Punctuation is allowed only inside a name token,
  // so values such as "--", "..", "-Name" and "Name__" never look valid.
  const letterSequence = '(?:\\p{L}\\p{M}*)+';
  const nameToken = `${letterSequence}(?:['.-]${letterSequence})*\\.?`;
  const validNameShape = new RegExp(`^${nameToken}(?:\\s+${nameToken})*$`, 'u');
  const letterCount = trimmed.match(/\p{L}/gu)?.length ?? 0;
  if (letterCount < 2 || !validNameShape.test(trimmed)) {
    return {
      valid: false,
      error: 'Please enter your real name using letters, spaces, hyphens, periods, or apostrophes',
    };
  }

  // Check 4: Profanity and disallowed terms
  // Normalize text: lowercase and replace multiple spaces/symbols
  const normalized = trimmed
    .toLowerCase()
    .replace(/[._\-+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Check full string or sub-phrases (e.g. "sex addict")
  for (const disallowed of DISALLOWED_NAME_WORDS) {
    if (disallowed.includes(' ')) {
      if (normalized.includes(disallowed)) {
        return {
          valid: false,
          error: `The term "${disallowed}" is not allowed in names. Please enter your real name.`,
        };
      }
    }
  }

  // Check individual words
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (DISALLOWED_NAME_WORDS.has(word)) {
      return {
        valid: false,
        error: `The term "${word}" is not allowed in names. Please enter your real name.`,
      };
    }
  }

  return { valid: true };
}
