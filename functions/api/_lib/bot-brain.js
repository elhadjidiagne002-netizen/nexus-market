// functions/api/_lib/bot-brain.js
// Cerveau conversationnel PARTAGÉ par les 3 bots entrants (WhatsApp, Telegram,
// Messenger) — un seul endroit à faire évoluer (FAQ, recherche produit, ton).
// Appelle Groq directement (même modèle que /api/ai) plutôt que de refaire un
// fetch HTTP vers /api/ai : on est déjà côté serveur, ça évite un aller-retour
// et un double rate-limit.
import { supabase } from './utils.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const MAX_REPLY_CHARS = 1500; // WhatsApp/Messenger tolèrent large, Telegram aussi — borne raisonnable

const SYSTEM_PROMPT = `Tu es l'assistant NEXUS Market, une marketplace en ligne au Sénégal (nexusmarket.sn).
Tu réponds aux messages reçus sur WhatsApp, Telegram ou Messenger, en français, de façon brève (3-5 phrases max), chaleureuse et utile.
NEXUS Market vend/loue : électronique, informatique, téléphones, mode, alimentation, maison, beauté, sport, services (dépannage, artisans), auto/moto, animaux/élevage.
On y trouve aussi : transport (lignes de bus/car), location d'objets, immobilier, un programme de fidélité, et un système de stories vidéo pour les vendeurs.
Si on te demande un produit précis, invite à consulter ${'{{ORIGIN}}'} ou une catégorie du site plutôt que d'inventer un prix ou un stock que tu ne connais pas.
Si on te demande le statut d'une commande, explique qu'il faut se connecter sur le site (section "Mes commandes") ou contacter le vendeur — tu n'as pas accès aux commandes en direct.
Ne donne jamais d'information inventée sur un prix, un stock ou un délai de livraison précis. Reste concis : ce sont des messages de chat, pas des emails.`;

// Recherche produit best-effort : si le message ressemble à une recherche
// ("cherche X", "vous avez X", ou juste un nom court), on tente un ILIKE sur
// products.name pour injecter 1-3 résultats réels dans le contexte du modèle
// (évite qu'il invente un prix). Best-effort : silencieux en cas d'échec.
async function searchProducts(env, text) {
  const q = (text || '').trim();
  if (q.length < 3 || q.length > 60) return [];
  try {
    const sb = supabase(env);
    const term = encodeURIComponent(`%${q.replace(/[%,]/g, ' ').trim()}%`);
    const rows = await sb.from('products').select(
      'id,name,price,category',
      `name=ilike.${term}&status=eq.active&limit=3`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

/**
 * Génère une réponse texte pour un message entrant, quel que soit le canal.
 * @param {object} env
 * @param {{ text: string, origin: string }} opts
 * @returns {Promise<string>} réponse à renvoyer à l'utilisateur (jamais vide)
 */
export async function generateBotReply(env, { text, origin }) {
  const userText = (text || '').trim().slice(0, 2000);
  if (!userText) return 'Je n\'ai pas reçu de message lisible — pouvez-vous réessayer ?';

  if (!env.GROQ_API_KEY) {
    return `Merci pour votre message ! Notre assistant automatique est momentanément indisponible. ` +
      `Consultez ${origin} ou contactez directement le vendeur concerné sur le site.`;
  }

  const products = await searchProducts(env, userText);
  let productContext = '';
  if (products.length) {
    const eurToFcfa = (eur) => Math.round(Number(eur) * 655.957).toLocaleString('fr-FR');
    productContext = '\n\nRésultats réels trouvés sur le site pour cette recherche :\n' +
      products.map(p => `- ${p.name} (${eurToFcfa(p.price)} FCFA) : ${origin}/produit/${p.id}`).join('\n');
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT.replace('{{ORIGIN}}', origin) + productContext },
    { role: 'user', content: userText },
  ];

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.5, max_tokens: 400, stream: false }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const data = await r.json().catch(() => null);
    const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!r.ok || !reply) {
      console.error('[bot-brain] Groq KO:', r.status, data && data.error);
      return `Merci pour votre message ! Un problème technique empêche une réponse détaillée pour le moment — ` +
        `consultez ${origin} en attendant.`;
    }
    return reply.trim().slice(0, MAX_REPLY_CHARS);
  } catch (e) {
    console.error('[bot-brain]', e && e.message);
    return `Merci pour votre message ! Réponse automatique momentanément indisponible — consultez ${origin}.`;
  }
}
