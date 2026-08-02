/** Config Tailwind v3 reproduisant le tailwind.config qui était inline dans
 *  public/index.html (ancien CDN cdn.tailwindcss.com?plugins=forms,container-queries).
 *
 *  Sert à générer le CSS statique `public/assets/tailwind.<hash>.css` via :
 *      npm run build:css
 *  puis renommer le fichier de sortie avec un nouveau hash de contenu et mettre à
 *  jour le <link> dans public/index.html (cache immutable 1 an sur /assets/*, cf.
 *  mémoire projet « app-bundle-hash-cache-busting »).
 *
 *  ⚠️ NE PAS câbler dans le build Cloudflare (`npm run build` = static) : les
 *  devDependencies (tailwindcss…) sont ignorées en prod (NODE_ENV=production) —
 *  on committe le CSS généré, comme app.<hash>.js.
 *
 *  IMPORTANT : preflight DÉSACTIVÉ — ne pas réinitialiser les styles des autres
 *  pages (dashboards React, pages produit/guide pré-rendues qui ont leur propre CSS). */
module.exports = {
  corePlugins: { preflight: false },
  darkMode: 'class',
  content: [
    './public/index.html',
    './public/assets/app.*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#006d40', 'on-primary': '#ffffff', 'primary-container': '#e8f5ed', 'on-primary-container': '#002110',
        secondary: '#e9c176', 'on-secondary': '#261900', 'secondary-container': '#ffdea5', 'on-secondary-container': '#5d4201',
        tertiary: '#bd0014', 'on-tertiary': '#ffffff',
        'tw-background': '#f9f9fc', 'on-background': '#1a1c1e', 'tw-surface': '#f9f9fc', 'on-surface': '#1a1c1e',
        'surface-variant': '#e2e2e5', 'on-surface-variant': '#3e4a41', 'tw-outline': '#6e7a70', 'outline-variant': '#bdcabe',
        'surface-container-low': '#f3f3f6', 'surface-container': '#eeeef0', 'surface-container-high': '#e8e8ea', 'surface-container-highest': '#e2e2e5',
      },
      fontFamily: { body: ['Plus Jakarta Sans', 'sans-serif'], display: ['Plus Jakarta Sans', 'sans-serif'] },
      borderRadius: { DEFAULT: '0.5rem', lg: '0.5rem', xl: '1rem', full: '9999px' },
      spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px', 'container-margin': '20px' },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};
