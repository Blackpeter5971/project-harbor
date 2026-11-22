import { useSyncExternalStore } from 'react';

export type Locale = 'en' | 'es' | 'fr';
export const LOCALES: readonly Locale[] = ['en', 'es', 'fr'];
export const LOCALE_KEY = 'president_game_locale';
export const LOCALE_OPTIONS = [
  { id: 'en', flag: '🇺🇸', label: 'English' },
  { id: 'es', flag: '🇪🇸', label: 'Español' },
  { id: 'fr', flag: '🇫🇷', label: 'Français' },
] as const satisfies readonly { id: Locale; flag: string; label: string }[];

const en = {
  'menu.tagline1': 'Every president has a beginning.',
  'menu.tagline2': 'This is yours.',
  'menu.new': 'New Career',
  'menu.continue': 'Continue',
  'menu.settings': 'Settings',
  'menu.quit': 'Quit',
  'menu.country': 'United States of America',
  'mode.title': 'Choose Your Path',
  'mode.heading': 'How will you play?',
  'mode.subtitle': 'Two ways to rise. Your saves stay separate.',
  'mode.sandbox': 'Sandbox Mode',
  'mode.sandboxTag': 'Open-ended',
  'mode.sandboxDesc': 'The full political life simulator. No script, no limits — every system runs and every career is your own.',
  'mode.sandboxFlag': 'All systems available',
  'mode.story': 'Story Mode',
  'mode.storyTag': 'Scenario',
  'mode.storyDesc': 'Play a scripted scenario with chapters, recurring characters and post-turn story cards. Your choices decide the ending.',
  'mode.storyFlag': '16–20 turn scenarios',
  'new.eyebrow': 'Your story begins',
  'new.step1': 'Character', 'new.step2': 'Roots', 'new.step3': 'Identity',
  'new.who': 'Who will you become?',
  'new.whoSub': 'A new name. A new face. A nation of possibilities.',
  'new.name': 'Character name', 'new.namePh': 'Enter your name',
  'new.state': 'Home state', 'new.sex': 'Sex', 'new.portrait': 'Choose your portrait',
  'new.roots': 'Where do you come from?', 'new.rootsSub': 'Choose the roots of your rise to power.',
  'new.stand': 'What do you stand for?', 'new.standSub': 'Set your political identity and education.',
  'new.identity': 'Political identity', 'new.education': 'Education',
  'new.create': 'Create Character',
  'nav.Home': 'Home', 'nav.Politics': 'Politics', 'nav.Government': 'Government', 'nav.Life': 'Life',
  'nav.Career & Business': 'Career & Business', 'nav.Media': 'Media', 'nav.More': 'More',
  'stat.money': 'Money', 'stat.netWorth': 'Net Worth', 'stat.status': 'Political status',
  'stat.reputation': 'Reputation', 'stat.relationships': 'Relationships', 'stat.actions': 'Actions',
  'turn.next': 'Next turn',
  'turn.actionsLeft': '{n}% energy this turn',
  'more.title': 'Career & settings', 'more.history': 'History', 'more.finance': 'Finance',
  'more.achievements': 'Achievements', 'more.about': 'About', 'more.bugs': 'Report bugs',
  'more.language': 'Change language', 'more.saveCareer': 'Save career', 'more.mainMenu': 'Main menu',
  'more.quitGame': 'Quit game', 'more.saved': 'Career saved on this device', 'more.noSave': 'No saved career',
  'btn.confirm': 'Confirm', 'btn.cancel': 'Cancel', 'btn.save': 'Save', 'btn.quit': 'Quit', 'btn.close': 'Close',
  'btn.back': 'Back', 'btn.continue': 'Continue',
  'lang.set': 'Language set to {label}.',
} as const;

export type MessageKey = keyof typeof en;
type Dict = Record<MessageKey, string>;

const es: Dict = {
  'menu.tagline1': 'Todo presidente tiene un comienzo.',
  'menu.tagline2': 'Este es el tuyo.',
  'menu.new': 'Nueva carrera', 'menu.continue': 'Continuar', 'menu.settings': 'Ajustes', 'menu.quit': 'Salir',
  'menu.country': 'Estados Unidos de América',
  'mode.title': 'Elige tu camino', 'mode.heading': '¿Cómo quieres jugar?',
  'mode.subtitle': 'Dos formas de ascender. Tus partidas se guardan por separado.',
  'mode.sandbox': 'Modo libre', 'mode.sandboxTag': 'Sin final',
  'mode.sandboxDesc': 'El simulador completo de la vida política. Sin guion ni límites: todos los sistemas activos y cada carrera es tuya.',
  'mode.sandboxFlag': 'Todos los sistemas disponibles',
  'mode.story': 'Modo historia', 'mode.storyTag': 'Escenario',
  'mode.storyDesc': 'Juega un escenario con capítulos, personajes recurrentes y cartas de historia tras cada turno. Tus decisiones definen el final.',
  'mode.storyFlag': 'Escenarios de 16–20 turnos',
  'new.eyebrow': 'Tu historia comienza',
  'new.step1': 'Personaje', 'new.step2': 'Orígenes', 'new.step3': 'Identidad',
  'new.who': '¿En quién te convertirás?', 'new.whoSub': 'Un nuevo nombre. Un nuevo rostro. Una nación de posibilidades.',
  'new.name': 'Nombre del personaje', 'new.namePh': 'Escribe tu nombre',
  'new.state': 'Estado natal', 'new.sex': 'Sexo', 'new.portrait': 'Elige tu retrato',
  'new.roots': '¿De dónde vienes?', 'new.rootsSub': 'Elige los orígenes de tu ascenso al poder.',
  'new.stand': '¿Qué defiendes?', 'new.standSub': 'Define tu identidad política y tu educación.',
  'new.identity': 'Identidad política', 'new.education': 'Educación', 'new.create': 'Crear personaje',
  'nav.Home': 'Inicio', 'nav.Politics': 'Política', 'nav.Government': 'Gobierno', 'nav.Life': 'Vida',
  'nav.Career & Business': 'Carrera y negocios', 'nav.Media': 'Medios', 'nav.More': 'Más',
  'stat.money': 'Dinero', 'stat.netWorth': 'Patrimonio', 'stat.status': 'Estatus político',
  'stat.reputation': 'Reputación', 'stat.relationships': 'Relaciones', 'stat.actions': 'Acciones',
  'turn.next': 'Siguiente turno', 'turn.actionsLeft': '{n}% de energía este turno',
  'more.title': 'Carrera y ajustes', 'more.history': 'Historial', 'more.finance': 'Finanzas',
  'more.achievements': 'Logros', 'more.about': 'Acerca de', 'more.bugs': 'Reportar errores',
  'more.language': 'Cambiar idioma', 'more.saveCareer': 'Guardar carrera', 'more.mainMenu': 'Menú principal',
  'more.quitGame': 'Salir del juego', 'more.saved': 'Carrera guardada en este dispositivo', 'more.noSave': 'No hay carrera guardada',
  'btn.confirm': 'Confirmar', 'btn.cancel': 'Cancelar', 'btn.save': 'Guardar', 'btn.quit': 'Salir', 'btn.close': 'Cerrar',
  'btn.back': 'Atrás', 'btn.continue': 'Continuar',
  'lang.set': 'Idioma cambiado a {label}.',
};

const fr: Dict = {
  'menu.tagline1': 'Chaque président a un commencement.',
  'menu.tagline2': 'Voici le vôtre.',
  'menu.new': 'Nouvelle carrière', 'menu.continue': 'Continuer', 'menu.settings': 'Paramètres', 'menu.quit': 'Quitter',
  'menu.country': "États-Unis d'Amérique",
  'mode.title': 'Choisissez votre voie', 'mode.heading': 'Comment voulez-vous jouer ?',
  'mode.subtitle': 'Deux façons de gravir les échelons. Vos sauvegardes restent séparées.',
  'mode.sandbox': 'Mode libre', 'mode.sandboxTag': 'Sans fin',
  'mode.sandboxDesc': 'Le simulateur complet de vie politique. Pas de scénario, pas de limites : tous les systèmes tournent et chaque carrière vous appartient.',
  'mode.sandboxFlag': 'Tous les systèmes disponibles',
  'mode.story': 'Mode histoire', 'mode.storyTag': 'Scénario',
  'mode.storyDesc': "Jouez un scénario avec chapitres, personnages récurrents et cartes d'histoire après chaque tour. Vos choix décident de la fin.",
  'mode.storyFlag': 'Scénarios de 16 à 20 tours',
  'new.eyebrow': 'Votre histoire commence',
  'new.step1': 'Personnage', 'new.step2': 'Origines', 'new.step3': 'Identité',
  'new.who': 'Qui allez-vous devenir ?', 'new.whoSub': 'Un nouveau nom. Un nouveau visage. Une nation de possibilités.',
  'new.name': 'Nom du personnage', 'new.namePh': 'Entrez votre nom',
  'new.state': "État d'origine", 'new.sex': 'Sexe', 'new.portrait': 'Choisissez votre portrait',
  'new.roots': "D'où venez-vous ?", 'new.rootsSub': 'Choisissez les origines de votre ascension.',
  'new.stand': 'Que défendez-vous ?', 'new.standSub': 'Définissez votre identité politique et votre éducation.',
  'new.identity': 'Identité politique', 'new.education': 'Éducation', 'new.create': 'Créer le personnage',
  'nav.Home': 'Accueil', 'nav.Politics': 'Politique', 'nav.Government': 'Gouvernement', 'nav.Life': 'Vie',
  'nav.Career & Business': 'Carrière et affaires', 'nav.Media': 'Médias', 'nav.More': 'Plus',
  'stat.money': 'Argent', 'stat.netWorth': 'Valeur nette', 'stat.status': 'Statut politique',
  'stat.reputation': 'Réputation', 'stat.relationships': 'Relations', 'stat.actions': 'Actions',
  'turn.next': 'Tour suivant', 'turn.actionsLeft': '{n}% d’énergie ce tour',
  'more.title': 'Carrière et paramètres', 'more.history': 'Historique', 'more.finance': 'Finances',
  'more.achievements': 'Succès', 'more.about': 'À propos', 'more.bugs': 'Signaler un bug',
  'more.language': 'Changer de langue', 'more.saveCareer': 'Sauvegarder la carrière', 'more.mainMenu': 'Menu principal',
  'more.quitGame': 'Quitter le jeu', 'more.saved': 'Carrière sauvegardée sur cet appareil', 'more.noSave': 'Aucune carrière sauvegardée',
  'btn.confirm': 'Confirmer', 'btn.cancel': 'Annuler', 'btn.save': 'Enregistrer', 'btn.quit': 'Quitter', 'btn.close': 'Fermer',
  'btn.back': 'Retour', 'btn.continue': 'Continuer',
  'lang.set': 'Langue réglée sur {label}.',
};

export const DICTIONARIES: Record<Locale, Dict> = { en, es, fr };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let s = DICTIONARIES[locale][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Saved locale, or null on first launch / outside the browser. */
export function readLocale(storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage): Locale | null {
  try { const v = storage?.getItem(LOCALE_KEY); return isLocale(v) ? v : null; } catch { return null; }
}

const listeners = new Set<() => void>();
export function setLocale(locale: Locale) {
  try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* storage unavailable */ }
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Stored locale (null if never chosen). Server render and hydration always see null. */
export function useStoredLocale(): Locale | null {
  return useSyncExternalStore(subscribe, () => readLocale(), () => null);
}

export function useT() {
  const locale = useStoredLocale() ?? 'en';
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  return { locale, t };
}
