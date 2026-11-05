import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['alarms'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://claude.ai/*',
      'https://grok.com/*',
      'https://gemini.google.com/*',
    ],
  },
});
