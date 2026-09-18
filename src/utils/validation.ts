/**
 * Input validation utilities for WeNitro
 */

// Basic email RFC regex matching user@domain.tld with at least 2 char TLD
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

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
    return { valid: false };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
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
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false };
  }

  // Check 1: Cannot contain an email address or @ symbol
  if (trimmed.includes('@') || EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Full name cannot be an email address' };
  }

  // Check 2: Length requirements
  if (trimmed.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }
  if (trimmed.length > 60) {
    return { valid: false, error: 'Name cannot exceed 60 characters' };
  }

  // Check 3: Allowed characters (letters from any language, spaces, hyphens, periods, apostrophes)
  // Must contain at least one letter and cannot contain numbers or weird symbols/URLs
  const validCharsRegex = /^[\p{L}\s'.-]+$/u;
  if (!validCharsRegex.test(trimmed)) {
    return {
      valid: false,
      error: 'Please enter a proper name using letters only (no numbers or special characters)',
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
