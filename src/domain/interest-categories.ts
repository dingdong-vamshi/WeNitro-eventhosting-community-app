/** September 8 database taxonomy and complete reference inventory.
 * [QA] Automation is used by scripts/qa-cross-app.mjs and excluded from production pickers.
 * Names are trimmed to match the legacy "Career " entry without generating a duplicate.
 */
export const INTEREST_CATEGORIES = ['Business', 'Career', 'Creative', 'Education', 'Entertainment', 'Fitness', 'Food', 'Jobs', 'Music', 'Networking', 'Outdoors', 'Party', 'Politics', 'Professional', 'Social', 'Social Work', 'Socialize', 'Sports', 'Study', 'Technology', 'Travel'] as const;
