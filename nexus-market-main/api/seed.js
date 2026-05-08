// scripts/seed.js
// Données de démo pour NEXUS Market Sénégal

import { createClient } from '@supabase/supabase-js';
import dotenv           from 'dotenv';

dotenv.config();

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function seed() {
    console.log('\n🌱 NEXUS Market — Seed données de démonstration\n');

    // ── 1. Créer un admin ──────────────────────────────────────────────────
    const { data: adminAuth } = await sb.auth.admin.createUser({
        email: 'admin@nexus.sn', password: 'NexusAdmin2024!',
        email_confirm: true,
        user_metadata: { name: 'Admin NEXUS', role: 'admin', avatar: 'AN' }
    });

    if (adminAuth?.user) {
        await sb.from('profiles').upsert({
            id: adminAuth.user.id, email: 'admin@nexus.sn',
            name: 'Admin NEXUS', role: 'admin', avatar: 'AN', is_verified: true
        });
        console.log('✅ Admin créé : admin@nexus.sn / NexusAdmin2024!');
    }

    // ── 2. Créer des vendeurs ──────────────────────────────────────────────
    const vendors = [
        { email: 'diallo@nexus.sn', name: 'Mamadou Diallo', shop: 'Boutique Dakar Chic', city: 'Dakar' },
        { email: 'fall@nexus.sn',   name: 'Fatou Fall',     shop: 'Mode Sénégal',        city: 'Thiès'  },
        { email: 'ndiaye@nexus.sn', name: 'Ibrahima Ndiaye',shop: 'Tech Store SN',       city: 'Dakar'  },
    ];

    const vendorIds = [];
    for (const v of vendors) {
        const { data } = await sb.auth.admin.createUser({
            email: v.email, password: 'Vendor2024!',
            email_confirm: true,
            user_metadata: { name: v.name, role: 'vendor', avatar: v.name.split(' ').map(n=>n[0]).join('') }
        });
        if (!data?.user) continue;
        const uid = data.user.id;
        vendorIds.push(uid);

        await sb.from('profiles').upsert({
            id: uid, email: v.email, name: v.name,
            role: 'vendor', city: v.city, is_verified: true,
            avatar: v.name.split(' ').map(n=>n[0]).join('')
        });

        await sb.from('vendor_profiles').upsert({
            user_id: uid, shop_name: v.shop, status: 'approved',
            approved_at: new Date().toISOString()
        });
        console.log(`✅ Vendeur : ${v.email} / Vendor2024!`);
    }

    // ── 3. Créer un acheteur ───────────────────────────────────────────────
    const { data: buyerAuth } = await sb.auth.admin.createUser({
        email: 'client@nexus.sn', password: 'Client2024!',
        email_confirm: true,
        user_metadata: { name: 'Aminata Sow', role: 'buyer', avatar: 'AS' }
    });
    if (buyerAuth?.user) {
        await sb.from('profiles').upsert({
            id: buyerAuth.user.id, email: 'client@nexus.sn',
            name: 'Aminata Sow', role: 'buyer', city: 'Dakar', avatar: 'AS'
        });
        console.log('✅ Acheteur : client@nexus.sn / Client2024!');
    }

    // ── 4. Produits de démo ────────────────────────────────────────────────
    if (vendorIds.length > 0) {
        const products = [
            { name: 'Samsung Galaxy A54', category: 'Électronique',    price: 250000, stock: 15, vendor_id: vendorIds[2] || vendorIds[0], description: 'Smartphone Samsung Galaxy A54 5G, 128Go, double SIM. Garantie 1 an.' },
            { name: 'Boubou Brodé Homme',  category: 'Mode & Vêtements', price: 45000,  stock: 30, vendor_id: vendorIds[0], description: 'Boubou traditionnel sénégalais, broderie main, tissu bazin.' },
            { name: 'Thiéboudienne Épices', category: 'Alimentation',   price: 5000,   stock: 100,vendor_id: vendorIds[1] || vendorIds[0], description: 'Mélange d\'épices authentiques pour thiéboudienne, 500g.' },
            { name: 'Laptop HP 15s',        category: 'Électronique',   price: 450000, stock: 8,  vendor_id: vendorIds[2] || vendorIds[0], description: 'HP 15s-fq Intel Core i5, 8Go RAM, 256Go SSD.' },
            { name: 'Tissu Wax Africain',   category: 'Mode & Vêtements',price: 12000, stock: 200,vendor_id: vendorIds[1] || vendorIds[0], description: 'Tissu wax hollandais authentique, 6 yards, motifs variés.' },
            { name: 'Panier Osier Artisanal',category: 'Artisanat',     price: 8000,   stock: 50, vendor_id: vendorIds[0], description: 'Panier tressé à la main par des artisans de Thiès.' },
            { name: 'Huile de Karité Pure', category: 'Beauté & Santé', price: 7500,   stock: 80, vendor_id: vendorIds[1] || vendorIds[0], description: 'Beurre de karité pur non raffiné, 250ml. Origine Louga.' },
            { name: 'Chaussures Bissap',    category: 'Mode & Vêtements',price: 22000, stock: 40, vendor_id: vendorIds[0], description: 'Chaussures cuir artisanal couleur hibiscus, tailles 38-45.' },
        ];

        const { data: insertedProducts, error: pErr } = await sb
            .from('products')
            .insert(products.map(p => ({
                ...p,
                vendor_name: vendors.find(v => {
                    /* match approximatif */
                    return true;
                })?.name || 'Vendeur',
                active: true,
                status: 'active',
                images: [`https://picsum.photos/seed/${p.name.replace(/\s/g,'')}/400/300`],
                image_url: `https://picsum.photos/seed/${p.name.replace(/\s/g,'')}/400/300`,
                tags: [p.category.toLowerCase()],
                is_negotiable: Math.random() > 0.5,
                featured: Math.random() > 0.7,
            })))
            .select();

        if (!pErr) {
            console.log(`✅ ${insertedProducts?.length} produits créés`);
        } else {
            console.error('❌ Erreur produits:', pErr.message);
        }
    }

    console.log('\n✨ Seed terminé !\n');
    console.log('Comptes de test :');
    console.log('  👑 Admin   : admin@nexus.sn    / NexusAdmin2024!');
    console.log('  🏪 Vendeur : diallo@nexus.sn   / Vendor2024!');
    console.log('  🛒 Client  : client@nexus.sn   / Client2024!\n');
}

seed().catch(err => {
    console.error('Seed échoué:', err.message);
    process.exit(1);
});
