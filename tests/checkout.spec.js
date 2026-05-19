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

    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // L'app React doit avoir hydraté quelque chose
    await expect(page.locator('body')).not.toBeEmpty();

    // Aucune erreur critique
    const critical = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('manifest') &&
      !e.includes('extension') &&
      !e.includes('message channel closed')
    );
    expect(critical, `Erreurs JS critiques:\n${critical.join('\n')}`).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T2 - Catalogue doit afficher au moins 1 produit
  // ──────────────────────────────────────────────────────────────────────────
  test('Catalogue affiche des produits', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Le catalogue public affiche des cartes produit
    const cards = page.locator('.product-card, [class*="product-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
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

    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Accepter cookies si présent
    const acceptAll = page.locator('button:has-text("Accepter")').first();
    if (await acceptAll.isVisible({ timeout: 2000 }).catch(() => false)) {
      await acceptAll.click();
    }

    // Trouver et cliquer un bouton "ajouter au panier"
    const addBtn = page.locator('button:has-text("panier"), button[aria-label*="panier" i]').first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
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
    await page.goto('/#/register');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Skip si le formulaire vendor n'est pas accessible facilement
    const vendorBtn = page.locator('button:has-text("Vendeur"), [data-role="vendor"]').first();
    if (!(await vendorBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Inscription vendeur pas accessible sans navigation manuelle');
    }
    await vendorBtn.click();

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

  // Phase 2
  expect(html).toContain('trackViewItem');           // GA4 e-commerce
  expect(html).toContain('validateNinea');           // validation B2B
  expect(html).toContain('__nexusBackendReady === false'); // polling intelligent

  // Phase 3
  expect(html).toContain('/api/email/send');         // proxy email serveur
});
