/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // The v2 "warm-paper" palette - see the autoai-component-patterns
      // skill for the full rationale. Every value here is the one the
      // skill documents; nothing is invented at this layer. The old v1
      // dark-console `brand` scale is gone - nothing references it once
      // PrimaryButton/FormField/RoleCard and the pre-ready screens moved
      // to these tokens.
      colors: {
        canvas: '#e9e7e2',
        surface: '#f6f5f2',
        rail: '#f0eeea',
        raised: '#ffffff',
        hairline: '#e4e1da',
        edge: '#ddd9d1',
        ink: '#1a1815',
        quiet: '#57534c',
        muted: '#77736b',
        faint: '#9b968c',
        accent: '#f2a93b',
        'accent-deep': '#8a5a07',
        // The design's own `a:hover` colour - a darkened accent-deep for
        // text links, distinct from the token itself.
        'accent-deep-hover': '#6b4505',
        // Text/glyph colour for something filled with `accent` (the brand
        // badge) - amber can't carry white at the contrast a mark needs,
        // so this is the near-black ink colour, not a fifth grey.
        'accent-ink': '#1a1815',
        'accent-soft': '#fdf1dc',
        danger: '#c0392f',
        'danger-soft': '#fbeae8',
        ok: '#2e7d4f',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Named sizes rather than raw px in components, so the ramp can move
      // as one thing. Anchored at the two values the design actually
      // specifies (tag/hero); everything between is a level eyeball fit -
      // worth checking against the canvas once the app renders for real.
      fontSize: {
        nano: '9px',
        micro: '11px',
        tag: '11px',
        caption: '12px',
        meta: '12px',
        label: '13px',
        ui: '13px',
        body: '14px',
        card: '15px',
        lead: '15px',
        section: '17px',
        screen: '18px',
        display: '21px',
        brand: '22px',
        hero: '25px',
      },
      // Heights given directly by the design.
      height: {
        pill: '28px',
        chip: '32px',
        row: '34px',
        control: '36px',
        field: '40px',
        cta: '46px',
        topbar: '60px',
      },
      // Not documented anywhere in the design canvases - sized to fit the
      // rail's own content (three engine cards vs. icon+label+count nav
      // rows) rather than lifted from a spec. Worth a visual check once
      // the app renders, not a blocker.
      width: {
        rail: '360px',
        nav: '232px',
      },
      // The mockup's own outer window-chrome radius (the traffic-light
      // title bar frame), used for the one dialog in the app that reads
      // as its own floating window rather than a card.
      borderRadius: {
        window: '12px',
      },
      // A small, deliberate set of motion primitives - not a generic
      // animation library. `stage-in` is the auth-flow transition (Welcome
      // -> Register/Login -> ready); `dock-in`/`message-in` are the
      // assistant dock's own mount and per-message entrance.
      keyframes: {
        'stage-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'dock-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'message-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'stage-in': 'stage-in 220ms ease-out',
        'dock-in': 'dock-in 260ms ease-out',
        'message-in': 'message-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};
