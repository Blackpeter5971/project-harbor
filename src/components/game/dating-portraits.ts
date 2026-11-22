import type { SocialContact } from '@/lib/game/relationships';
import mayaChen from '@/assets/dating/maya-chen.jpg';
import marcusBell from '@/assets/dating/marcus-bell.jpg';
import isabelDuarte from '@/assets/dating/isabel-duarte.jpg';
import theoNakamura from '@/assets/dating/theo-nakamura.jpg';
import nadiaOkafor from '@/assets/dating/nadia-okafor.jpg';
import lucaMoretti from '@/assets/dating/luca-moretti.jpg';

export const datingPortraits: Record<string, string> = {
  'maya-chen': mayaChen,
  'marcus-bell': marcusBell,
  'isabel-duarte': isabelDuarte,
  'theo-nakamura': theoNakamura,
  'nadia-okafor': nadiaOkafor,
  'luca-moretti': lucaMoretti,
};

export const datingPortrait = (personId: string) => datingPortraits[personId];
export const contactPortrait = (contact: SocialContact) => {
  const personId = contact.id.startsWith('contact-p-') ? contact.id.slice('contact-p-'.length) : '';
  return datingPortrait(personId) ?? contact.portrait;
};
