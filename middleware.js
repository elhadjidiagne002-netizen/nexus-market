// ═══════════════════════════════════════════════════════════════════════════
// GasTon 360 — middleware.js  (Next.js App Router)
// FIX CORS : à placer à la racine du projet (même niveau que package.json)
//
// Ce fichier s'exécute avant chaque requête API — il injecte les bons
// headers CORS pour autoriser Vercel preview + production + localhost.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';

// Origines autorisées
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://nexus-market-md360.vercel.app',
];

// Pattern pour toutes les preview URLs Vercel
const VERCEL_PATTERN = /^https:\/\/nexus-market.*\.vercel\.app$/;

function isAllowed(origin) {
  if (!origin) return true; // SSR, Postman, mobile
  if (VERCEL_PATTERN.test(origin)) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

export function middleware(request) {
  const origin   = request.headers.get('origin') ?? '';
  const response = NextResponse.next();

  if (isAllowed(origin)) {
    response.headers.set('Access-Control-Allow-Origin',      origin || '*');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods',     'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers',     'Content-Type,Authorization,X-Requested-With,stripe-signature');
  }

  // Répondre directement aux preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: response.headers,
    });
  }

  return response;
}

// Appliquer le middleware uniquement aux routes API
export const config = {
  matcher: '/api/:path*',
};
