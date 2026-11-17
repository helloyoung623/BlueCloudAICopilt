import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Fresh cache dir; Vite writes here directly without bulk-deleting an old deps folder.
  cacheDir: 'node_modules/.vite-local-preview',
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Allow the cloud preview reverse-proxy host to reach the dev server.
  // Cloud sandbox injects PORT (e.g. 3000) and requires 0.0.0.0 binding;
  // local dev (no PORT) keeps the original 127.0.0.1:5173 behavior.
  server: {
    host: process.env.PORT ? '0.0.0.0' : '127.0.0.1',
    port: Number(process.env.PORT) || 5173,
    allowedHosts: true,
  },
  preview: {
    host: process.env.PORT ? '0.0.0.0' : '127.0.0.1',
    port: Number(process.env.PORT) || 4173,
    allowedHosts: true,
  },
})
