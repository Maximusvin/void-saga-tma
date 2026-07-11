import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-meshopt',
              test: /node_modules[\\/]three[\\/]examples[\\/]jsm[\\/]libs[\\/]meshopt/,
              priority: 30,
            },
            {
              name: 'three-addons',
              test: /node_modules[\\/]three[\\/]examples[\\/]jsm/,
              priority: 20,
              maxSize: 400_000,
            },
            {
              name: 'three-core',
              test: /node_modules[\\/]three[\\/]build/,
              priority: 10,
              maxSize: 400_000,
            },
          ],
        },
      },
    },
  },
})
