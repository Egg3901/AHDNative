import type { ProfileUpdate } from './profileTypes';

export const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_BIO_LENGTH = 500;
export const MAX_CAMPAIGN_SONG_LENGTH = 300;

/** Matches AHDGame's accepted YouTube URL shapes and canonical 11-character id. */
export function campaignSongId(value: string): string | null {
  const input = value.trim();
  if (!input) return '';
  if (input.length > MAX_CAMPAIGN_SONG_LENGTH) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  for (const pattern of [/[?&]v=([A-Za-z0-9_-]{11})/, /youtu\.be\/([A-Za-z0-9_-]{11})/, /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/]) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** Offline portraits are embedded raster images; never fetch a URL from a save. */
export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_PROFILE_IMAGE_BYTES / 3) * 4 + 32) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return null;
  try {
    const bytes = atob(match[2]);
    if (bytes.length > MAX_PROFILE_IMAGE_BYTES) return null;
    const png = bytes.startsWith('\x89PNG\r\n\x1a\n');
    const jpeg = bytes.startsWith('\xff\xd8\xff');
    const webp = bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    return ((match[1] === 'png' && png) || (match[1] === 'jpeg' && jpeg) || (match[1] === 'webp' && webp)) ? value : null;
  } catch { return null; }
}

export function validateProfileUpdate(value: ProfileUpdate): ProfileUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a profile change to save.');
  const keys = Object.keys(value);
  if (!keys.length || keys.some(key => !['bio', 'avatarUrl', 'campaignSongUrl', 'campaignSongAutoplay'].includes(key))) throw new Error('Unknown profile change.');
  const update: ProfileUpdate = {};
  if (Object.hasOwn(value, 'bio')) {
    if (typeof value.bio !== 'string' || value.bio.length > MAX_BIO_LENGTH) throw new Error('Bio must be 500 characters or fewer.');
    update.bio = value.bio.trim();
  }
  if (Object.hasOwn(value, 'avatarUrl')) {
    if (value.avatarUrl !== null && !safeAvatarUrl(value.avatarUrl)) throw new Error('Choose a PNG, JPEG or WebP profile picture up to 2 MB.');
    update.avatarUrl = value.avatarUrl;
  }
  if (Object.hasOwn(value, 'campaignSongUrl')) {
    if (typeof value.campaignSongUrl !== 'string') throw new Error('Enter a valid YouTube URL or 11-character video ID.');
    const videoId = campaignSongId(value.campaignSongUrl);
    if (videoId === null) throw new Error('Enter a valid YouTube URL or 11-character video ID.');
    update.campaignSongUrl = videoId;
  }
  if (Object.hasOwn(value, 'campaignSongAutoplay')) {
    if (typeof value.campaignSongAutoplay !== 'boolean') throw new Error('Choose whether the campaign song plays automatically.');
    update.campaignSongAutoplay = value.campaignSongAutoplay;
  }
  return update;
}
