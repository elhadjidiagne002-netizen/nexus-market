# -*- coding: utf-8 -*-
"""Génère le PDF 'Défis juridiques — NEXUS Market'."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    HRFlowable, ListFlowable, ListItem, KeepTogether
)
from datetime import date

OUT = r"C:\Users\pheni\Downloads\nexus-market\NEXUS-Market_Defis-Juridiques.pdf"

# ── Palette NEXUS ───────────────────────────────────────────────────────────
GREEN   = colors.HexColor("#00853E")
GREEN_D = colors.HexColor("#006b31")
DARK    = colors.HexColor("#1f2937")
GREY    = colors.HexColor("#4b5563")
LIGHT   = colors.HexColor("#f3f4f6")
RED     = colors.HexColor("#b91c1c")
ORANGE  = colors.HexColor("#b45309")
YELLOW  = colors.HexColor("#a16207")
LINE    = colors.HexColor("#d1d5db")

styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, parent=styles["Normal"], **kw)

st_title   = S("t",  fontName="Helvetica-Bold", fontSize=26, textColor=GREEN_D, leading=30, spaceAfter=6)
st_sub     = S("s",  fontName="Helvetica", fontSize=12.5, textColor=GREY, leading=17)
st_h1      = S("h1", fontName="Helvetica-Bold", fontSize=15, textColor=colors.white, leading=19,
               backColor=GREEN, borderPadding=(6, 8, 6, 8), spaceBefore=16, spaceAfter=10, leftIndent=0)
st_h2      = S("h2", fontName="Helvetica-Bold", fontSize=12, textColor=GREEN_D, leading=15,
               spaceBefore=12, spaceAfter=4)
st_body    = S("b",  fontName="Helvetica", fontSize=9.7, textColor=DARK, leading=14, alignment=TA_JUSTIFY, spaceAfter=4)
st_li      = S("li", fontName="Helvetica", fontSize=9.5, textColor=DARK, leading=13.5, alignment=TA_LEFT)
st_small   = S("sm", fontName="Helvetica-Oblique", fontSize=8.5, textColor=GREY, leading=12)
st_cell    = S("c",  fontName="Helvetica", fontSize=8.3, textColor=DARK, leading=11)
st_cellb   = S("cb", fontName="Helvetica-Bold", fontSize=8.3, textColor=DARK, leading=11)
st_cellh   = S("ch", fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.white, leading=11)
st_badge   = S("bd", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.white, leading=13,
               backColor=DARK, borderPadding=(3, 6, 3, 6))

def badge(txt, color):
    return ParagraphStyle("x", parent=st_badge, backColor=color)

def P(t, s=st_body):  return Paragraph(t, s)
def hr():             return HRFlowable(width="100%", thickness=0.6, color=LINE, spaceBefore=6, spaceAfter=6)

def bullets(items, style=st_li):
    return ListFlowable(
        [ListItem(Paragraph(i, style), leftIndent=6, value="•") for i in items],
        bulletType="bullet", bulletColor=GREEN, start="•", leftIndent=12, spaceBefore=2, spaceAfter=4
    )

def tier_heading(label, color, title):
    tbl = Table([[Paragraph(label, badge(label, color)), Paragraph(title, st_h2)]],
                colWidths=[26*mm, 145*mm])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING", (0,0), (-1,-1), 2),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
    ]))
    return tbl

def data_table(header, rows, colw):
    data = [[Paragraph(h, st_cellh) for h in header]]
    for r in rows:
        data.append([Paragraph(c, st_cellb if j == 0 else st_cell) for j, c in enumerate(r)])
    t = Table(data, colWidths=colw, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), GREEN),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
        ("GRID", (0,0), (-1,-1), 0.4, LINE),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    return t

def module(title, items):
    block = [Paragraph(title, st_h2), bullets(items)]
    return KeepTogether(block)

# ── Pagination ──────────────────────────────────────────────────────────────
def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5)
    canvas.line(20*mm, 14*mm, 190*mm, 14*mm)
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(GREY)
    canvas.drawString(20*mm, 9*mm, "NEXUS Market — Defis juridiques (document de travail, non contractuel)")
    canvas.drawRightString(190*mm, 9*mm, "Page %d" % doc.page)
    canvas.restoreState()

story = []

# ── PAGE DE GARDE ───────────────────────────────────────────────────────────
story += [Spacer(1, 55*mm)]
bar = Table([[""]], colWidths=[170*mm], rowHeights=[3])
bar.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), GREEN)]))
story += [bar, Spacer(1, 10)]
story += [P("NEXUS Market", st_title)]
story += [P("Defis juridiques a relever pour la perennite du projet", st_sub)]
story += [Spacer(1, 6)]
story += [P("Cartographie complete des risques reglementaires — Senegal / zone UEMOA", st_sub)]
story += [Spacer(1, 14)]
story += [P("Marketplace B2B/B2C · paiements mobiles & carte · livraison a la demande · "
            "stories, troc, annonces, chat, fidelite, ambassadeurs, IA.", st_small)]
story += [Spacer(1, 60*mm)]
meta = Table([
    ["Document", "Cartographie des risques juridiques — tous modules"],
    ["Perimetre", "Ensemble du projet NEXUS Market"],
    ["Etabli le", date.today().strftime("%d/%m/%Y")],
    ["Statut", "Document de travail interne"],
], colWidths=[35*mm, 135*mm])
meta.setStyle(TableStyle([
    ("FONT", (0,0), (0,-1), "Helvetica-Bold", 9),
    ("FONT", (1,0), (1,-1), "Helvetica", 9),
    ("TEXTCOLOR", (0,0), (0,-1), GREEN_D),
    ("TEXTCOLOR", (1,0), (1,-1), DARK),
    ("LINEBELOW", (0,0), (-1,-2), 0.4, LINE),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story += [meta]
story += [PageBreak()]

# ── AVERTISSEMENT ───────────────────────────────────────────────────────────
story += [Paragraph("Avertissement", st_h1)]
disc = Table([[Paragraph(
    "<b>Ce document n'est pas un avis juridique.</b> Il constitue une cartographie des risques "
    "destinee a structurer le travail avec un avocat senegalais specialise en droit du numerique "
    "et des affaires (Barreau de Dakar), ainsi qu'avec un expert-comptable. Les references legales "
    "citees doivent etre verifiees et actualisees par un professionnel habilite. Plusieurs risques "
    "identifies sont <b>existentiels</b> : ils peuvent entrainer la fermeture de la plateforme, des "
    "sanctions, ou engager la responsabilite personnelle du fondateur.", st_body)]],
    colWidths=[170*mm])
disc.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#fff7ed")),
    ("BOX", (0,0), (-1,-1), 0.8, ORANGE),
    ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
]))
story += [disc, Spacer(1, 10)]

# Légende des niveaux
story += [Paragraph("Echelle de gravite utilisee", st_h2)]
leg = Table([
    [Paragraph("NIVEAU 1", badge("NIVEAU 1", RED)), Paragraph("Existentiel — a regler avant de monter en charge ; peut fermer la plateforme ou engager la responsabilite personnelle.", st_cell)],
    [Paragraph("NIVEAU 2", badge("NIVEAU 2", ORANGE)), Paragraph("Important — conformite necessaire pour operer durablement et sereinement.", st_cell)],
    [Paragraph("NIVEAU 3", badge("NIVEAU 3", YELLOW)), Paragraph("Sectoriel / a surveiller — selon les modules actives et la croissance.", st_cell)],
], colWidths=[26*mm, 144*mm])
leg.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, LIGHT]),
    ("GRID", (0,0), (-1,-1), 0.4, LINE),
    ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story += [leg, Spacer(1, 8)]

# Alerte transversale
alert = Table([[Paragraph(
    "<b>Alerte prioritaire transversale.</b> Le depot de code semble <b>public sur GitHub</b> : "
    "le code source ET les secrets presents dans l'historique (cle VAPID, potentiellement la cle "
    "de service Supabase) seraient exposes. A traiter immediatement : passer le depot en prive et "
    "regenerer / purger tous les secrets. C'est a la fois une faille de securite et un manquement a "
    "l'obligation de securite des donnees personnelles.", st_body)]], colWidths=[170*mm])
alert.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#fef2f2")),
    ("BOX", (0,0), (-1,-1), 0.8, RED),
    ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
]))
story += [alert]
story += [PageBreak()]

# ── A. PILIERS TRANSVERSAUX ─────────────────────────────────────────────────
story += [Paragraph("A. Piliers transversaux (s'appliquent a tout le projet)", st_h1)]
story += [P("Ces obligations concernent l'ensemble de NEXUS, independamment du module. Elles forment "
            "le socle de conformite a securiser en priorite.")]
story += [Spacer(1, 4)]
pillars = [
    ["1. Existence legale", "OHADA (AUDCG, RCCM), NINEA", "Societe immatriculee ; a defaut, la responsabilite personnelle du fondateur couvre tout le reste."],
    ["2. Donnees personnelles", "Loi 2008-12 ; Commission de Protection des Donnees (CDP)", "Declaration prealable CDP, politique de confidentialite, droits d'acces / rectification / suppression / portabilite, registre des traitements, durees de conservation."],
    ["3. Hebergement hors Senegal", "Flux transfrontieres (loi 2008-12)", "Base de donnees hebergee en France (region eu-west-3) : transfert de donnees de citoyens senegalais a l'etranger => encadrement / autorisation CDP requis."],
    ["4. Paiements & fonds", "BCEAO — Instruction 008-05-2015 (monnaie electronique)", "Rester strictement adosse a des prestataires agrees (PayTech, PSP carte). Ne jamais detenir les fonds en nom propre : l'escrow declenche un agrement d'etablissement de paiement."],
    ["5. Protection du consommateur", "Droit senegalais de la consommation", "Information precontractuelle, retractation, garanties, remboursements, interdiction des clauses abusives."],
    ["6. Transactions electroniques", "Loi 2008-08", "Validite du contrat en ligne, identification du vendeur, confirmation de commande, archivage, facturation electronique."],
    ["7. Securite & cybercriminalite", "Loi 2008-11", "Obligation de securite : les failles connues (cle VAPID fuitee, RLS a appliquer, depot public) constituent aussi un risque juridique."],
    ["8. Fiscalite", "Code General des Impots ; TVA 18% ; fiscalite du numerique", "Immatriculation fiscale, TVA sur les commissions/services, declarations, retenues eventuelles."],
    ["9. Anti-blanchiment (LBC/FT)", "CENTIF ; cadre UEMOA", "Selon les volumes : obligations de vigilance / KYC et declarations de soupcon."],
    ["10. Controle des changes", "Reglementation UEMOA", "Paiements carte internationaux (EUR via Stripe) : rapatriement et conversion par les circuits autorises."],
    ["11. Marque & nom", "OAPI (Accord de Bangui)", "Depot de la marque NEXUS Market ; verifier les anteriorites (terme 'Nexus' tres courant)."],
]
story += [data_table(["Pilier", "Cadre Senegal / UEMOA", "Ce que cela impose"], pillars,
                     [40*mm, 48*mm, 82*mm])]
story += [PageBreak()]

# ── B. MODULE PAR MODULE ────────────────────────────────────────────────────
story += [Paragraph("B. Analyse module par module (tout le projet)", st_h1)]
story += [P("Chaque fonctionnalite de NEXUS ajoute des obligations specifiques. Ce balayage vise "
            "l'exhaustivite pour qu'aucun module ne soit oublie.")]
story += [Spacer(1, 4)]

mods = [
    ("Marketplace (produits, vendeurs, acheteurs)", [
        "Relation plateforme / vendeurs professionnels : equite, transparence du classement, motivation des suspensions de compte.",
        "Responsabilite sur les produits tiers (contrefacons, produits dangereux ou interdits) : statut d'hebergeur conditionne a un dispositif de signalement et de retrait.",
        "Reversements aux vendeurs (payout) : positionne la plateforme comme intermediaire payeur (voir pilier 4).",
    ]),
    ("Annonces Express (sans inscription)", [
        "Module le plus expose : aucune tracabilite de l'annonceur => arnaques, contrefacons, produits illicites.",
        "Sans identification, perte du benefice du statut d'hebergeur. Conserver des logs d'identification + moderation.",
    ]),
    ("Troc (echange sans argent)", [
        "Contrat de troc : obligations reciproques et garanties. Fiscalite possible si l'activite devient reguliere / commerciale.",
        "Memes risques de contenu illicite que la marketplace.",
    ]),
    ("Stories (videos produit, shoppable)", [
        "Droit a l'image des personnes filmees ; droits d'auteur sur la musique ; protection des mineurs ; moderation.",
        "Caractere shoppable = publicite : obligation d'identification du contenu commercial.",
    ]),
    ("Coursier a la demande", [
        "Risque de requalification en contrat de travail (Code du travail ; IPRES / Caisse de Securite Sociale).",
        "Assurance responsabilite civile (accidents, dommages aux tiers) ; autorisations de transport ; GPS = donnee sensible.",
    ]),
    ("Chat public communautaire", [
        "Forte responsabilite sur le contenu : diffamation, harcelement, haine, coordination d'actes illicites, protection des mineurs.",
        "Moderation + signalement + conservation des logs indispensables.",
    ]),
    ("Avis (verifies + video)", [
        "Faux avis = pratique commerciale trompeuse ; diffamation possible d'un vendeur ; droit a l'image dans les avis video.",
        "Le label 'verifie' engage la plateforme sur sa veracite.",
    ]),
    ("Points de fidelite & recompenses", [
        "Avantage a valeur quasi-monetaire : encadrement des promotions, regles d'expiration (droit conso), comptabilisation.",
        "Eviter toute assimilation a un instrument de paiement.",
    ]),
    ("Coupons / Flash sales / Boost paye", [
        "Faux rabais : le pourcentage de reduction doit reposer sur un prix de reference reel.",
        "Boost / classement paye : obligation de signaler clairement le caractere sponsorise d'un placement.",
    ]),
    ("AdSense / Campagnes annonceurs", [
        "Droit de la publicite (loyaute, distinction pub / contenu) ; respect des CGU Google AdSense ; contrats annonceurs ; fiscalite des revenus publicitaires.",
    ]),
    ("Programme Ambassadeur (parrainage)", [
        "Risque de vente pyramidale si la remuneration du recrutement prime sur la vente reelle (interdit).",
        "Transparence de l'influence marketing + fiscalite des commissions versees.",
    ]),
    ("Insurance leads (assurance)", [
        "Intermediation en assurance = Code CIMA : agrement obligatoire. A ne pas activer sans cadrage prealable.",
    ]),
    ("Local & Elevage (animaux / agro)", [
        "Reglementation sanitaire et veterinaire, tracabilite, hygiene alimentaire, especes protegees.",
    ]),
    ("NexusVox / Accessibilite / Tutoriels (public analphabete)", [
        "Public vulnerable : devoir de protection renforce ; risque de vice du consentement / abus de faiblesse sur des transactions financieres.",
        "Recherche vocale = enregistrement de la voix => donnee potentiellement biometrique / sensible (consentement specifique).",
    ]),
    ("Intelligence artificielle (extraction produit, resumes)", [
        "Responsabilite du contenu genere (descriptions / prix inexacts = information trompeuse au sens du droit conso).",
        "Cle d'API exposee cote navigateur : a deplacer cote serveur.",
    ]),
    ("Notifications SMS / WhatsApp / Push / Email", [
        "Opt-in obligatoire, droit d'opposition, anti-spam ; regulation ARTP.",
        "WhatsApp via API non officielle (Green API) : risque de violation des CGU Meta => bannissement du numero.",
    ]),
    ("Application Android / PWA (Google Play)", [
        "Politiques Google Play (declaration 'Securite des donnees', politique de confidentialite obligatoire).",
        "Gestion du keystore de signature (sa perte empeche toute mise a jour) ; domaine .sn via le NIC Senegal.",
    ]),
]
for title, items in mods:
    story += [module(title, items)]

story += [PageBreak()]

# ── C. ANGLES MOINS EVIDENTS ────────────────────────────────────────────────
story += [Paragraph("C. Angles moins evidents a ne pas manquer", st_h1)]
story += [bullets([
    "<b>Donnees hebergees en France</b> : transfert international encadre par la CDP.",
    "<b>Depot GitHub public</b> : exposition du code source et des secrets de l'historique.",
    "<b>Public vulnerable (analphabetes) + voix</b> : devoir de protection renforce et donnees sensibles.",
    "<b>Transparence du Boost</b> : tout classement paye doit etre signale comme tel.",
    "<b>Faux rabais</b> : le prix de reference doit etre reel et documente.",
    "<b>IA</b> : exactitude des informations generees + protection des cles d'API.",
    "<b>Mineurs</b> : les CGU exigent 18+ ; prevoir une verification reelle de l'age.",
    "<b>Relation equitable avec les vendeurs pros</b> : suspensions motivees, classement transparent.",
], st_li)]
story += [Spacer(1, 8)]

# ── D. FEUILLE DE ROUTE ─────────────────────────────────────────────────────
story += [Paragraph("D. Feuille de route 'survie' (priorisee)", st_h1)]

story += [tier_heading("URGENT", RED, "Sous quelques jours — risques neutralisables techniquement")]
story += [bullets([
    "Passer le depot GitHub en prive + purge / rotation des secrets (cle VAPID, cle de service).",
    "Couper le scraping de contenu Amazon / Jumia (risque de contrefacon).",
    "Deplacer les cles sensibles (IA, services) cote serveur uniquement.",
    "Appliquer les policies RLS Supabase (failles connues).",
], st_li)]

story += [tier_heading("SEMAINES", ORANGE, "Court terme — avec avocat et expert-comptable")]
story += [bullets([
    "Immatriculation de la societe (RCCM / NINEA) si non faite ; rendez-vous avocat numerique a Dakar.",
    "Declaration CDP + encadrement du transfert de donnees vers la France.",
    "CGU / CGV / politique de confidentialite auditees (consommateur, hebergeur, signalement & retrait).",
    "Cadrage des paiements avec PayTech / PSP (qui detient juridiquement les fonds).",
], st_li)]

story += [tier_heading("MOIS", YELLOW, "Moyen terme — structuration")]
story += [bullets([
    "Contrats coursiers + assurance responsabilite civile ; contrats annonceurs / vendeurs.",
    "Cadrage du programme Ambassadeur (anti-pyramidal) ; depot de la marque a l'OAPI.",
    "Processus de moderation / signalement (Annonces, Chat, Stories, Avis).",
    "Geler les modules Assurance et Elevage tant qu'ils ne sont pas juridiquement cadres.",
], st_li)]

story += [Spacer(1, 10)]
story += [hr()]
story += [P("Prochaines actions techniques mobilisables immediatement (a portee juridique directe) : "
            "depot prive + rotation des secrets ; suppression du scraper ; cles IA cote serveur ; "
            "application de la RLS ; briques de conformite donnees (export et suppression de compte, "
            "consentement, signalement & retrait).", st_small)]

# ── BUILD ───────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm,
    title="NEXUS Market - Defis juridiques", author="NEXUS Market",
)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("PDF genere :", OUT)
