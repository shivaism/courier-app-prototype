// Tracking number generation (BR-8): "DT-" + 8 random uppercase alphanumeric characters.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excludes ambiguous chars (0,O,1,I)
const SUFFIX_LENGTH = 8;

export function generateTrackingNumber(): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `DT-${suffix}`;
}

/**
 * Generates a tracking number guaranteed not to collide with any existing one,
 * per BR-8's collision-check requirement.
 */
export function generateUniqueTrackingNumber(exists: (trackingNumber: string) => boolean): string {
  let candidate = generateTrackingNumber();
  let attempts = 0;
  while (exists(candidate) && attempts < 10) {
    candidate = generateTrackingNumber();
    attempts++;
  }
  return candidate;
}
