import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rolldownOptions: {
      input: [
        'index.html',
        'guides/index.html',
        'guides/import-ps2-saves/index.html',
        'guides/ps2-save-formats/index.html',
        'guides/copy-ps2-saves/index.html',
      ],
    },
  },
});
