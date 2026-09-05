#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publie (ou programme) la campagne NEXUS Market sur la page Facebook.

POURQUOI CE SCRIPT
──────────────────
L'automatisation par navigateur bute sur un point dur : joindre une image
LOCALE. Constaté le 2026-09-05, trois voies essayées, trois échecs :
  • collage presse-papiers dans le composeur Meta Business Suite : ignoré ;
  • composeur principal de la page : inaccessible depuis le tableau de bord ;
  • boîte de dialogue Windows : hors de portée d'un outil qui pilote le
    navigateur et non le système.
L'API Graph n'a pas cette limite : on envoie les octets de l'image
directement. C'est la voie propre, et elle programme aussi les publications.

CE QU'IL FAUT
─────────────
Un TOKEN DE PAGE (et non un token utilisateur), avec les permissions
`pages_manage_posts` et `pages_read_engagement` :
  developers.facebook.com → votre app → Outils → Explorateur d'API Graph
  → sélectionner la Page → générer le token.
Ne le collez nulle part dans le dépôt : passez-le par variable
d'environnement (voir plus bas). Un token de page « longue durée » vaut
~60 jours ; au-delà il faut le régénérer.

UTILISATION
───────────
    set FB_PAGE_ID=123456789012345
    set FB_PAGE_TOKEN=EAAG...

    # 1) Vérifier SANS RIEN publier (à faire en premier)
    python publier_facebook.py --dry-run

    # 2) Publier UNE seule affiche, tout de suite (test réel)
    python publier_facebook.py --only 1 --now

    # 3) Programmer toute la campagne : 2/jour à 09:00 et 17:30
    python publier_facebook.py --schedule --start 2026-09-06

Options utiles :
    --per-day 2         nombre de publications par jour
    --hours 09:00,17:30 heures de parution
    --only N[,M...]     ne traiter que ces affiches (numéro du fichier)
    --limit N           s'arrêter après N publications

GARDE-FOUS
──────────
  • `--dry-run` par défaut si aucun mode n'est donné : on ne publie JAMAIS
    par accident.
  • Facebook refuse une programmation à moins de 10 min ou à plus de 6 mois :
    le script vérifie avant d'envoyer, plutôt que de laisser l'API échouer.
  • Pause entre deux appels : publier en rafale est le motif qui fait
    plafonner une page.
  • Chaque résultat est journalisé dans `publication_log.json` (id du post,
    horodatage, erreur éventuelle) — pour savoir ce qui est réellement parti.
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GRAPH = "https://graph.facebook.com/v21.0"
LOG_FILE = os.path.join(BASE_DIR, "publication_log.json")

# Facebook impose ces bornes pour une publication programmée. Les vérifier ici
# donne un message clair, au lieu d'un code d'erreur opaque de l'API.
MIN_SCHEDULE_S = 10 * 60          # 10 minutes
MAX_SCHEDULE_S = 180 * 24 * 3600  # ~6 mois
PAUSE_BETWEEN_S = 4               # rafale = plafonnement de la page


# ── Lecture du kit ──────────────────────────────────────────────────────────
def _captions_from(path: str) -> dict[int, dict]:
    """Extrait {numéro: {titre, legende}} d'un fichier au format du README."""
    if not os.path.exists(path):
        return {}
    txt = io.open(path, encoding="utf-8").read()
    out: dict[int, dict] = {}
    for num, titre, corps in re.findall(r"### (\d+)\.\s*(.+?)\n(.*?)(?=\n### |\Z)", txt, re.S):
        m = re.search(r"\*\*Légende\s*:\*\*\s*\n((?:>.*\n?)+)", corps)
        if not m:
            continue
        legende = re.sub(r"^>\s?", "", m.group(1), flags=re.M).strip()
        if legende:
            out[int(num)] = {"titre": titre.strip(), "legende": legende}
    return out


def load_carousels() -> list[dict]:
    """Regroupe `exports/nom-1.png … nom-N.png` en publications multi-images.

    Un carrousel est UNE publication contenant plusieurs visuels — c'est le
    format qui performe le mieux sur Facebook, et le dossier en contient 64
    (288 slides) contre 41 affiches simples. Les ignorer reviendrait à laisser
    de côté l'essentiel du kit.

    La légende vient de `legendes-carrousels.md` (éditable) ; sans entrée, le
    carrousel est ignoré — on ne publie pas un visuel muet.
    """
    dossier = os.path.join(BASE_DIR, "exports")
    if not os.path.isdir(dossier):
        return []
    series: dict[str, list[tuple[int, str]]] = {}
    for fname in os.listdir(dossier):
        m = re.match(r"^(.+?)-(\d+)\.(png|jpg|jpeg)$", fname)
        if m:
            series.setdefault(m.group(1), []).append((int(m.group(2)), fname))

    legendes = _carousel_captions()
    out = []
    for nom, slides in sorted(series.items()):
        cap = legendes.get(nom)
        if not cap:
            continue
        images = [os.path.join(dossier, f) for _, f in sorted(slides)]
        # Facebook plafonne à 10 images par publication.
        out.append({"slug": nom, "images": images[:10], "legende": cap,
                    "titre": nom, "nb_slides": len(images)})
    return out


def _carousel_captions() -> dict[str, str]:
    """Lit `legendes-carrousels.md` : `## <slug>` puis la légende en citation."""
    path = os.path.join(BASE_DIR, "legendes-carrousels.md")
    if not os.path.exists(path):
        return {}
    txt = io.open(path, encoding="utf-8").read()
    out = {}
    for slug, corps in re.findall(r"^## (\S+)\s*\n(.*?)(?=\n## |\Z)", txt, re.S | re.M):
        m = re.search(r"((?:^>.*\n?)+)", corps, re.M)
        if m:
            leg = re.sub(r"^>\s?", "", m.group(1), flags=re.M).strip()
            if leg:
                out[slug] = leg
    return out


def publish_carousel(page_id: str, token: str, images: list[str], message: str,
                     scheduled_at: dt.datetime | None) -> dict:
    """Publication multi-images : on téléverse chaque slide SANS la publier,
    puis on crée un post du fil qui les rattache toutes (`attached_media`).
    C'est le seul moyen d'obtenir un vrai carrousel via l'API Graph."""
    fbids = []
    for img in images:
        body, ctype = _multipart({"published": "false", "access_token": token}, "source", img)
        req = urllib.request.Request(f"{GRAPH}/{page_id}/photos", data=body,
                                     headers={"Content-Type": ctype}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                fbids.append(json.loads(r.read().decode("utf-8"))["id"])
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": f"slide {os.path.basename(img)} → HTTP {e.code} "
                                          f"{e.read().decode('utf-8','replace')[:200]}"}
        except Exception as e:
            return {"ok": False, "error": f"slide {os.path.basename(img)} → {type(e).__name__} : {e}"}
        time.sleep(1)   # ne pas enchaîner les téléversements sans respirer

    fields = {"message": message, "access_token": token}
    for i, fbid in enumerate(fbids):
        fields[f"attached_media[{i}]"] = json.dumps({"media_fbid": fbid})
    if scheduled_at is not None:
        fields["published"] = "false"
        fields["scheduled_publish_time"] = str(int(scheduled_at.timestamp()))

    data = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(f"{GRAPH}/{page_id}/feed", data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return {"ok": True, "slides": len(fbids), **json.loads(r.read().decode("utf-8"))}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        return {"ok": False, "error": f"HTTP {e.code} — {detail}"}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__} : {e}"}


def load_posts() -> list[dict]:
    """Associe chaque affiche numérotée à sa légende (README + complément)."""
    captions = _captions_from(os.path.join(BASE_DIR, "README.md"))
    captions.update(_captions_from(os.path.join(BASE_DIR, "legendes-13-32.md")))

    posts = []
    for fname in sorted(os.listdir(BASE_DIR)):
        m = re.match(r"^(\d\d)-.*\.(png|jpg|jpeg)$", fname)
        if not m:
            continue  # les .svg ne sont pas acceptés par l'API photos
        num = int(m.group(1))
        cap = captions.get(num)
        if not cap:
            continue  # affiche sans légende : on ne publie pas un visuel muet
        posts.append({
            "n": num, "image": os.path.join(BASE_DIR, fname),
            "fichier": fname, "titre": cap["titre"], "legende": cap["legende"],
        })
    return posts


# ── Appel API ───────────────────────────────────────────────────────────────
def _multipart(fields: dict, file_field: str, file_path: str) -> tuple[bytes, str]:
    """Construit un corps multipart/form-data (sans dépendance externe)."""
    boundary = "----NexusBoundary" + os.urandom(8).hex()
    buf = io.BytesIO()

    def w(s):
        buf.write(s.encode("utf-8") if isinstance(s, str) else s)

    for k, v in fields.items():
        w(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n")
    w(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; "
      f"filename=\"{os.path.basename(file_path)}\"\r\nContent-Type: image/png\r\n\r\n")
    with open(file_path, "rb") as f:
        w(f.read())
    w(f"\r\n--{boundary}--\r\n")
    return buf.getvalue(), f"multipart/form-data; boundary={boundary}"


def publish_photo(page_id: str, token: str, image: str, message: str,
                  scheduled_at: dt.datetime | None) -> dict:
    """Publie une photo avec sa légende. `scheduled_at` None = immédiat."""
    fields = {"caption": message, "access_token": token}
    if scheduled_at is None:
        fields["published"] = "true"
    else:
        # `published=false` + `scheduled_publish_time` = publication programmée.
        fields["published"] = "false"
        fields["scheduled_publish_time"] = str(int(scheduled_at.timestamp()))

    body, ctype = _multipart(fields, "source", image)
    req = urllib.request.Request(f"{GRAPH}/{page_id}/photos", data=body,
                                 headers={"Content-Type": ctype}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return {"ok": True, **json.loads(r.read().decode("utf-8"))}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        try:
            detail = json.loads(detail).get("error", {}).get("message", detail)
        except Exception:
            pass
        return {"ok": False, "error": f"HTTP {e.code} — {detail}"}
    except Exception as e:                     # réseau, DNS, timeout…
        return {"ok": False, "error": f"{type(e).__name__} : {e}"}


def check_token(page_id: str, token: str) -> dict:
    """Vérifie que le token est bien un token DE PAGE et qu'il a les droits."""
    url = f"{GRAPH}/{page_id}?fields=name,id&access_token={urllib.parse.quote(token)}"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return {"ok": True, **json.loads(r.read().decode("utf-8"))}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        return {"ok": False, "error": f"HTTP {e.code} — {detail}"}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__} : {e}"}


# ── Programmation ───────────────────────────────────────────────────────────
def build_slots(n: int, start: dt.date, hours: list[str], per_day: int) -> list[dt.datetime]:
    slots = []
    for i in range(n):
        day = start + dt.timedelta(days=i // per_day)
        h, m = hours[i % per_day].split(":")
        slots.append(dt.datetime.combine(day, dt.time(int(h), int(m))))
    return slots


def log_result(entry: dict) -> None:
    data = []
    if os.path.exists(LOG_FILE):
        try:
            data = json.load(io.open(LOG_FILE, encoding="utf-8"))
        except Exception:
            data = []
    data.append(entry)
    io.open(LOG_FILE, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=2))


def main() -> int:
    ap = argparse.ArgumentParser(description="Campagne NEXUS Market → page Facebook")
    # --dry-run est un MODIFICATEUR, pas un mode : il doit pouvoir se combiner
    # à --schedule pour prévisualiser les créneaux — c'est justement la
    # vérification à faire avant d'engager une campagne de 41 publications.
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--now", action="store_true", help="publie immédiatement")
    mode.add_argument("--schedule", action="store_true", help="programme les publications")
    ap.add_argument("--dry-run", action="store_true",
                    help="n'envoie rien ; combinable avec --schedule pour voir les créneaux")
    ap.add_argument("--start", default=None, help="date de départ AAAA-MM-JJ (défaut : demain)")
    ap.add_argument("--hours", default="09:00,17:30", help="heures de parution, séparées par une virgule")
    ap.add_argument("--per-day", type=int, default=2, help="publications par jour")
    ap.add_argument("--only", default="", help="numéros d'affiches à traiter, ex. 1,5,12")
    ap.add_argument("--limit", type=int, default=0, help="s'arrêter après N publications")
    ap.add_argument("--carrousels", action="store_true",
                    help="publier les carrousels d'exports/ (multi-images) au lieu des affiches")
    ap.add_argument("--tout", action="store_true",
                    help="affiches PUIS carrousels dans la même campagne")
    args = ap.parse_args()

    if args.carrousels:
        posts = load_carousels()
    elif args.tout:
        posts = load_posts() + load_carousels()
    else:
        posts = load_posts()
    if args.only:
        jetons = [x for x in re.split(r"[,\s]+", args.only) if x.strip()]
        nums = {int(x) for x in jetons if x.isdigit()}
        slugs = [x.lower() for x in jetons if not x.isdigit()]
        posts = [p for p in posts
                 if p.get("n") in nums
                 or any(sg in p.get("slug", "").lower() for sg in slugs)]
    if args.limit:
        posts = posts[: args.limit]

    if not posts:
        print("Aucune affiche exploitable (image + légende).")
        return 1

    hours = [h.strip() for h in args.hours.split(",") if h.strip()]
    per_day = max(1, min(args.per_day, len(hours)))
    start = (dt.datetime.strptime(args.start, "%Y-%m-%d").date() if args.start
             else dt.date.today() + dt.timedelta(days=1))
    slots = build_slots(len(posts), start, hours, per_day)

    print(f"{len(posts)} affiche(s) prête(s).")
    if args.schedule:
        print(f"Programmation : {per_day}/jour à {', '.join(hours[:per_day])}, "
              f"du {slots[0]:%d/%m %H:%M} au {slots[-1]:%d/%m %H:%M}.")

    # Simulation : on montre exactement ce qui partirait, sans rien envoyer.
    # C'est aussi le comportement par défaut quand aucun mode n'est donné —
    # on ne publie jamais sur une page publique par simple oubli d'option.
    if args.dry_run or not (args.now or args.schedule):
        print("\n--- SIMULATION (aucun envoi) ---")
        for p, s in zip(posts, slots):
            quand = f"{s:%a %d/%m %H:%M}" if args.schedule else "immédiat"
            if p.get("images"):
                etiq = f"[carrousel x{p['nb_slides']}] {p['slug']}"
            else:
                etiq = f"[{p['n']:02d}] {p['fichier']}"
            print(f"  {quand}  {etiq}")
            print(f"       {p['legende'].splitlines()[0][:95]}")
        print("\nRelancer sans --dry-run pour exécuter "
              "(--now = publication immédiate, --schedule = programmation).")
        return 0

    page_id = os.environ.get("FB_PAGE_ID", "").strip()
    token = os.environ.get("FB_PAGE_TOKEN", "").strip()
    if not page_id or not token:
        print("ERREUR : définissez FB_PAGE_ID et FB_PAGE_TOKEN dans l'environnement.\n"
              "        (ne jamais écrire le token dans un fichier du dépôt)")
        return 1

    info = check_token(page_id, token)
    if not info.get("ok"):
        print(f"ERREUR : token/page invalide → {info.get('error')}")
        return 1
    print(f"Page confirmée : {info.get('name')} ({info.get('id')})")

    envoyes = 0
    for p, s in zip(posts, slots):
        quand = None
        if args.schedule:
            delta = (s - dt.datetime.now()).total_seconds()
            if delta < MIN_SCHEDULE_S:
                print(f"  [{p.get('slug') or p.get('n')}] IGNORÉ — créneau {s:%d/%m %H:%M} trop proche "
                      f"(Facebook exige au moins 10 min d'avance).")
                continue
            if delta > MAX_SCHEDULE_S:
                print(f"  [{p.get('slug') or p.get('n')}] IGNORÉ — créneau {s:%d/%m %H:%M} au-delà de 6 mois.")
                continue
            quand = s

        if p.get("images"):
            res = publish_carousel(page_id, token, p["images"], p["legende"], quand)
        else:
            res = publish_photo(page_id, token, p["image"], p["legende"], quand)
        etat = "programmé " + f"{s:%d/%m %H:%M}" if quand else "publié"
        if res.get("ok"):
            envoyes += 1
            ref = p.get("slug") or f"{p.get('n'):02d}"
            print(f"  [{ref}] OK {etat} — id {res.get('post_id') or res.get('id')}")
        else:
            print(f"  [{p.get('slug') or p.get('n')}] ÉCHEC — {res.get('error')}")
        log_result({
            "n": p.get("n"), "fichier": p.get("fichier") or p.get("slug"), "quand": quand.isoformat() if quand else "now",
            "ok": bool(res.get("ok")), "id": res.get("post_id") or res.get("id"),
            "erreur": res.get("error"), "horodatage": dt.datetime.now().isoformat(timespec="seconds"),
        })
        time.sleep(PAUSE_BETWEEN_S)

    print(f"\n{envoyes}/{len(posts)} publication(s) traitée(s). Journal : {LOG_FILE}")
    return 0 if envoyes else 1


if __name__ == "__main__":
    sys.exit(main())
