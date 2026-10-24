import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Two pages: the sticker book (index.html) and the cottage room (room.html).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        room: fileURLToPath(new URL('./room.html', import.meta.url))
      }
    }
  }
});
