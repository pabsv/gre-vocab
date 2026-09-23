import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Regenerate icons with: npx pwa-assets-generator
const paper = { background: '#f3eee3' }

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: paper },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: paper },
  },
  images: ['public/icon.svg'],
})
