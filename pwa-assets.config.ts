import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Regenerate icons with: npx pwa-assets-generator
const blue = { background: '#1f5fb0' }

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: blue },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: blue },
  },
  images: ['public/icon.svg'],
})
