import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const transport = resolve('src/renderer/src/tauri/host-transport.ts')

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  plugins: [react(), tailwindcss()],
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: 'orcaw-window-regions',
          Declaration: {
            '-webkit-app-region': (declaration) => {
              declaration.cloneAfter({ prop: '--orcaw-window-region', value: declaration.value })
            }
          }
        }
      ]
    }
  },
  define: { ORCA_FEATURE_WALL_ENABLED: 'false', ORCA_EMBEDDED_BROWSER_ENABLED: 'false' },
  resolve: {
    alias: [
      { find: /^electron$/, replacement: transport },
      { find: /^@electron-toolkit\/preload$/, replacement: transport },
      { find: '@renderer', replacement: resolve('src/renderer/src') },
      { find: '@', replacement: resolve('src/renderer/src') }
    ]
  },
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: {
    outDir: resolve('out/tauri-renderer'),
    emptyOutDir: true,
    minify: true,
    rollupOptions: { input: resolve('src/renderer/tauri-index.html') }
  },
  worker: { format: 'es' }
})
