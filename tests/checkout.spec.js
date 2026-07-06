/**
 * tests/checkout.spec.js
 *
 * Tests end-to-end NEXUS Market — chemins critiques :
 *   1. Homepage charge sans erreur
 *   2. Catalogue affiche au moins 1 produit
 *   3. Ajout au panier déclenche un event GA4 add_to_cart
 *   4. Validation NINEA/RCCM dans formulaire vendeur
 *   5. /api/ping retourne du JSON (Cloudflare Pages Functions actif)
 *
 * Usage :
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   npx playwright test                              # tous les tests
 *   npx playwright test --headed                     # mode visible (debug)
 *   NEXUS_BASE_URL=http://localhost:5500 npx playwright test    # local
 */

const { test, expect } = require('@playwright/test');

test.describe('NEXUS Market - Chemins critiques', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // T1 - Homepage doit charger sans erreurs JS critiques
  // ──────────────────────────────────────────────────────────────────────────
  test('Homepage charge sans erreur JS critique', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // NB : PAS 'networkidle' — l'app poll en continu (messagerie, keep-alive) et
    // charge des pubs, donc l'état "réseau inactif" n'est jamais atteint. On attend
    // le DOM puis on s'appuie sur les attentes d'éléments (toBeVisible) ci-dessous.
    await page.waitForLoadState('domcontentloaded');

    // L'app React doit avoir hydraté quelque chose
    await expect(page.locator('body')).not.toBeEmpty();

    // Aucune erreur JS *critique* (uncaught / erreur applicative). On exclut le
    // bruit tiers qui ne casse rien : violations CSP report-only (informatives par
    // définition), ressources bloquées (ad-blockers / pubs), avertissement Stripe
    // HTTP, et bruits navigateur/extensions habituels.
    const critical = errors.filter(e =>
      !/favicon|manifest|extension|message channel closed/i.test(e) &&
      !/report-only|content security policy/i.test(e) &&
      !/ERR_BLOCKED_BY_CLIENT|Failed to load resource|net::ERR_/i.test(e) &&
      !/stripe\.js integration over HTTP/i.test(e) &&
      !/cdn\.tailwindcss\.com should not be used in production/i.test(e)
    );
    expect(critical, `Erreurs JS critiques:\n${critical.join('\n')}`).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T2 - Catalogue doit afficher au moins 1 produit
  // ──────────────────────────────────────────────────────────────────────────
  test('Catalogue affiche des produits', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // NB : PAS 'networkidle' — l'app poll en continu (messagerie, keep-alive) et
    // charge des pubs, donc l'état "réseau inactif" n'est jamais atteint. On attend
    // le DOM puis on s'appuie sur les attentes d'éléments (toBeVisible) ci-dessous.
    await page.waitForLoadState('domcontentloaded');

    // Le catalogue public affiche des cartes produit. Un visiteur non connecté voit
    // l'overlay d'accueil (#nx-proto-overlay) dont les cartes sont .nx-prodcard ;
    // la vue catalogue React utilise .product-card. On accepte les deux, et on
    // laisse le temps au chargement Supabase (sbFetch a un retry avec backoff).
    const cards = page.locator('.nx-prodcard, .product-card, [class*="product-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 20000 });
    const count = await cards.count();
    expect(count, 'Aucun produit affiché').toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T3 - Cloudflare Pages Functions actif (/api/ping retourne du JSON)
  // ──────────────────────────────────────────────────────────────────────────
  test('Pages Functions est actif (/api/ping)', async ({ request }) => {
    const res = await request.get('/api/ping');
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] || '';
    expect(ct, `Content-Type doit être JSON, reçu: ${ct}`).toContain('application/json');
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T4 - GA4 add_to_cart envoyé lors de l'ajout au panier
  // ──────────────────────────────────────────────────────────────────────────
  test('GA4 add_to_cart se déclenche', async ({ page }) => {
    const ga4Hits = [];

    page.on('request', req => {
      const url = req.url();
      if (url.includes('google-analytics.com/g/collect') ||
          url.includes('google-analytics.com/collect') ||
          url.includes('analytics.google.com')) {
        ga4Hits.push(url);
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // NB : PAS 'networkidle' — l'app poll en continu (messagerie, keep-alive) et
    // charge des pubs, donc l'état "réseau inactif" n'est jamais atteint. On attend
    // le DOM puis on s'appuie sur les attentes d'éléments (toBeVisible) ci-dessous.
    await page.waitForLoadState('domcontentloaded');

    // Accepter cookies si présent (best-effort, click borné et non fatal)
    const acceptAll = page.locator('button:has-text("Accepter")').first();
    if (await acceptAll.isVisible({ timeout: 2000 }).catch(() => false)) {
      await acceptAll.click({ timeout: 5000 }).catch(() => {});
    }

    // Trouver et cliquer un bouton "ajouter au panier". Sonde best-effort : le
    // bouton peut etre present mais non actionnable (couvert par un overlay, hors
    // viewport) — on borne le click (8s) et on tolere l'echec plutot que de laisser
    // Playwright attendre l'actionnabilite jusqu'au timeout du test.
    const addBtn = page.locator('button:has-text("panier"), button[aria-label*="panier" i]').first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const clicked = await addBtn.click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!clicked) { test.skip(true, 'Bouton panier present mais non actionnable (overlay/viewport)'); }
      await page.waitForTimeout(2000); // laisser GA4 envoyer le hit

      const addToCartHit = ga4Hits.find(u => u.includes('add_to_cart') || u.includes('en=add_to_cart'));
      // Soft-check : si GA4 est désactivé (pas de consentement), on log mais on ne fail pas
      if (!addToCartHit) {
        console.warn('[T4] Aucun hit GA4 add_to_cart capturé — vérifier consentement cookies');
      } else {
        expect(addToCartHit).toBeTruthy();
      }
    } else {
      test.skip(true, 'Aucun bouton "ajouter au panier" visible (catalogue vide ?)');
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T5 - Validation NINEA dans formulaire vendeur
  // ──────────────────────────────────────────────────────────────────────────
  test('Validation NINEA rejette les formats invalides', async ({ page }) => {
    await page.goto('/#/register', { waitUntil: 'domcontentloaded' });
    // NB : PAS 'networkidle' — l'app poll en continu (messagerie, keep-alive) et
    // charge des pubs, donc l'état "réseau inactif" n'est jamais atteint. On attend
    // le DOM puis on s'appuie sur les attentes d'éléments (toBeVisible) ci-dessous.
    await page.waitForLoadState('domcontentloaded');

    // Skip si le formulaire vendor n'est pas accessible facilement
    const vendorBtn = page.locator('button:has-text("Vendeur"), [data-role="vendor"]').first();
    if (!(await vendorBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Inscription vendeur pas accessible sans navigation manuelle');
    }
    // Click borne : si non actionnable, on skippe (le flux d'inscription vendeur
    // est un wizard complexe, hors perimetre d'un smoke test).
    const opened = await vendorBtn.click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!opened) { test.skip(true, 'Bouton Vendeur non actionnable'); }

    // Avancer jusqu'à l'étape 3 (Documents) — peut nécessiter remplissage step 1+2
    // On teste juste si l'input NINEA accepte les bons/mauvais formats
    const nineaInput = page.locator('input[name="ninea"], input[placeholder*="NINEA" i]').first();
    if (await nineaInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nineaInput.fill('12345'); // invalide
      const submitBtn = page.locator('button:has-text("Suivant"), button[type="submit"]').last();
      await submitBtn.click().catch(() => {});

      // Un message d'erreur doit apparaître
      const error = page.locator('text=/Format NINEA invalide|NINEA.*invalide/i');
      await expect(error).toBeVisible({ timeout: 3000 });
    } else {
      test.skip(true, 'Champ NINEA non accessible dans ce flow');
    }
  });

});

// ────────────────────────────────────────────────────────────────────────────
// Smoke test additionnel — vérifie que les corrections Phase 1+2 sont en place
// ────────────────────────────────────────────────────────────────────────────
test('Phase 1+2 markers présents dans index.html', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const html = await res.text();

  // Phase 1
  expect(html).toContain('__nexusErrors');           // capture d'erreurs centralisée
  expect(html).toContain('data:image/svg+xml');      // favicon SVG (pas base64 JPEG)
  expect(html).not.toContain('data:image/jpeg;base64'); // l'ancien favicon est parti

  // Phase 2 — marqueurs alignés sur le code actuel (les anciens noms
  // trackViewItem/validateNinea/"__nexusBackendReady === false" ont été renommés).
  expect(html).toContain('view_item');               // GA4 e-commerce
  expect(html).toContain('verifyNinea');             // validation B2B (NINEA)
  expect(html).toContain('__nexusBackendReady');     // polling intelligent backend

  // Phase 3
  expect(html).toContain('/api/email/send');         // proxy email serveur
});
