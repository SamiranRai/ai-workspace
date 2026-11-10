import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    icons: {
      16: "icon/ai-workspace-black-16.png",
      32: "icon/ai-workspace-black-32.png",
      48: "icon/ai-workspace-black-48.png",
      96: "icon/ai-workspace-black-96.png",
      128: "icon/ai-workspace-black-128.png",
    },
    permissions: ['alarms', 'scripting'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://claude.ai/*',
      'https://grok.com/*',
      'https://gemini.google.com/*',
    ],
  },
});
