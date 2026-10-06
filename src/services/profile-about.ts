export type AboutProfilePhoto = {
  uri: string;
  position: number;
};

/**
 * Pick one stable About-card photo. Prefer an additional gallery photo so the
 * card does not simply repeat the primary avatar, then fall back to primary.
 */
export function selectAboutProfilePhoto(photos: AboutProfilePhoto[]) {
  const available = photos
    .filter((photo) => typeof photo.uri === 'string' && photo.uri.trim().length > 0)
    .sort((left, right) => left.position - right.position);

  return available.find((photo) => photo.position > 1)?.uri ?? available[0]?.uri ?? null;
}
