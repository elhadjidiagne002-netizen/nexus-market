import { useState, useRef, useCallback } from "react";

// ─── Constantes ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  "Électronique","Mode & Vêtements","Alimentation","Maison & Déco",
  "Beauté & Santé","Services","Informatique","Sport & Loisirs","Autres",
];

const REQUIRED = ["name","category","price","stock"];

const TEMPLATE_HEADERS = "name,category,price,original_price,stock,description,image_url,vendor_name";
const TEMPLATE_EXAMPLE = [
  `Smartphone Samsung A55,Électronique,189.99,219.99,24,Écran AMOLED 6.6 pouces,https://picsum.photos/seed/phone/400/300,NEXUS Demo Store`,
  `Boubou Grande Occasion,Mode & Vêtements,34.99,,8,Broderie artisanale main,,Dakar Fashion`,
  `Café Touba 500g,Alimentation,5.50,,100,Torréfaction traditionnelle,,Épicerie Unité`,
].join("\n");

const EUR_TO_FCFA = 655.957;
const fmtFcfa = (eur) =>
  eur ? Math.round(parseFloat(eur) * EUR_TO_FCFA).toLocaleString("fr-FR") + " FCFA" : "—";

// Génère un UUID v4 déterministe-ish (côté client)
const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

// ─── Parsing CSV ─────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [], error: "Fichier vide ou sans données." };
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((line, i) => {
    const vals = line.split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] ?? ""; });
    row._rowNum = i + 2;
    row._id = uuid();
    row._status = "pending"; // pending | valid | error | imported
    return row;
  });
  return { headers, rows, error: null };
}

function validateRow(row) {
  const errs = [];
  if (!row.name?.trim()) errs.push("Nom manquant");
  if (!row.category?.trim()) errs.push("Catégorie manquante");
  else if (!CATEGORIES.includes(row.category)) errs.push(`Catégorie inconnue : "${row.category}"`);
  if (!row.price || isNaN(parseFloat(row.price)) || parseFloat(row.price) <= 0)
    errs.push("Prix invalide");
  if (row.stock !== undefined && row.stock !== "" && (isNaN(parseInt(row.stock)) || parseInt(row.stock) < 0))
    errs.push("Stock invalide");
  return errs;
}

// ─── Composants UI ───────────────────────────────────────────────────────────
const Badge = ({ status }) => {
  const map = {
    pending:  { bg: "#f1f5f9", color: "#64748b", label: "En attente" },
    valid:    { bg: "#dcfce7", color: "#16a34a", label: "Valide" },
    error:    { bg: "#fee2e2", color: "#dc2626", label: "Erreur" },
    imported: { bg: "#dbeafe", color: "#2563eb", label: "Importé ✓" },
    importing:{ bg: "#fef9c3", color: "#ca8a04", label: "Envoi…" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: "2px 8px",
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "monospace" }}>
      {s.label}
    </span>
  );
};

const Stat = ({ label, value, color = "#00853E" }) => (
  <div style={{ textAlign: "center", padding: "12px 20px", background: "#f8fafc",
    borderRadius: 12, minWidth: 90 }}>
    <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, fontWeight: 600 }}>{label}</div>
  </div>
);

// ─── App principale ──────────────────────────────────────────────────────────
export default function BulkImport() {
  const [step, setStep] = useState("upload"); // upload | review | done
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editBuf, setEditBuf] = useState({});
  const fileRef = useRef();

  // Config Supabase (à remplir ou laisser vide pour mode démo)
  const [sbUrl, setSbUrl]   = useState(typeof NEXUS_CONFIG !== "undefined" ? NEXUS_CONFIG?.supabase?.url  : "");
  const [sbKey, setSbKey]   = useState(typeof NEXUS_CONFIG !== "undefined" ? NEXUS_CONFIG?.supabase?.anonKey : "");
  const [showCfg, setShowCfg] = useState(false);

  // ── Chargement fichier ───────────────────────────────────────────────────
  const loadFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) { setParseError("Seuls les fichiers .csv sont acceptés."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows: parsed, error } = parseCSV(e.target.result);
      if (error) { setParseError(error); return; }
      const validated = parsed.map((row) => {
        const errs = validateRow(row);
        return { ...row, _errors: errs, _status: errs.length ? "error" : "valid" };
      });
      setRows(validated);
      setParseError(null);
      setStep("review");
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    loadFile(e.dataTransfer.files[0]);
  };

  // ── Édition inline ───────────────────────────────────────────────────────
  const startEdit = (row) => {
    setEditingId(row._id);
    setEditBuf({ name: row.name, category: row.category, price: row.price,
      original_price: row.original_price, stock: row.stock,
      description: row.description, image_url: row.image_url, vendor_name: row.vendor_name });
  };
  const saveEdit = (id) => {
    setRows((prev) => prev.map((r) => {
      if (r._id !== id) return r;
      const updated = { ...r, ...editBuf };
      const errs = validateRow(updated);
      return { ...updated, _errors: errs, _status: errs.length ? "error" : "valid" };
    }));
    setEditingId(null);
  };

  // ── Suppression ──────────────────────────────────────────────────────────
  const deleteRow = (id) => setRows((prev) => prev.filter((r) => r._id !== id));

  // ── Import Supabase ──────────────────────────────────────────────────────
  const importAll = async () => {
    const toImport = rows.filter((r) => r._status === "valid");
    if (!toImport.length) return;

    const demo = !sbUrl || !sbKey;
    setImporting(true);
    setProgress(0);

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      setRows((prev) => prev.map((r) => r._id === row._id ? { ...r, _status: "importing" } : r));

      try {
        if (demo) {
          // Mode démo : simule un délai réseau
          await new Promise((res) => setTimeout(res, 220));
          setRows((prev) => prev.map((r) => r._id === row._id ? { ...r, _status: "imported" } : r));
        } else {
          const payload = {
            id:            uuid(),
            name:          row.name.trim(),
            category:      row.category.trim(),
            price:         parseFloat(row.price),
            original_price: row.original_price ? parseFloat(row.original_price) : null,
            stock:         row.stock ? parseInt(row.stock) : 0,
            description:   row.description?.trim() || null,
            image_url:     row.image_url?.trim() || null,
            vendor_name:   row.vendor_name?.trim() || null,
            active:        true,
            moderated:     false,
          };
          const res = await fetch(`${sbUrl}/rest/v1/products`, {
            method: "POST",
            headers: {
              "apikey": sbKey,
              "Authorization": `Bearer ${sbKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg);
          }
          setRows((prev) => prev.map((r) => r._id === row._id ? { ...r, _status: "imported" } : r));
        }
      } catch (err) {
        setRows((prev) => prev.map((r) =>
          r._id === row._id ? { ...r, _status: "error", _errors: [`Erreur import : ${err.message}`] } : r
        ));
      }

      setProgress(Math.round(((i + 1) / toImport.length) * 100));
    }

    setImporting(false);
    setStep("done");
  };

  // ── Génération SQL ───────────────────────────────────────────────────────
  const generateSQL = () => {
    const valid = rows.filter((r) => r._status === "valid" || r._status === "imported");
    if (!valid.length) return;
    const escape = (s) => (s || "").replace(/'/g, "''");
    const lines = valid.map((r) => {
      const id = uuid();
      const price = parseFloat(r.price);
      const origPrice = r.original_price ? parseFloat(r.original_price) : null;
      const stock = r.stock ? parseInt(r.stock) : 0;
      return `('${id}', '${escape(r.name)}', '${escape(r.category)}', ${price}, ${origPrice ?? "NULL"}, ${stock}, `
        + `${r.description ? `'${escape(r.description)}'` : "NULL"}, `
        + `${r.image_url ? `'${escape(r.image_url)}'` : "NULL"}, `
        + `NULL, '${escape(r.vendor_name || "NEXUS Demo Store")}', 0, 0, true, false, NOW())`;
    });
    const sql = `INSERT INTO public.products\n  (id, name, category, price, original_price, stock, description, image_url, vendor_id, vendor_name, rating, reviews_count, active, moderated, created_at)\nVALUES\n${lines.join(",\n")}\nON CONFLICT (id) DO NOTHING;`;
    const blob = new Blob([sql], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nexus_import_${Date.now()}.sql`;
    a.click();
  };

  // ── Télécharger template CSV ─────────────────────────────────────────────
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_HEADERS + "\n" + TEMPLATE_EXAMPLE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus_produits_template.csv";
    a.click();
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = {
    total:    rows.length,
    valid:    rows.filter((r) => r._status === "valid").length,
    errors:   rows.filter((r) => r._status === "error").length,
    imported: rows.filter((r) => r._status === "imported").length,
  };

  const filtered = rows.filter((r) => {
    if (filter === "valid")    return r._status === "valid";
    if (filter === "error")    return r._status === "error";
    if (filter === "imported") return r._status === "imported";
    return true;
  });

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", minHeight: "100vh",
      background: "#f0f4f8", padding: "24px 16px" }}>

      {/* ── Header ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12,
              background: "linear-gradient(135deg,#00853E,#00b35a)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, color: "#FDEF42", fontWeight: 900 }}>N</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
                Import en Masse — Produits
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                NEXUS Market Sénégal · Catalogue vendeur
              </div>
            </div>
          </div>
          <button onClick={() => setShowCfg(!showCfg)}
            style={{ background: "white", border: "1.5px solid #e2e8f0", borderRadius: 10,
              padding: "8px 14px", fontSize: 13, cursor: "pointer", color: "#475569",
              fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            ⚙ Supabase {sbUrl ? "✓" : "· mode démo"}
          </button>
        </div>

        {/* Config panel */}
        {showCfg && (
          <div style={{ marginTop: 12, background: "white", borderRadius: 14, padding: 20,
            border: "1.5px solid #e2e8f0", display: "grid",
            gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                URL Supabase
              </label>
              <input value={sbUrl} onChange={(e) => setSbUrl(e.target.value)}
                placeholder="https://xxx.supabase.co"
                style={{ width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8,
                  border: "1.5px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                Clé Anon (service_role pour bypass RLS)
              </label>
              <input value={sbKey} onChange={(e) => setSbKey(e.target.value)}
                type="password" placeholder="eyJ..."
                style={{ width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8,
                  border: "1.5px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ gridColumn: "span 2", fontSize: 12, color: "#94a3b8" }}>
              Sans configuration → mode démonstration (aucune insertion réelle). 
              Vous pouvez aussi générer le SQL et l'exécuter manuellement dans Supabase.
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ════ ÉTAPE 1 : UPLOAD ════ */}
        {step === "upload" && (
          <div>
            {/* Zone de dépôt */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2.5px dashed ${dragOver ? "#00853E" : "#cbd5e1"}`,
                borderRadius: 20, padding: "52px 24px", textAlign: "center",
                background: dragOver ? "rgba(0,133,62,0.04)" : "white",
                cursor: "pointer", transition: "all .2s", marginBottom: 20,
              }}>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => loadFile(e.target.files[0])} />
              <div style={{ fontSize: 44, marginBottom: 12 }}>📦</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", marginBottom: 6 }}>
                Glissez votre fichier CSV ici
              </div>
              <div style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
                ou cliquez pour parcourir · Format : UTF-8
              </div>
              <button onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 10,
                  padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  color: "#00853E" }}>
                ⬇ Télécharger le template CSV
              </button>
            </div>

            {parseError && (
              <div style={{ background: "#fee2e2", borderRadius: 12, padding: "14px 18px",
                color: "#dc2626", fontWeight: 600, fontSize: 14 }}>
                ⚠ {parseError}
              </div>
            )}

            {/* Format attendu */}
            <div style={{ background: "white", borderRadius: 16, padding: 20,
              border: "1.5px solid #e2e8f0" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#0f172a" }}>
                Format CSV attendu
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Colonne","Type","Obligatoire","Exemple"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left",
                          fontWeight: 700, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["name","Texte","✅","Smartphone Samsung A55"],
                      ["category","Texte (liste)","✅","Électronique"],
                      ["price","Nombre (EUR)","✅","189.99"],
                      ["original_price","Nombre (EUR)","—","219.99"],
                      ["stock","Entier","—","24"],
                      ["description","Texte","—","Écran AMOLED..."],
                      ["image_url","URL","—","https://..."],
                      ["vendor_name","Texte","—","Ma Boutique"],
                    ].map(([col, type, req, ex]) => (
                      <tr key={col} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "7px 12px", fontFamily: "monospace",
                          color: "#00853E", fontWeight: 700 }}>{col}</td>
                        <td style={{ padding: "7px 12px", color: "#475569" }}>{type}</td>
                        <td style={{ padding: "7px 12px", textAlign: "center" }}>{req}</td>
                        <td style={{ padding: "7px 12px", color: "#64748b", fontStyle: "italic" }}>
                          {ex}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
                Catégories acceptées : {CATEGORIES.join(" · ")}
              </div>
            </div>
          </div>
        )}

        {/* ════ ÉTAPE 2 : REVIEW ════ */}
        {step === "review" && (
          <div>
            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <Stat label="Total" value={stats.total} color="#475569" />
              <Stat label="Valides" value={stats.valid} color="#16a34a" />
              <Stat label="Erreurs" value={stats.errors} color="#dc2626" />
              <Stat label="Importés" value={stats.imported} color="#2563eb" />
              <div style={{ flex: 1 }} />
              {/* Actions */}
              <button onClick={() => { setRows([]); setStep("upload"); }}
                style={{ alignSelf: "center", background: "white", border: "1.5px solid #e2e8f0",
                  borderRadius: 10, padding: "10px 16px", cursor: "pointer",
                  fontWeight: 600, fontSize: 13, color: "#64748b" }}>
                ← Nouveau fichier
              </button>
              <button onClick={generateSQL}
                style={{ alignSelf: "center", background: "#f1f5f9", border: "none",
                  borderRadius: 10, padding: "10px 16px", cursor: "pointer",
                  fontWeight: 700, fontSize: 13, color: "#00853E" }}>
                ⬇ Exporter SQL
              </button>
              <button
                disabled={importing || stats.valid === 0}
                onClick={importAll}
                style={{ alignSelf: "center",
                  background: importing || stats.valid === 0 ? "#94a3b8" : "#00853E",
                  color: "white", border: "none", borderRadius: 10,
                  padding: "10px 20px", cursor: importing ? "not-allowed" : "pointer",
                  fontWeight: 800, fontSize: 14 }}>
                {importing ? `Import… ${progress}%` : `▶ Importer ${stats.valid} produit${stats.valid > 1 ? "s" : ""}`}
              </button>
            </div>

            {/* Barre de progression */}
            {importing && (
              <div style={{ background: "white", borderRadius: 12, padding: 16,
                marginBottom: 16, border: "1.5px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#475569" }}>
                  <span>Importation en cours…</span>
                  <span>{progress}%</span>
                </div>
                <div style={{ background: "#f1f5f9", borderRadius: 99, height: 8 }}>
                  <div style={{ background: "#00853E", height: 8, borderRadius: 99,
                    width: `${progress}%`, transition: "width .3s" }} />
                </div>
              </div>
            )}

            {/* Filtres */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[["all","Tous"], ["valid","Valides"], ["error","Erreurs"], ["imported","Importés"]]
                .map(([val, label]) => (
                  <button key={val} onClick={() => setFilter(val)}
                    style={{ background: filter === val ? "#00853E" : "white",
                      color: filter === val ? "white" : "#475569",
                      border: "1.5px solid " + (filter === val ? "#00853E" : "#e2e8f0"),
                      borderRadius: 8, padding: "6px 14px", fontWeight: 700,
                      fontSize: 12, cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
            </div>

            {/* Table */}
            <div style={{ background: "white", borderRadius: 16, overflow: "hidden",
              border: "1.5px solid #e2e8f0" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["#","Statut","Nom","Catégorie","Prix (FCFA)","Stock","Erreurs",""].map((h) => (
                        <th key={h} style={{ padding: "12px 14px", textAlign: "left",
                          fontWeight: 700, color: "#475569", borderBottom: "1px solid #e2e8f0",
                          whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <>
                        <tr key={row._id}
                          style={{ borderBottom: "1px solid #f1f5f9",
                            background: editingId === row._id ? "#fffbeb" : "white" }}>
                          <td style={{ padding: "10px 14px", color: "#94a3b8",
                            fontFamily: "monospace", fontSize: 11 }}>
                            {row._rowNum}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <Badge status={row._status} />
                          </td>

                          {editingId === row._id ? (
                            <>
                              <td style={{ padding: "6px 8px" }}>
                                <input value={editBuf.name}
                                  onChange={(e) => setEditBuf({ ...editBuf, name: e.target.value })}
                                  style={{ width: 160, padding: "5px 8px", borderRadius: 6,
                                    border: "1.5px solid #e2e8f0", fontSize: 12 }} />
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <select value={editBuf.category}
                                  onChange={(e) => setEditBuf({ ...editBuf, category: e.target.value })}
                                  style={{ padding: "5px 8px", borderRadius: 6,
                                    border: "1.5px solid #e2e8f0", fontSize: 12 }}>
                                  <option value="">—</option>
                                  {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <input value={editBuf.price} type="number"
                                  onChange={(e) => setEditBuf({ ...editBuf, price: e.target.value })}
                                  style={{ width: 80, padding: "5px 8px", borderRadius: 6,
                                    border: "1.5px solid #e2e8f0", fontSize: 12 }} />
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <input value={editBuf.stock} type="number"
                                  onChange={(e) => setEditBuf({ ...editBuf, stock: e.target.value })}
                                  style={{ width: 60, padding: "5px 8px", borderRadius: 6,
                                    border: "1.5px solid #e2e8f0", fontSize: 12 }} />
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: "10px 14px", fontWeight: 600,
                                color: "#0f172a", maxWidth: 200, overflow: "hidden",
                                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {row.name || <span style={{ color: "#dc2626" }}>—</span>}
                              </td>
                              <td style={{ padding: "10px 14px", color: "#475569" }}>
                                {row.category || <span style={{ color: "#dc2626" }}>—</span>}
                              </td>
                              <td style={{ padding: "10px 14px", fontWeight: 700,
                                color: "#00853E", whiteSpace: "nowrap" }}>
                                {fmtFcfa(row.price)}
                              </td>
                              <td style={{ padding: "10px 14px", color: "#475569" }}>
                                {row.stock || 0}
                              </td>
                            </>
                          )}

                          <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                            {row._errors?.length > 0 && (
                              <div style={{ fontSize: 11, color: "#dc2626" }}>
                                {row._errors.map((e, i) => (
                                  <div key={i}>• {e}</div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            {row._status !== "imported" && (
                              <>
                                {editingId === row._id ? (
                                  <>
                                    <button onClick={() => saveEdit(row._id)}
                                      style={{ background: "#00853E", color: "white",
                                        border: "none", borderRadius: 6, padding: "5px 10px",
                                        cursor: "pointer", fontWeight: 700, fontSize: 12,
                                        marginRight: 4 }}>
                                      ✓
                                    </button>
                                    <button onClick={() => setEditingId(null)}
                                      style={{ background: "#f1f5f9", color: "#475569",
                                        border: "none", borderRadius: 6, padding: "5px 10px",
                                        cursor: "pointer", fontSize: 12 }}>
                                      ✕
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => startEdit(row)}
                                      style={{ background: "#f1f5f9", border: "none",
                                        borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                                        fontSize: 12, marginRight: 4, color: "#475569" }}>
                                      ✏
                                    </button>
                                    <button onClick={() => deleteRow(row._id)}
                                      style={{ background: "#fee2e2", border: "none",
                                        borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                                        fontSize: 12, color: "#dc2626" }}>
                                      🗑
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      </>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: 32, textAlign: "center",
                          color: "#94a3b8", fontSize: 14 }}>
                          Aucun produit dans ce filtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════ ÉTAPE 3 : DONE ════ */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "60px 24px" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <div style={{ fontWeight: 800, fontSize: 28, color: "#0f172a", marginBottom: 8 }}>
              Import terminé
            </div>
            <div style={{ color: "#64748b", fontSize: 16, marginBottom: 32 }}>
              <strong style={{ color: "#16a34a" }}>{stats.imported}</strong> produit
              {stats.imported > 1 ? "s" : ""} ajouté{stats.imported > 1 ? "s" : ""} au catalogue.
              {stats.errors > 0 && (
                <> <strong style={{ color: "#dc2626" }}>{stats.errors}</strong> erreur
                {stats.errors > 1 ? "s" : ""} à corriger.</>
              )}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {stats.errors > 0 && (
                <button onClick={() => { setStep("review"); setFilter("error"); }}
                  style={{ background: "#fee2e2", color: "#dc2626", border: "none",
                    borderRadius: 12, padding: "12px 24px", fontWeight: 700,
                    fontSize: 14, cursor: "pointer" }}>
                  Corriger les erreurs
                </button>
              )}
              <button onClick={generateSQL}
                style={{ background: "#f1f5f9", color: "#00853E", border: "none",
                  borderRadius: 12, padding: "12px 24px", fontWeight: 700,
                  fontSize: 14, cursor: "pointer" }}>
                ⬇ Exporter SQL
              </button>
              <button onClick={() => { setRows([]); setStep("upload"); setProgress(0); }}
                style={{ background: "#00853E", color: "white", border: "none",
                  borderRadius: 12, padding: "12px 24px", fontWeight: 700,
                  fontSize: 14, cursor: "pointer" }}>
                Nouveau fichier
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
