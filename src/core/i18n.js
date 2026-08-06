/**
 * Trosmos OS 4.0 — Internationalization Foundation
 * Strings are centralized for future multi-language support.
 */

const STRINGS = {
  en: {
    'app.files': 'Files',
    'app.settings': 'Settings',
    'app.terminal': 'Terminal',
    'app.calculator': 'Calculator',
    'app.notes': 'Notes',
    'app.clock': 'Clock',
    'app.clipboard': 'Clipboard',
    'app.browser': 'Browser',
    'app.ai': 'Trosmos AI',
    'app.tasks': 'Task Manager',
    'app.store': 'App Store',
    'app.help': 'Help',
    'app.monitor': 'System Monitor',
    'cmd.palette': 'Command palette',
    'cmd.search_placeholder': 'Search apps, files, settings, commands…',
    'notif.offline': 'You are offline — local apps still work',
    'notif.online': 'Back online',
    'session.lock': 'Session locked',
    'session.unlock': 'Unlock',
    'trash.empty': 'Trash is empty',
    'trash.restore': 'Restore',
    'trash.delete_forever': 'Delete permanently',
    'perm.required': 'Permission required',
    'perm.allow_once': 'Allow once',
    'perm.allow_session': 'Allow this session',
    'perm.deny': 'Deny',
    'ws.main': 'Main',
    'ws.work': 'Work',
    'ws.dev': 'Development',
    'ws.personal': 'Personal',
    'error.generic': 'Something went wrong',
    'error.app_failed': 'Application failed to open',
    'empty.files': 'This folder is empty',
    'empty.search': 'No results',
    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.delete': 'Delete',
    'action.rename': 'Rename',
    'action.copy': 'Copy',
    'action.paste': 'Paste',
    'action.undo': 'Undo',
    'action.redo': 'Redo'
  },
  hi: {
    'app.files': 'फ़ाइलें',
    'app.settings': 'सेटिंग्स',
    'app.terminal': 'टर्मिनल',
    'app.calculator': 'कैलकुलेटर',
    'app.notes': 'नोट्स',
    'app.clock': 'घड़ी',
    'app.clipboard': 'क्लिपबोर्ड',
    'app.browser': 'ब्राउज़र',
    'app.ai': 'Trosmos AI',
    'app.tasks': 'टास्क मैनेजर',
    'app.store': 'ऐप स्टोर',
    'app.help': 'सहायता',
    'cmd.palette': 'कमांड पैलेट',
    'cmd.search_placeholder': 'ऐप, फ़ाइल, सेटिंग, कमांड खोजें…',
    'session.lock': 'सत्र लॉक',
    'session.unlock': 'अनलॉक',
    'perm.required': 'अनुमति आवश्यक',
    'perm.deny': 'अस्वीकार',
    'action.save': 'सहेजें',
    'action.cancel': 'रद्द करें',
    'action.delete': 'हटाएँ',
    'empty.files': 'यह फ़ोल्डर खाली है',
    'empty.search': 'कोई परिणाम नहीं'
  }
};

export class I18n {
  constructor() {
    this.locale = 'en';
    this._fallback = 'en';
  }

  setLocale(locale) {
    if (STRINGS[locale]) this.locale = locale;
  }

  t(key, vars = {}) {
    const table = STRINGS[this.locale] || STRINGS[this._fallback];
    let str = table[key] ?? STRINGS[this._fallback][key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return str;
  }

  availableLocales() {
    return Object.keys(STRINGS);
  }
}

export const i18n = new I18n();
export default i18n;

if (typeof window !== 'undefined') {
  window.__TrosmosI18n = i18n;
}
