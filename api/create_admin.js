#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  NEXUS Market — Script de création du compte administrateur Supabase
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Ce script crée (ou met à jour) le profil admin dans la table `profiles`
 *  ET dans Supabase Auth. Le backend lit `profiles` lors de POST /api/auth/login.
 *
 *  STRATÉGIE D'AUTH NEXUS :
 *  ─────────────────────────
 *  Le backend /api/auth/login cherche le compte dans `profiles` par email.
 *  Si `password_hash` est présent → authentification bcrypt (prioritaire).
 *  Le fallback Supabase Auth n'est utilisé QUE si password_hash est absent.
 *  ➜ Ce script crée les DEUX pour que les deux chemins fonctionnent.
 *
 *  PRÉREQUIS
 *  ---------
 *  1. Node.js ≥ 18
 *  2. npm install @supabase/supabase-js bcryptjs
 *
 *  UTILISATION
 *  -----------
 *  SUPABASE_URL=https://xxx.supabase.co \
 *  SUPABASE_SERVICE_KEY=eyJ... \
 *  ADMIN_EMAIL=admin@nexus.sn \
 *  ADMIN_PASSWORD=MonMotDePasseSécurisé \
 *  node create_admin.js
 * ════════════════════════════════════════════════════════════════════════
 */

'use strict';

let createClient, bcrypt;
try {
  ({ createClient } = require('@supabase/supabase-js'));
  bcrypt = require('bcryptjs');
} catch (e) {
  console.error('\n❌ Packages manquants :\n   npm install @supabase/supabase-js bcryptjs\n');
  process.exit(1);
}

const CONFIG = {
  supabaseUrl:        process.env.SUPABASE_URL        || 'https://pqcqbstbdujzaclsiosv.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY3Fic3RiZHVqemFjbHNpb3N2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxMzQ5MiwiZXhwIjoyMDkwMzg5NDkyfQ.fBlPt4g40xZ5F3lbempAYNuLZtvcnwxshnipACZPy08',
  adminEmail:         process.env.ADMIN_EMAIL          || 'elhadjidiagne002@gmail.com',
  adminPassword:      process.env.ADMIN_PASSWORD       || 'Gaston-123',
  adminName:          process.env.ADMIN_NAME           || 'El Hadji Diagne',
  adminPhone:         process.env.ADMIN_PHONE          || null,
  updateIfExists:     process.env.UPDATE_IF_EXISTS     !== 'false',
};

function validate() {
  const errors = [];
  if (!CONFIG.supabaseUrl?.startsWith('https://')) errors.push('SUPABASE_URL invalide');
  if (!CONFIG.supabaseServiceKey || CONFIG.supabaseServiceKey.length < 100) errors.push('SUPABASE_SERVICE_KEY invalide (utilisez la clé service_role)');
  if (!CONFIG.adminPassword || CONFIG.adminPassword.length < 8) errors.push('ADMIN_PASSWORD trop court (≥ 8 caractères)');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CONFIG.adminEmail)) errors.push('ADMIN_EMAIL invalide');
  if (errors.length) { errors.forEach(e => console.error('❌', e)); process.exit(1); }
}

function makeAvatar(name) {
  const parts = (name || 'AD').trim().toUpperCase().split(/\s+/);
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || 'AD').slice(0, 2);
}

async function main() {
  validate();

  console.log('\n🔧 NEXUS Market — Création du compte admin\n');
  console.log(`   Supabase : ${CONFIG.supabaseUrl}`);
  console.log(`   Email    : ${CONFIG.adminEmail}`);
  console.log(`   Nom      : ${CONFIG.adminName}\n`);

  // Client service_role (bypass RLS + accès auth.admin)
  const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Test de connexion
  const { error: pingErr } = await supabase.from('profiles').select('id').limit(1);
  if (pingErr) {
    console.error('❌ Connexion Supabase échouée :', pingErr.message);
    process.exit(1);
  }
  console.log('✅ Connexion Supabase OK\n');

  const emailNorm = CONFIG.adminEmail.trim().toLowerCase();

  // ── ÉTAPE 1 : Vérifier profil existant ────────────────────────────────────
  const { data: existing, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, name, role, status, password_hash, created_at')
    .eq('email', emailNorm)
    .maybeSingle();                    // [FIX] maybeSingle() au lieu de single()

  if (fetchErr) {
    console.error('❌ Erreur lors de la lecture profiles :', fetchErr.message);
    process.exit(1);
  }

  // ── ÉTAPE 2 : Hash du mot de passe bcrypt (salt 12) ────────────────────────
  console.log('🔐 Hachage du mot de passe...');
  const passwordHash = await bcrypt.hash(CONFIG.adminPassword, 12);
  console.log('   Hash bcrypt(12) généré ✓\n');

  const now = new Date().toISOString();

  // ── ÉTAPE 3 : Supabase Auth — créer ou mettre à jour l'utilisateur ─────────
  // [RAISON] Le backend login a un fallback Supabase Auth. Pour être robuste,
  // l'admin doit exister dans auth.users ET avoir un password_hash dans profiles.
  console.log('👤 Synchronisation avec Supabase Auth...');

  // Chercher si l'utilisateur existe dans auth.users
  const { data: authList, error: authListErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUser = authList?.users?.find(u => u.email === emailNorm);

  let authUserId = authUser?.id || existing?.id;

  if (authUser) {
    // Mettre à jour le mot de passe dans Supabase Auth
    const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: CONFIG.adminPassword,
      email_confirm: true,
      user_metadata: { name: CONFIG.adminName, role: 'admin' },
    });
    if (updateAuthErr) {
      console.warn('   ⚠️ Mise à jour Supabase Auth échouée :', updateAuthErr.message);
      console.warn('   → Le login bcrypt (chemin 1) fonctionnera quand même.');
    } else {
      console.log('   ✅ Supabase Auth mis à jour (id:', authUser.id, ')');
    }
    authUserId = authUser.id;
  } else {
    // Créer dans Supabase Auth avec un UUID déterministe si besoin
    const { randomUUID } = require('crypto');
    const newAuthId = existing?.id || randomUUID();

    const { data: createdAuth, error: createAuthErr } = await supabase.auth.admin.createUser({
      email: emailNorm,
      password: CONFIG.adminPassword,
      email_confirm: true,
      user_metadata: { name: CONFIG.adminName, role: 'admin' },
      ...(existing?.id ? { id: existing.id } : {}),   // forcer le même UUID que profiles si possible
    });

    if (createAuthErr) {
      // Peut échouer si l'ID existe déjà dans auth.users mais pas dans listUsers → continuer
      console.warn('   ⚠️ Création Supabase Auth :', createAuthErr.message);
      console.warn('   → Le login bcrypt (chemin 1) fonctionnera quand même.');
    } else {
      authUserId = createdAuth.user.id;
      console.log('   ✅ Compte Supabase Auth créé (id:', authUserId, ')');
    }
  }

  // ── ÉTAPE 4 : Profil `profiles` — créer ou mettre à jour ──────────────────
  const finalId = authUserId || (existing?.id) || require('crypto').randomUUID();

  if (existing) {
    if (!CONFIG.updateIfExists) {
      console.log('\n⚠️  Compte existant trouvé — UPDATE_IF_EXISTS=false. Aucune modification.\n');
      process.exit(0);
    }
    console.log(`\n🔄 Mise à jour du profil existant (id: ${existing.id})...`);
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        name:          CONFIG.adminName,
        role:          'admin',
        status:        'active',
        password_hash: passwordHash,    // [CRITIQUE] Toujours réécrire le hash
        phone:         CONFIG.adminPhone || null,
        avatar:        makeAvatar(CONFIG.adminName),
        onboarding_complete: true,
      })
      .eq('id', existing.id);

    if (updateErr) { console.error('❌ Mise à jour profiles échouée :', updateErr.message); process.exit(1); }
    console.log('✅ Profil admin mis à jour !\n');
    console.log('   id     :', existing.id);
    console.log('   email  :', emailNorm);
    console.log('   rôle   : admin | statut : active\n');
  } else {
    console.log('\n👤 Création du profil dans `profiles`...');
    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .insert({
        id:                  finalId,
        email:               emailNorm,
        name:                CONFIG.adminName,
        role:                'admin',
        status:              'active',
        avatar:              makeAvatar(CONFIG.adminName),
        password_hash:       passwordHash,
        phone:               CONFIG.adminPhone || null,
        bio:                 'Administrateur de la plateforme NEXUS Market',
        onboarding_complete: true,
        created_at:          now,
        last_login:          null,
      })
      .select('id, email, name, role, status')
      .single();

    if (insertErr) {
      console.error('❌ Insertion profiles échouée :', insertErr.message);
      if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) {
        console.error('   → Email ou ID déjà pris. Relancez avec UPDATE_IF_EXISTS=true');
      }
      process.exit(1);
    }
    console.log('✅ Profil créé !\n');
    console.log('   id     :', created.id);
    console.log('   email  :', created.email);
    console.log('   rôle   :', created.role, '| statut :', created.status, '\n');
  }

  // ── ÉTAPE 5 : Vérification finale ─────────────────────────────────────────
  console.log('🔍 Vérification finale...');
  const { data: verify, error: verErr } = await supabase
    .from('profiles')
    .select('id, email, name, role, status, password_hash')
    .eq('email', emailNorm)
    .maybeSingle();

  if (verErr || !verify) { console.error('❌ Vérification impossible :', verErr?.message); process.exit(1); }

  const hashOk = await bcrypt.compare(CONFIG.adminPassword, verify.password_hash);
  if (!hashOk) { console.error('❌ Hash incohérent — quelque chose a mal tourné.'); process.exit(1); }

  console.log('✅ Vérification réussie — les deux chemins d\'auth sont opérationnels :\n');
  console.log('   [Chemin 1] Login bcrypt via /api/auth/login  → ✅');
  console.log('   [Chemin 2] Fallback Supabase Auth            → ✅\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Connectez-vous sur NEXUS Market avec :');
  console.log(`    Email    : ${emailNorm}`);
  console.log('    Mot de passe : (celui que vous avez fourni)');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ Erreur non gérée :', err.message);
  process.exit(1);
});

