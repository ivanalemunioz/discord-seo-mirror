const lang = (process.env.SITE_LANG || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';

const dict = {
  en: {
    home: 'Home',
    channels: 'Channels',
    search: 'Search',
    latest: 'Latest',
    discordCommunity: 'Discord community',
    oldMessages: 'Older messages',
    newestMessages: 'Newest messages',
    alreadyNewest: 'Already newest message',
    oldestPage: 'Oldest page',
    startHistory: 'Start of channel history',
    noMessagesYet: 'No messages synced yet for this channel.',
    thisPageMissing: 'This page does not exist yet.',
    threadNotFound: 'Thread not found.',
    openEmbedSource: 'Open embed source',
    messagesWord: 'messages'
  },
  es: {
    home: 'Inicio',
    channels: 'Canales',
    search: 'Buscar',
    latest: 'Últimos',
    discordCommunity: 'Comunidad de Discord',
    oldMessages: 'Mensajes anteriores',
    newestMessages: 'Mensajes más nuevos',
    alreadyNewest: 'Ya estás en el mensaje más nuevo',
    oldestPage: 'Página más antigua',
    startHistory: 'Inicio del historial del canal',
    noMessagesYet: 'Todavía no hay mensajes sincronizados para este canal.',
    thisPageMissing: 'Esta página todavía no existe.',
    threadNotFound: 'Hilo no encontrado.',
    openEmbedSource: 'Abrir fuente del embed',
    messagesWord: 'mensajes'
  }
} as const;

export function t(key: keyof typeof dict.en) {
  return dict[lang][key];
}

export function currentLang() {
  return lang;
}
