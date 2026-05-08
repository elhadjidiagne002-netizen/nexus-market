import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    // Authentification
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);
    const url = new URL(request.url);

    // GET: Récupérer les notifications de l'utilisateur
    if (request.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const { data, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return json(data || []);
    }

    // POST: Créer une nouvelle notification
    if (request.method === 'POST') {
      const body = await request.json();
      const notification = {
        user_id: body.userId || body.user_id,
        type: body.type || 'info',
        title: body.title || '',
        message: body.message || '',
        read: false,
      };

      const { data: saved, error } = await sb
        .from('notifications')
        .insert(notification)
        .select()
        .single();

      if (error) throw error;
      return json(saved, 201);
    }

    // Méthode non autorisée
    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}
</canvaentity
>

---

### **Améliorations apportées :**
1. **Correction du bug** :
   - Remplacement de `.filter('user_id', 'eq', user.id)` par `.eq('user_id', user.id)` (syntaxe recommandée par Supabase).
   - Suppression des backticks mal échappés dans les chaînes de caractères.

2. **Lisibilité** :
   - Utilisation de **destructuring** pour les réponses Supabase (`{ data, error }`).
   - Variables renommées pour plus de clarté (`url` au lieu de `u`, `authError` au lieu de `e`).

3. **Gestion des erreurs** :
   - Vérification explicite des erreurs Supabase avec `if (error) throw error`.

4. **Consistance** :
   - Utilisation de `.eq()` et `.order()` au lieu de `.filter()` pour une meilleure compatibilité avec Supabase.

---
### **Prochaines étapes**
1. **Remplacez** le contenu de `functions/api/notifications/index.js` par ce code.
2. **Testez localement** avec `npm run build`.
3. **Redéployez** sur Cloudflare Pages.

Si le problème persiste, vérifiez que :
- Votre version de Supabase JS est à jour (`npm update @supabase/supabase-js`).
- Les variables d’environnement (`env`) sont correctement configurées dans `wrangler.toml`.

Besoin d’aide pour tester ou déployer ?
