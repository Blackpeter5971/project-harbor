import { portraitImages } from './portrait';

// One unique portrait per political figure, keyed by figure id.
const FILES = import.meta.glob('@/assets/figures/*.jpg', { eager: true, import: 'default' }) as Record<string, string>;
const BY_ID: Record<string, string> = {};
for (const [path, url] of Object.entries(FILES)) {
  const id = path.split('/').pop()!.replace('.jpg', '');
  BY_ID[id] = url;
}

export const figurePortraitById = (id: string, fallback = 0) =>
  BY_ID[id] ?? portraitImages[fallback % portraitImages.length]!;

/** @deprecated use figurePortraitById */
export const figurePortrait = (i: number) => portraitImages[i % portraitImages.length]!;
