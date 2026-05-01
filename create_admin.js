#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  NEXUS Market — Script de création du compte administrateur Supabase
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Ce script crée (ou met à jour) le profil admin dans la table `profiles`
 *  de Supabase. Le backend le lit lors de POST /api/auth/login.
 *
 *  PRÉREQUIS
 *  ---------
 *  1. Node.js ≥ 18
 *  2. Packages :
 *       npm install @supabase/supabase-js bcryptjs
 *
 *  UTILISATION
 *  -----------
 *  # Avec variables d'environnement (recommandé) :
 *  SUPABASE_URL=https://xxx.supabase.co \
 *  SUPABASE_SERVICE_KEY=eyJ... \
 *  ADMIN_EMAIL=admin@nexus.sn \
 *  ADMIN_PASSWORD=MonMotDePasseSécurisé \
 *  ADMIN_NAME="Admin NEXUS" \
 *  node create_admin.js
 *
 *  # Ou modifiez directement la section CONFIG ci-dessous.
 *
 *  SÉCURITÉ
 *  --------
 *  - Ne commitez jamais ce fichier avec des credentials en dur.
 *  - Utilisez SUPABASE_SERVICE_KEY (rôle service_role), PAS l'anon key.
 *  - Le mot de passe est haché avec bcrypt (salt 12) avant insertion.
 * ════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ── Dépendances ────────────────────────────────────────────────────────────────
let createClient, bcrypt;
try {
  ({ createClient } = require('@supabase/supabase-js'));
  bcrypt = require('bcryptjs');
} catch (e) {
  console.error('\n❌ Packages manquants. Installez-les avec :\n');
  console.error('   npm install @supabase/supabase-js bcryptjs\n');
  process.exit(1);
}

// ── CONFIG — modifiez ici OU passez via variables d'environnement ─────────────
const CONFIG = {
  supabaseUrl:        process.env.SUPABASE_URL        || 'https://pqcqbstbdujzaclsiosv.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY3Fic3RiZHVqemFjbHNpb3N2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxMzQ5MiwiZXhwIjoyMDkwMzg5NDkyfQ.fBlPt4g40xZ5F3lbempAYNuLZtvcnwxshnipACZPy08',   // ← OBLIGATOIRE
  adminEmail:         process.env.ADMIN_EMAIL          || 'elhadjidiagne002@gmail.com',
  adminPassword:      process.env.ADMIN_PASSWORD       || 'Gaston-123',   // ← OBLIGATOIRE
  adminName:          process.env.ADMIN_NAME           || 'El Hadji Diagne',
  adminPhone:         process.env.ADMIN_PHONE          || null,
  // Si true : met à jour le compte existant (mdp + nom) sans recréer
  updateIfExists:     process.env.UPDATE_IF_EXISTS     !== 'false',
};

// ── Validation ─────────────────────────────────────────────────────────────────
function validate() {
  const errors = [];
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseUrl.startsWith('https://'))
    errors.push('SUPABASE_URL invalide (ex: https://xxx.supabase.co)');
  if (!CONFIG.supabaseServiceKey || CONFIG.supabaseServiceKey.length < 100)
    errors.push('SUPABASE_SERVICE_KEY manquante ou invalide (utilisez la clé service_role)');
  if (!CONFIG.adminPassword || CONFIG.adminPassword.length < 8)
    errors.push('ADMIN_PASSWORD doit faire au moins 8 caractères');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CONFIG.adminEmail))
    errors.push('ADMIN_EMAIL invalide');
  if (errors.length) {
    console.error('\n❌ Erreurs de configuration :\n');
    errors.forEach(e => console.error('   •', e));
    console.error('\n');
    process.exit(1);
  }
}

// ── Génère un avatar 2 lettres depuis le nom ───────────────────────────────────
function makeAvatar(name) {
  const parts = (name || 'AD').trim().toUpperCase().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return (parts[0] || 'AD').slice(0, 2);
}

// ── Script principal ───────────────────────────────────────────────────────────
async function main() {
  validate();

  console.log('\n🔧 NEXUS Market — Création du compte admin\n');
  console.log(`   Supabase : ${CONFIG.supabaseUrl}`);
  console.log(`   Email    : ${CONFIG.adminEmail}`);
  console.log(`   Nom      : ${CONFIG.adminName}`);
  console.log('');

  // Connexion Supabase avec le rôle service_role (bypass RLS)
  const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Test de connexion
  const { error: pingErr } = await supabase.from('profiles').select('id').limit(1);
  if (pingErr) {
    console.error('❌ Connexion Supabase échouée :', pingErr.message);
    console.error('   Vérifiez SUPABASE_URL et SUPABASE_SERVICE_KEY.\n');
    process.exit(1);
  }
  console.log('✅ Connexion Supabase OK\n');

  // Hachage du mot de passe (bcrypt, salt 12)
  console.log('🔐 Hachage du mot de passe...');
  const passwordHash = await bcrypt.hash(CONFIG.adminPassword, 12);
  console.log('   Hash généré (bcrypt salt=12)\n');

  // Vérifier si un admin existe déjà avec cet email
  const { data: existing, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, name, role, status, created_at')
    .eq('email', CONFIG.adminEmail.trim().toLowerCase())
    .maybeSingle();

  if (fetchErr) {
    console.error('❌ Erreur lors de la vérification :', fetchErr.message);
    process.exit(1);
  }

  const now = new Date().toISOString();

  if (existing) {
    // ── Compte existant ─────────────────────────────────────────────────────
    console.log(`⚠️  Compte existant trouvé (id: ${existing.id})`);
    console.log(`   Rôle actuel : ${existing.role}, Statut : ${existing.status}`);

    if (!CONFIG.updateIfExists) {
      console.log('\n   UPDATE_IF_EXISTS=false — Aucune modification effectuée.\n');
      process.exit(0);
    }

    console.log('\n🔄 Mise à jour du compte existant...');
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        name:          CONFIG.adminName,
        role:          'admin',
        status:        'active',
        password_hash: passwordHash,
        phone:         CONFIG.adminPhone || existing.phone || null,
        avatar:        makeAvatar(CONFIG.adminName),
        onboarding_complete: true,
        last_login:    null,   // réinitialisé — sera mis à jour à la prochaine connexion
      })
      .eq('id', existing.id);

    if (updateErr) {
      console.error('❌ Mise à jour échouée :', updateErr.message);
      process.exit(1);
    }

    console.log('✅ Compte admin mis à jour avec succès !\n');
    console.log('   ┌────────────────────────────────────────────┐');
    console.log(`   │  ID      : ${existing.id}`);
    console.log(`   │  Email   : ${CONFIG.adminEmail}`);
    console.log(`   │  Rôle    : admin`);
    console.log(`   │  Statut  : active`);
    console.log(`   │  Mdp mis à jour : ✓`);
    console.log('   └────────────────────────────────────────────┘\n');

  } else {
    // ── Nouveau compte ──────────────────────────────────────────────────────
    console.log('👤 Aucun compte existant — création en cours...\n');

    // Générer un UUID v4 compatible Postgres
    const { randomUUID } = require('crypto');
    const adminId = randomUUID();

    const adminProfile = {
      id:                  adminId,
      email:               CONFIG.adminEmail.trim().toLowerCase(),
      name:                CONFIG.adminName,
      role:                'admin',
      status:              'active',
      avatar:              makeAvatar(CONFIG.adminName),
      password_hash:       passwordHash,
      phone:               CONFIG.adminPhone || null,
      bio:                 'Administrateur de la plateforme NEXUS Market',
      shop_name:           null,
      shop_category:       null,
      commission_rate:     null,
      payout_method:       null,
      payout_destination:  null,
      onboarding_complete: true,
      github_id:           null,
      github_login:        null,
      github_avatar:       null,
      created_at:          now,
      last_login:          null,
    };

    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .insert(adminProfile)
      .select('id, email, name, role, status, created_at')
      .single();

    if (insertErr) {
      console.error('❌ Création échouée :', insertErr.message);
      // Aide au diagnostic
      if (insertErr.message.includes('duplicate')) {
        console.error('\n   Un profil avec cet email ou cet ID existe peut-être déjà.');
        console.error('   Lancez avec UPDATE_IF_EXISTS=true pour le mettre à jour.\n');
      }
      if (insertErr.message.includes('profiles_pkey') || insertErr.message.includes('unique')) {
        console.error('\n   Contrainte unique violée — email ou ID déjà utilisé.\n');
      }
      process.exit(1);
    }

    console.log('✅ Compte admin créé avec succès !\n');
    console.log('   ┌────────────────────────────────────────────┐');
    console.log(`   │  ID         : ${created.id}`);
    console.log(`   │  Email      : ${created.email}`);
    console.log(`   │  Nom        : ${created.name}`);
    console.log(`   │  Rôle       : ${created.role}`);
    console.log(`   │  Statut     : ${created.status}`);
    console.log(`   │  Créé le    : ${new Date(created.created_at).toLocaleString('fr-FR')}`);
    console.log('   └────────────────────────────────────────────┘\n');
  }

  // ── Vérification finale : connexion simulée ───────────────────────────────
  console.log('🔍 Vérification finale (lecture depuis Supabase)...');
  const { data: verify, error: verErr } = await supabase
    .from('profiles')
    .select('id, email, name, role, status, password_hash')
    .eq('email', CONFIG.adminEmail.trim().toLowerCase())
    .single();

  if (verErr || !verify) {
    console.error('❌ Impossible de vérifier le compte :', verErr?.message);
    process.exit(1);
  }

  const hashOk = await bcrypt.compare(CONFIG.adminPassword, verify.password_hash);
  if (!hashOk) {
    console.error('❌ Vérification du mot de passe échouée — hash incohérent.');
    process.exit(1);
  }

  console.log('✅ Vérification réussie — le backend pourra authentifier cet admin.\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Vous pouvez maintenant vous connecter sur NEXUS Market avec :');
  console.log(`    Email    : ${CONFIG.adminEmail}`);
  console.log(`    Mot de passe : (celui que vous avez fourni)`);
  console.log('  Le token JWT renvoyé aura role: "admin".');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ Erreur non gérée :', err.message);
  process.exit(1);
});
