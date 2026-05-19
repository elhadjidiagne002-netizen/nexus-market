/**
 * POST /api/ai/extract
 * Proxy d'extraction de données produit via Groq (LLaMA 3.3 70B).
 *
 * Pourquoi un proxy serveur ?
 *   1. Les API AI (Anthropic, Groq, OpenAI) bloquent les appels CORS depuis le navigateur
 *   2. La clé API doit rester secrète côté serveur
 *   3. On peut fetcher l'URL du produit côté serveur (pas de CORS)
 *
 * Body : { url: "https://www.jumia.sn/..." }
 * Réponse : { ok: true, data: { name, category, price_eur, ... } }
 *
 * Variables d'env :
 *   GROQ_API_KEY    = gsk_...
 *   GROQ_MODEL      = llama-3.3-70b-versatile  (ou autre modèle Groq)
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Config ───────────────────────────────────────────────────────────────
  if (!env.GROQ_API_KEY) {
    return json({ error: 'GROQ_API_KEY non configurée' }, 503);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON invalide' }, 400);
  }

  const { url } = body;
  if (!url || !/^https?:\/\//i.test(url.trim())) {
    return json({ error: 'URL invalide — doit commencer par https://' }, 400);
  }

  // ── Étape 1 : Fetcher la page produit côté serveur ────────────────────────
  let pageContent = '';
  try {
    const pageRes = await fetch(url.trim(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });

    if (!pageRes.ok) {
      return json({ error: `Page inaccessible (HTTP ${pageRes.status})` }, 502);
    }

    const rawHtml = await pageRes.text();

    // Nettoyer le HTML : garder seulement le texte utile (titre, prix, description, images)
    // On retire les scripts, styles, SVG, etc. pour économiser les tokens
    pageContent = rawHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')        // retirer les tags HTML restants
      .replace(/\s+/g, ' ')            // normaliser les espaces
      .trim();

    // Limiter la taille pour ne pas dépasser le contexte Groq (~6000 tokens ≈ 24000 chars)
    if (pageContent.length > 20000) {
      pageContent = pageContent.substring(0, 20000) + '\n[... page tronquée]';
    }

    // Si la page est trop courte, c'est probablement un blocage anti-bot
    if (pageContent.length < 100) {
      return json({ error: 'Page trop courte — le site bloque probablement les robots' }, 502);
    }
  } catch (e) {
    return json({ error: 'Erreur de récupération de la page : ' + e.message }, 502);
  }

  // ── Étape 2 : Envoyer le contenu à Groq pour extraction ──────────────────
  const systemPrompt = `Tu es un extracteur de données produit pour NEXUS Market Sénégal. À partir du contenu HTML nettoyé d'une page produit, extrait les informations clés. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks, sans texte avant ni après.

Champs requis :
- name (string, en français)
- category (exactement l'une de : Électronique, Mode & Vêtements, Alimentation, Maison & Déco, Beauté & Santé, Services, Informatique, Sport & Loisirs, Autres)
- price_eur (number, convertir si nécessaire : 1 USD=0.93 EUR, 1 XOF=0.00152 EUR, 1 GBP=1.16 EUR)
- original_price_eur (number|null, si prix barré)
- stock (number|null)
- description (string max 120 caractères en français)
- image_url (string|null, URL complète si trouvée)
- vendor_name (string|null)
- brand (string|null)
- rating (number|null, sur 5)
- reviews_count (number|null)
- tags (array de 3-5 mots-clés)
- confidence (objet avec clés name/price/category/image_url, valeurs 0 à 1)
- extraction_notes (string, remarques sur l'extraction)

Valeur inconnue = null. Pas de markdown.`;

  const model = env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `URL source : ${url.trim()}\n\nContenu de la page :\n${pageContent}` }
        ],
        max_tokens: 1200,
        temperature: 0.1,   // basse température pour une extraction factuelle
        response_format: { type: 'json_object' }  // force JSON output
      })
    });

    if (!groqRes.ok) {
      const errData = await groqRes.text();
      console.error('[AI Extract] Groq error:', groqRes.status, errData);
      return json({ error: 'Erreur Groq API (' + groqRes.status + ')' }, 502);
    }

    const groqData = await groqRes.json();
    const textContent = groqData.choices?.[0]?.message?.content || '';

    // Parser le JSON
    let parsed;
    try {
      parsed = JSON.parse(textContent);
    } catch {
      // Tenter d'extraire un JSON partiel
      const match = textContent.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return json({ error: 'Réponse IA non-JSON', raw: textContent.substring(0, 500) }, 502);
      }
    }

    return json({
      ok: true,
      data: parsed,
      model,
      usage: groqData.usage || null
    });

  } catch (e) {
    return json({ error: 'Groq API injoignable : ' + e.message }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
