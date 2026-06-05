/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        'phos-green': '#00ff41',
        'phos-green-dim': '#00aa2b',
        'phos-amber': '#ffb000',
        'phos-amber-dim': '#aa7500',
        'panel-bg': '#0f1a0f',
        'panel-border': '#1a3a1a',
        'screen-bg': '#0a0a0a',
        'good': '#00ff41',
        'fair': '#ffb000',
        'poor': '#ff2200',
      },
      fontFamily: {
        mono: ['"Share Tech Mono"', '"Courier New"', 'monospace'],
        display: ['"Share Tech Mono"', 'monospace'],
      },
      boxShadow: {
        'green-glow': '0 0 8px rgba(0,255,65,0.3), 0 0 20px rgba(0,255,65,0.1)',
        'green-glow-sm': '0 0 4px rgba(0,255,65,0.4)',
        'amber-glow': '0 0 8px rgba(255,176,0,0.3)',
      }
    }
  },
  plugins: []
}
