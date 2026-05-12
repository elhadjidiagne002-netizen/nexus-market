/**
 * functions/api/invoices/statement/vendor.js
 * GET /api/invoices/statement/vendor?month=YYYY-MM
 *
 * Génère un relevé mensuel PDF multi-commandes côté serveur.
 * Retourne un fichier PDF binaire (Content-Type: application/pdf).
 *
 * Le PDF est généré en pur JavaScript (pas de dépendance native) :
 * structure PDF minimale conforme RFC 3778, encodage ASCII-safe.
 *
 * Variables Cloudflare Pages :
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   NEXUS_COMMISSION  (défaut: 0.15)
 *   EUR_TO_XOF        (défaut: 655.957)
 *   SITE_URL
 */
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonErr = (status, msg) =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// ── PDF builder (pur JS, sans dépendance) ────────────────────────────────────
// Génère un PDF A4 valide avec texte et lignes.
// Police : Helvetica (14 standard PDF fonts — toujours disponible).

class PDFBuilder {
  constructor() {
    this._objects = [];   // objets PDF
    this._offsets = [];   // offsets xref
    this._stream  = [];   // lignes du stream de la page courante
    this._pageH   = 841.89;  // A4 pt
    this._pageW   = 595.28;
    this._y       = this._pageH - 60; // curseur vertical (pt, depuis bas)
    this._margin  = 50;
    this._addObj  = (content) => { this._objects.push(content); return this._objects.length; };
  }

  // Convertit mm → pt
  mm(v) { return v * 2.8346; }

  // Ajoute du texte — x,y en pt depuis le bas de la page
  text(x, y, str, size = 10, bold = false) {
    const font = bold ? "Helvetica-Bold" : "Helvetica";
    // Échapper parenthèses dans les strings PDF
    const safe = String(str).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    this._stream.push(`BT /${font} ${size} Tf ${x} ${y} Td (${safe}) Tj ET`);
  }

  // Ligne horizontale
  hline(x1, y, x2, width = 0.5, r = 0, g = 0, b = 0) {
    this._stream.push(`${r} ${g} ${b} RG ${width} w ${x1} ${y} m ${x2} ${y} l S`);
  }

  // Rectangle rempli (r,g,b en 0-1)
  rect(x, y, w, h, r = 0.9, g = 0.9, b = 0.9) {
    this._stream.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f`);
  }

  build() {
    // Ressources
    const resObjId = this._addObj(
      `<< /Font << /Helvetica << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> ` +
      `/Helvetica-Bold << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >>`
    );

    // Stream de la page
    const streamContent = this._stream.join("\n");
    const streamLen     = new TextEncoder().encode(streamContent).length;
    const streamObjId   = this._addObj(
      `<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream`
    );

    // Page
    const pageObjId = this._addObj(
      `<< /Type /Page /MediaBox [0 0 ${this._pageW} ${this._pageH}] ` +
      `/Contents ${streamObjId} 0 R /Resources ${resObjId} 0 R /Parent 4 0 R >>`
    );

    // Pages dict (obj 4)
    const pagesObjId = this._addObj(
      `<< /Type /Pages /Kids [${pageObjId} 0 R] /Count 1 >>`
    );

    // Catalog (obj 5)
    const catalogObjId = this._addObj(
      `<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`
    );

    // Assemblage
    let out    = "%PDF-1.4\n";
    const xref = [];

    for (let i = 0; i < this._objects.length; i++) {
      xref.push(out.length);
      out += `${i + 1} 0 obj\n${this._objects[i]}\nendobj\n`;
    }

    const xrefOffset = out.length;
    out += `xref\n0 ${this._objects.length + 1}\n`;
    out += "0000000000 65535 f \n";
    for (const offset of xref) {
      out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${this._objects.length + 1} /Root ${catalogObjId} 0 R >>\n`;
    out += `startxref\n${xrefOffset}\n%%EOF`;

    return out;
  }
}

// ── Génération du relevé ─────────────────────────────────────────────────────
function buildStatementPDF({ vendorName, vendorEmail, month, orders, commissionRate, eurToXof }) {
  const pdf  = new PDFBuilder();
  const H    = 841.89;
  const W    = 595.28;
  const M    = 50;      // marge gauche
  const MR   = W - 50; // marge droite

  // ── En-tête fond vert ──────────────────────────────────────────────────────
  pdf.rect(0, H - 80, W, 80, 0.031, 0.325, 0.243);

  // Logo / Titre
  pdf.text(M, H - 35, "NEXUS Market Senegal", 18, true);
  // Couleur blanche simulée — non disponible sans extension de couleur PDF
  // → on utilise simplement le fond vert et texte noir (acceptable)

  // Sous-titre
  pdf.text(M, H - 55, "Releve Mensuel des Ventes", 11);

  // ── Infos document ─────────────────────────────────────────────────────────
  const [year, monthNum] = month.split("-");
  const monthNames = ["Janvier","Fevrier","Mars","Avril","Mai","Juin",
                      "Juillet","Aout","Septembre","Octobre","Novembre","Decembre"];
  const monthLabel = `${monthNames[parseInt(monthNum) - 1]} ${year}`;
  const today      = new Date().toLocaleDateString("fr-FR");

  pdf.text(M,      H - 105, `Vendeur :`, 9, true);
  pdf.text(M + 60, H - 105, vendorName, 9);
  pdf.text(M,      H - 118, `Email :`, 9, true);
  pdf.text(M + 60, H - 118, vendorEmail || "-", 9);
  pdf.text(M,      H - 131, `Periode :`, 9, true);
  pdf.text(M + 60, H - 131, monthLabel, 9);
  pdf.text(M,      H - 144, `Genere le :`, 9, true);
  pdf.text(M + 60, H - 144, today, 9);

  pdf.hline(M, H - 155, MR, 0.5);

  // ── En-tête tableau ────────────────────────────────────────────────────────
  const colId   = M;
  const colDate = M + 90;
  const colGross= M + 210;
  const colComm = M + 320;
  const colNet  = M + 420;

  const rowH = 14;
  let   y    = H - 175;

  pdf.rect(M - 5, y - 4, MR - M + 10, rowH + 2, 0.031, 0.325, 0.243);
  pdf.text(colId,    y, "N Commande",   9, true);
  pdf.text(colDate,  y, "Date",         9, true);
  pdf.text(colGross, y, "Montant Brut", 9, true);
  pdf.text(colComm,  y, "Commission",   9, true);
  pdf.text(colNet,   y, "Net Vendeur",  9, true);

  y -= (rowH + 4);

  // ── Lignes de commandes ────────────────────────────────────────────────────
  let totalGross = 0;
  let totalComm  = 0;
  let totalNet   = 0;
  let rowIndex   = 0;

  for (const order of orders) {
    const gross      = Math.round((order.amount_eur || order.total || 0) * eurToXof);
    const commission = Math.round(gross * commissionRate);
    const net        = gross - commission;

    totalGross += gross;
    totalComm  += commission;
    totalNet   += net;

    // Fond alterné
    if (rowIndex % 2 === 0) {
      pdf.rect(M - 5, y - 4, MR - M + 10, rowH, 0.96, 0.96, 0.96);
    }

    const dateStr = order.created_at
      ? new Date(order.created_at).toLocaleDateString("fr-FR")
      : "-";
    const ordId = String(order.id || "-").slice(0, 14);

    pdf.text(colId,    y, ordId, 8);
    pdf.text(colDate,  y, dateStr, 8);
    pdf.text(colGross, y, `${gross.toLocaleString("fr-FR")} F`, 8);
    pdf.text(colComm,  y, `${commission.toLocaleString("fr-FR")} F`, 8);
    pdf.text(colNet,   y, `${net.toLocaleString("fr-FR")} F`, 8);

    y -= rowH;
    rowIndex++;

    // Nouvelle page si besoin (simplifié — on s'arrête à ~30 lignes)
    if (y < 100) break;
  }

  // ── Ligne de total ──────────────────────────────────────────────────────────
  pdf.hline(M, y + 2, MR, 1);
  y -= 6;

  pdf.rect(M - 5, y - 4, MR - M + 10, rowH + 2, 0.031, 0.325, 0.243);
  pdf.text(colId,    y, `TOTAL (${orders.length} commandes)`, 9, true);
  pdf.text(colGross, y, `${totalGross.toLocaleString("fr-FR")} F`, 9, true);
  pdf.text(colComm,  y, `${totalComm.toLocaleString("fr-FR")} F`, 9, true);
  pdf.text(colNet,   y, `${totalNet.toLocaleString("fr-FR")} F`, 9, true);

  y -= (rowH + 20);

  // ── Récapitulatif ──────────────────────────────────────────────────────────
  pdf.hline(M, y, MR, 0.5);
  y -= 16;

  pdf.text(M,       y, "Recapitulatif", 11, true);
  y -= 14;

  const summaryItems = [
    ["Chiffre d affaires brut",  `${totalGross.toLocaleString("fr-FR")} FCFA`],
    [`Commission NEXUS (${Math.round(commissionRate * 100)}%)`, `- ${totalComm.toLocaleString("fr-FR")} FCFA`],
    ["Montant net a percevoir",  `${totalNet.toLocaleString("fr-FR")} FCFA`],
    ["Equivalence EUR",          `${(totalNet / eurToXof).toFixed(2)} EUR`],
  ];

  for (const [label, value] of summaryItems) {
    pdf.text(M,       y, label, 9);
    pdf.text(MR - 120, y, value, 9, true);
    y -= 13;
  }

  // ── Pied de page ──────────────────────────────────────────────────────────
  pdf.hline(M, 40, MR, 0.3);
  pdf.text(M,      30, "NEXUS Market Senegal - sav@nexus.sn", 7);
  pdf.text(MR - 100, 30, `Releve ${monthLabel}`, 7);

  return pdf.build();
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const { request, env } = context;

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SITE_URL } = env;
  const commissionRate = parseFloat(env.NEXUS_COMMISSION || "0.15");
  const eurToXof       = parseFloat(env.EUR_TO_XOF || "655.957");

  if (!SUPABASE_SERVICE_KEY) return jsonErr(503, "Supabase non configuré");

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonErr(401, "Token manquant");

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return jsonErr(401, "Token invalide");

  // ── Paramètres ────────────────────────────────────────────────────────────
  const url   = new URL(request.url);
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return jsonErr(400, "Format month invalide — attendu: YYYY-MM");
  }

  const dateFrom = `${month}-01T00:00:00.000Z`;
  const dateTo   = new Date(new Date(dateFrom).setMonth(new Date(dateFrom).getMonth() + 1)).toISOString();

  // ── Requête commandes du mois ─────────────────────────────────────────────
  const { data: orders, error: ordErr } = await sb
    .from("orders")
    .select("id, created_at, amount_eur, amount_fcfa, total, status, user_id")
    .eq("vendor_id", user.id)
    .in("status", ["processing", "shipped", "delivered"])
    .gte("created_at", dateFrom)
    .lt("created_at", dateTo)
    .order("created_at", { ascending: true });

  if (ordErr) return jsonErr(500, ordErr.message);

  // ── Profil vendeur ────────────────────────────────────────────────────────
  const { data: profile } = await sb
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle();

  const vendorName  = profile?.name  || user.email?.split("@")[0] || "Vendeur";
  const vendorEmail = profile?.email || user.email || "";

  // ── Génération PDF ────────────────────────────────────────────────────────
  const pdfContent = buildStatementPDF({
    vendorName,
    vendorEmail,
    month,
    orders:         orders || [],
    commissionRate,
    eurToXof,
  });

  const filename = `Releve-Mensuel-NEXUS-${month}.pdf`;

  return new Response(pdfContent, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
      ...CORS,
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
