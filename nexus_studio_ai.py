#!/usr/bin/env python3
"""
Studio E-commerce Pro+ AI — Pipeline avancé de traitement d'images produit
pour NEXUS Market (Dakar, Sénégal).

Fonctionnalités principales :
- Traitement par lot EN PARALLÈLE (pool de threads configurable)
- Suppression de fond IA (rembg)
- Presets marketplace (Amazon, Shopify, Etsy, Instagram, eBay) + presets
  personnalisés sauvegardés sur disque
- Réglages fins : couleur de fond, marge, ombre portée, contraste/luminosité,
  filigrane (texte, opacité, position)
- Statuts visuels par image (en attente / en cours / succès / échec) + réessai
  des échecs en un clic
- Persistance des réglages entre les sessions (QSettings)
- Aperçu avant / après, glisser-déposer, menu contextuel, raccourcis clavier
- Export configurable (format, qualité, nommage) + rapport CSV
- Interface moderne (thème sombre) avec gestion d'erreurs robuste

Nouveautés IA (v5.0) :
- 🤖 Retouche automatique (exposition, contraste, netteté, réduction de bruit)
- 🔍 Agrandissement IA (upscale) — Real-ESRGAN si installé, sinon repli LANCZOS
  + renforcement de netteté, utile pour les photos produit prises au téléphone
- ✍️ Génération automatique de fiche produit (titre, description, catégorie,
  tags) via l'API Anthropic (Claude), adaptée au marché de Dakar / FCFA
- 🚀 Upload direct vers Supabase Storage (NEXUS Market) — automatique après
  traitement ou manuel par image, avec lien public copiable

Retouche photo pro (v6.0) :
- 🎨 Couleur avancée : saturation, balance des blancs (température/teinte),
  niveaux (point noir/blanc, gamma), hautes lumières/ombres séparées, style
  Couleur / Noir & blanc / Sépia
- 🖼 Effets & finition : vignette, flou d'arrière-plan façon bokeh (fond
  d'origine conservé)
- ✂️ Recadrage libre ou par ratio (1:1, 4:5, 4:3, 16:9) + redressement fin
  (rotation à l'angle près, pour aligner un horizon)
- 🩹 Retouche localisée : anti-tache (inpainting OpenCV si disponible, sinon
  repli Pillow), tampon de duplication, réduction des yeux rouges — avec
  aperçu en direct et annulation

Refonte de l'interface & workflow pro (v9.0) :
- 🗂 Panneau de réglages réorganisé en 7 onglets thématiques (Accueil, Fond
  & Canevas, Couleur & Lumière, Effets & Finition, Filigrane, IA, Export &
  NEXUS) au lieu d'une seule colonne de 18 blocs empilés
- 🧭 Mode Simple / Avancé (masque par défaut les réglages experts) et
  recherche de réglage (saute directement au bon onglet/bloc)
- 📦 Profils produit : combinaisons de réglages prêtes à l'emploi par
  catégorie (Mode, Chaussures, Bijoux, Électronique, Cosmétique, Mobilier,
  Alimentation…)
- ⭐ Favoris de préréglages et 📊 tableau de bord (état de la file, derniers
  lots traités) dans l'onglet Accueil
- 🩺 Diagnostic qualité à la demande sur l'image sélectionnée, avec
  activation en un clic de la retouche IA si un souci est détecté
- 💾 Gestion de projet : enregistrer/ouvrir un lot (images + réglages
  complets) pour le reprendre plus tard
- 🧩 Deux nouveaux gabarits de collage : « Avant / Après » et
  « Catalogue 4 cases (2×2) » (idéal pour les variantes de couleur)

Dépendances : pip install PyQt5 pillow rembg requests --break-system-packages
Optionnel (meilleure qualité d'anti-tache) : pip install opencv-python-headless numpy
"""

from __future__ import annotations

import base64
import csv
import io
import json
import logging
import os
import math
import re
import shutil
import subprocess
import sys
import tempfile
import traceback
import uuid
from dataclasses import dataclass, asdict, fields, field
from pathlib import Path
from typing import Optional

from PyQt5.QtCore import Qt, QSize, QRect, QPointF, QObject, QRunnable, QThreadPool, QMutex, QMutexLocker, pyqtSignal, QSettings
from PyQt5.QtGui import QPixmap, QImage, QIcon, QColor, QDragEnterEvent, QDropEvent, QPainter, QBrush, QPen
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QFormLayout,
    QPushButton, QLabel, QFileDialog, QMessageBox, QListWidget, QListWidgetItem,
    QProgressBar, QComboBox, QSpinBox, QCheckBox, QSlider, QGroupBox,
    QColorDialog, QTextEdit, QSplitter, QStatusBar, QToolBar, QAction,
    QLineEdit, QDoubleSpinBox, QInputDialog, QMenu, QShortcut, QScrollArea,
    QTabWidget, QDialog, QDialogButtonBox, QGridLayout, QRadioButton,
    QButtonGroup, QAbstractItemView, QStackedWidget
)
from PyQt5.QtGui import QKeySequence

from PIL import Image, ImageEnhance, ImageFilter, ImageDraw, ImageFont, ImageOps

try:
    from rembg import remove as rembg_remove
except ImportError:  # rembg peut manquer tant que l'environnement n'est pas prêt
    rembg_remove = None



try:
    import requests
except ImportError:  # requests peut manquer tant que l'environnement n'est pas prêt
    requests = None

try:
    import cv2  # optionnel : améliore la qualité de l'anti-tache (inpainting réel)
    import numpy as np
except ImportError:  # repli automatique sur un algorithme 100% Pillow si absent
    cv2 = None
    np = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("EcommerceStudio")

CUSTOM_PRESETS_FILE = Path.home() / ".ecommerce_studio_presets.json"
CUSTOM_DESIGN_TEMPLATES_FILE = Path.home() / ".ecommerce_studio_design_templates.json"


def load_design_templates() -> dict[str, list["DesignElement"]]:
    """Charge les modèles de design (ensembles de bandeaux/étiquettes/texte
    réutilisables) sauvegardés sur disque."""
    if not CUSTOM_DESIGN_TEMPLATES_FILE.exists():
        return {}
    try:
        raw = json.loads(CUSTOM_DESIGN_TEMPLATES_FILE.read_text(encoding="utf-8"))
        return {
            name: [DesignElement.from_dict(d) for d in elements]
            for name, elements in raw.items()
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Impossible de charger les modèles de design : %s", exc)
        return {}


def save_design_template(name: str, elements: list["DesignElement"]):
    data = {}
    if CUSTOM_DESIGN_TEMPLATES_FILE.exists():
        try:
            data = json.loads(CUSTOM_DESIGN_TEMPLATES_FILE.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    data[name] = [asdict(el) for el in elements]
    CUSTOM_DESIGN_TEMPLATES_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def delete_design_template(name: str):
    if not CUSTOM_DESIGN_TEMPLATES_FILE.exists():
        return
    try:
        data = json.loads(CUSTOM_DESIGN_TEMPLATES_FILE.read_text(encoding="utf-8"))
        data.pop(name, None)
        CUSTOM_DESIGN_TEMPLATES_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Impossible de supprimer le modèle de design : %s", exc)


# ==========================================================================
# 1. CONFIGURATION / PRESETS
# ==========================================================================

@dataclass
class ProcessingConfig:
    """Regroupe tous les réglages du pipeline pour un traitement donné."""
    canvas_size: tuple[int, int] = (1080, 1080)
    bg_color: tuple[int, int, int, int] = (255, 255, 255, 255)
    bg_mode: str = "solid"                 # "solid" | "gradient" | "image" | "transparent"
    bg_gradient_color2: tuple[int, int, int, int] = (225, 225, 225, 255)
    bg_gradient_direction: str = "Vertical"  # Vertical | Horizontal | Diagonal | Radial
    bg_image_path: str = ""                # chemin de l'image/texture de fond (mode "image")
    padding_ratio: float = 0.20          # marge autour du produit
    contrast: float = 1.10
    brightness: float = 1.05
    shadow_enabled: bool = True
    shadow_opacity: int = 100            # 0-255
    shadow_blur: int = 15
    shadow_offset: tuple[int, int] = (15, 35)
    output_format: str = "JPEG"          # "JPEG" | "PNG" | "WEBP"
    jpeg_quality: int = 95
    remove_background: bool = True
    watermark_enabled: bool = False
    watermark_text: str = ""
    watermark_opacity: int = 160         # 0-255
    watermark_position: str = "Bas droite"  # Bas droite | Bas gauche | Centre

    # --- IA avancée ---
    ai_auto_enhance: bool = False        # exposition / contraste / netteté auto
    ai_denoise: bool = False             # réduction de bruit avant retouche
    ai_upscale_enabled: bool = False     # agrandissement IA (Real-ESRGAN ou repli LANCZOS)
    ai_upscale_factor: int = 2           # 2 ou 4
    ai_tagging_enabled: bool = False     # génère titre/description/catégorie/tags via Claude

    # --- NEXUS Market / Supabase ---
    supabase_upload_enabled: bool = False  # upload auto vers Supabase Storage après traitement

    # --- Retouche couleur pro (v6.0) ---
    saturation: float = 1.0              # 0 = niveaux de gris, 1 = inchangé, >1 = plus saturé
    wb_temperature: int = 0              # -100 (froid/bleu) .. +100 (chaud/orange)
    wb_tint: int = 0                     # -100 (magenta) .. +100 (vert)
    levels_black: int = 0                # point noir (0-254)
    levels_white: int = 255              # point blanc (1-255)
    levels_gamma: float = 1.0            # gamma (tons moyens)
    highlights: int = 0                  # -100 (assombrir) .. +100 (éclaircir) — hautes lumières
    shadows: int = 0                     # -100 (assombrir) .. +100 (éclaircir) — ombres
    color_style: str = "Couleur"         # "Couleur" | "Noir & blanc" | "Sépia"
    vignette_enabled: bool = False
    vignette_strength: int = 40          # 0-100
    bg_blur_enabled: bool = False        # floute l'arrière-plan d'origine (nécessite fond conservé)
    bg_blur_radius: int = 12

    # --- Retouche pro avancée (v7.0) ---
    auto_white_balance: bool = False     # balance des blancs auto (méthode "monde gris", par image)

    # Correction sélective par teinte (HSL) — 6 bandes de couleur, chacune
    # réglée indépendamment : décalage de teinte (-100..100), saturation
    # (-100..100) et luminance (-100..100).
    hsl_bands: dict = field(default_factory=lambda: {
        band: {"hue": 0, "sat": 0, "lum": 0}
        for band in ("Rouges", "Jaunes", "Verts", "Cyans", "Bleus", "Magentas")
    })

    # Courbes RVB simplifiées : 3 points par canal (ombres / tons moyens /
    # hautes lumières), chacun un décalage -100..100 appliqué à ce point de
    # la courbe puis interpolé sur les 256 niveaux.
    curve_master: tuple[int, int, int] = (0, 0, 0)
    curve_red: tuple[int, int, int] = (0, 0, 0)
    curve_green: tuple[int, int, int] = (0, 0, 0)
    curve_blue: tuple[int, int, int] = (0, 0, 0)

    clarity_enabled: bool = False
    clarity_strength: int = 0            # -100 (adoucir) .. 100 (accentuer la texture locale)

    split_toning_enabled: bool = False
    split_shadow_hue: int = 220          # 0-360°, teinte appliquée aux ombres
    split_shadow_sat: int = 0            # 0-100
    split_highlight_hue: int = 40        # 0-360°, teinte appliquée aux hautes lumières
    split_highlight_sat: int = 0         # 0-100
    split_balance: int = 0               # -100 (favorise les ombres) .. 100 (favorise les hautes lumières)

    dehaze_enabled: bool = False
    dehaze_strength: int = 0             # 0-100

    sharpen_mode: str = "Auto"           # "Auto" | "Manuel" | "Off"
    sharpen_radius: float = 2.0
    sharpen_amount: int = 100            # % (façon Unsharp Mask)
    sharpen_threshold: int = 3

    denoise_luminance: int = 0           # 0-100 — lissage du détail (bruit de luminance)
    denoise_color: int = 0               # 0-100 — lissage de la chrominance (bruit couleur), plus discret visuellement

    border_enabled: bool = False
    border_style: str = "Simple"         # "Simple" | "Cadre + ombre" | "Double liseré"
    border_width: int = 20
    border_color: tuple[int, int, int, int] = (255, 255, 255, 255)

    mirror_enabled: bool = False         # reflet sous le produit (chaussures, bijoux, montres...)
    mirror_height_ratio: float = 0.35    # hauteur du reflet, relative au produit
    mirror_fade: int = 70                # 0-100, force de l'estompage du reflet
    mirror_gap: int = 0                  # espace (px) entre le produit et son reflet

    blur_exposure_check_enabled: bool = True  # avertit avant traitement si photo floue / mal exposée

    # --- Nouvelles fonctionnalités (v8.0) ---
    shadow_style: str = "Portée"          # "Portée" (silhouette décalée) | "Contact" (ombre au sol réaliste)

    watermark_logo_enabled: bool = False  # filigrane logo/image, en plus (ou à la place) du filigrane texte
    watermark_logo_path: str = ""
    watermark_logo_scale: int = 15        # largeur du logo, % de la largeur du canevas
    watermark_logo_opacity: int = 200     # 0-255

    auto_crop_enabled: bool = False       # recadrage auto centré sur le sujet détecté (avant retouche)
    auto_crop_margin: int = 8             # marge autour du sujet détecté, % de sa plus grande dimension

    color_variants_enabled: bool = False  # génère des variantes de couleur du produit (recolorisation)
    color_variants_hues: str = ""         # décalages de teinte séparés par des virgules, ex "30,120,200"

    @classmethod
    def from_dict(cls, data: dict) -> "ProcessingConfig":
        """Construit une config en ignorant les clés inconnues (compat. future)."""
        valid_keys = {f.name for f in fields(cls)}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        # Reconvertit les listes JSON en tuples pour les champs concernés
        for key in ("canvas_size", "bg_color", "shadow_offset", "bg_gradient_color2",
                    "curve_master", "curve_red", "curve_green", "curve_blue", "border_color"):
            if key in filtered and isinstance(filtered[key], list):
                filtered[key] = tuple(filtered[key])
        return cls(**filtered)


@dataclass
class IntegrationsConfig:
    """Identifiants et réglages des intégrations externes (IA + NEXUS Market).

    Volontairement séparée de ProcessingConfig : ce ne sont pas des réglages
    de rendu mais des identifiants de compte, donc jamais inclus dans les
    presets sauvegardés/partagés (ceux-ci restent de simples fichiers JSON
    de réglages visuels).
    """
    anthropic_api_key: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_API_KEY", ""))
    ai_model: str = "claude-haiku-4-5-20251001"
    supabase_url: str = field(default_factory=lambda: os.environ.get(
        "SUPABASE_URL", "https://pqcqbstbdujzaclsiosv.supabase.co"))
    supabase_key: str = field(default_factory=lambda: os.environ.get(
        "SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_KEY", "")))
    supabase_bucket: str = "products"
    supabase_path_prefix: str = "nexus-market"


BUILTIN_PRESETS: dict[str, ProcessingConfig] = {
    "Amazon (1000x1000, fond blanc)": ProcessingConfig(
        canvas_size=(1000, 1000), bg_color=(255, 255, 255, 255),
        padding_ratio=0.15, shadow_enabled=False, output_format="JPEG",
    ),
    "Shopify (2048x2048)": ProcessingConfig(
        canvas_size=(2048, 2048), bg_color=(255, 255, 255, 255),
        padding_ratio=0.20, shadow_enabled=True, output_format="JPEG",
    ),
    "Etsy (2000x2000)": ProcessingConfig(
        canvas_size=(2000, 2000), bg_color=(250, 248, 245, 255),
        padding_ratio=0.18, shadow_enabled=True, output_format="JPEG",
    ),
    "eBay (1600x1600, fond blanc pur)": ProcessingConfig(
        canvas_size=(1600, 1600), bg_color=(255, 255, 255, 255),
        padding_ratio=0.12, shadow_enabled=False, output_format="JPEG",
    ),
    "Instagram carré (1080x1080)": ProcessingConfig(
        canvas_size=(1080, 1080), bg_color=(245, 245, 245, 255),
        padding_ratio=0.22, shadow_enabled=True, output_format="JPEG",
    ),
    "Personnalisé": ProcessingConfig(),
}


# Presets de « look » en un clic : combinaisons de réglages couleur/contraste
# uniquement (pas de canevas/export) — appliqués PAR-DESSUS les réglages en
# cours plutôt que de les remplacer, contrairement aux presets marketplace
# ci-dessus qui définissent le canevas/export complet.
LOOK_PRESETS: dict[str, dict] = {
    "Studio": {
        "contrast": 1.15, "brightness": 1.05, "saturation": 1.05,
        "clarity_enabled": True, "clarity_strength": 15,
        "vignette_enabled": False,
    },
    "Premium": {
        "contrast": 1.12, "brightness": 1.0, "saturation": 0.95,
        "split_toning_enabled": True,
        "split_shadow_hue": 220, "split_shadow_sat": 8,
        "split_highlight_hue": 40, "split_highlight_sat": 10,
        "vignette_enabled": True, "vignette_strength": 25,
    },
    "Doux": {
        "contrast": 0.95, "brightness": 1.08, "saturation": 0.92,
        "highlights": -10, "shadows": 15, "clarity_enabled": False,
    },
    "Contraste fort": {
        "contrast": 1.35, "brightness": 1.0, "saturation": 1.15,
        "clarity_enabled": True, "clarity_strength": 30,
    },
    "Noir & blanc pro": {
        "color_style": "Noir & blanc", "contrast": 1.2,
        "clarity_enabled": True, "clarity_strength": 20,
        "vignette_enabled": True, "vignette_strength": 30,
    },
}


# Profils produit (v9.0) : combinaisons de réglages complètes (canevas,
# ombre, couleur…) pensées pour une catégorie de produit donnée — point de
# départ rapide pour un vendeur pressé, affiché dans l'onglet Accueil.
# Contrairement aux presets marketplace (qui visent un format de plateforme),
# un profil produit vise un TYPE d'objet et s'applique par-dessus la config
# en cours (mêmes mécanismes que les presets de look ci-dessus).
PRODUCT_PROFILES: dict[str, dict] = {
    "Mode & Vêtements": {
        "bg_color": (255, 255, 255, 255), "bg_mode": "solid",
        "shadow_enabled": True, "shadow_style": "Portée",
        "padding_ratio": 0.12, "color_style": "Couleur",
        "saturation": 1.05, "contrast": 1.08,
    },
    "Chaussures & Maroquinerie": {
        "shadow_enabled": True, "shadow_style": "Contact",
        "mirror_enabled": True, "mirror_height_ratio": 0.30,
        "mirror_fade": 70, "padding_ratio": 0.15,
    },
    "Bijoux & Montres": {
        "shadow_enabled": True, "shadow_style": "Contact",
        "mirror_enabled": True, "mirror_height_ratio": 0.25,
        "vignette_enabled": True, "vignette_strength": 25,
        "padding_ratio": 0.22, "saturation": 1.1,
    },
    "Électronique & High-tech": {
        "bg_color": (245, 245, 247, 255), "shadow_enabled": True,
        "shadow_style": "Contact", "padding_ratio": 0.18,
        "color_style": "Couleur", "clarity_enabled": True,
        "clarity_strength": 20,
    },
    "Cosmétique & Beauté": {
        "bg_color": (255, 250, 245, 255), "padding_ratio": 0.18,
        "saturation": 1.08, "vignette_enabled": True,
        "vignette_strength": 15,
    },
    "Maison & Mobilier": {
        "padding_ratio": 0.10, "shadow_enabled": True,
        "shadow_style": "Portée", "contrast": 1.05,
    },
    "Alimentation": {
        "bg_color": (255, 255, 255, 255), "saturation": 1.15,
        "contrast": 1.12, "padding_ratio": 0.14,
    },
    "Général (réglages neutres)": {},
}


def load_custom_presets() -> dict[str, ProcessingConfig]:
    if not CUSTOM_PRESETS_FILE.exists():
        return {}
    try:
        raw = json.loads(CUSTOM_PRESETS_FILE.read_text(encoding="utf-8"))
        return {name: ProcessingConfig.from_dict(cfg) for name, cfg in raw.items()}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Impossible de charger les presets personnalisés : %s", exc)
        return {}


def save_custom_preset(name: str, config: ProcessingConfig):
    data = {}
    if CUSTOM_PRESETS_FILE.exists():
        try:
            data = json.loads(CUSTOM_PRESETS_FILE.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    data[name] = asdict(config)
    CUSTOM_PRESETS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def delete_custom_preset(name: str):
    if not CUSTOM_PRESETS_FILE.exists():
        return
    try:
        data = json.loads(CUSTOM_PRESETS_FILE.read_text(encoding="utf-8"))
        data.pop(name, None)
        CUSTOM_PRESETS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Impossible de supprimer le preset '%s' : %s", name, exc)


# --- Favoris de préréglages (v9.0) ---------------------------------------
# Accès rapide, depuis l'onglet Accueil, aux presets/profils utilisés le
# plus souvent, sans avoir à rouvrir le menu déroulant complet à chaque fois.

FAVORITE_PRESETS_FILE = Path.home() / ".ecommerce_studio_favorites.json"


def load_favorite_presets() -> list[str]:
    if not FAVORITE_PRESETS_FILE.exists():
        return []
    try:
        raw = json.loads(FAVORITE_PRESETS_FILE.read_text(encoding="utf-8"))
        return [str(n) for n in raw] if isinstance(raw, list) else []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Impossible de charger les favoris : %s", exc)
        return []


def save_favorite_presets(names: list[str]):
    try:
        FAVORITE_PRESETS_FILE.write_text(
            json.dumps(names, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Impossible d'enregistrer les favoris : %s", exc)


# --- Historique des lots traités (v9.0) -----------------------------------
# Court journal persistant des derniers lots (horodatage, total, réussites,
# échecs, dossier de sortie) affiché dans le tableau de bord de l'onglet
# Accueil, pour retrouver un export récent sans fouiller le journal d'activité.

BATCH_HISTORY_FILE = Path.home() / ".ecommerce_studio_history.json"
MAX_HISTORY_ENTRIES = 20


def load_batch_history() -> list[dict]:
    if not BATCH_HISTORY_FILE.exists():
        return []
    try:
        raw = json.loads(BATCH_HISTORY_FILE.read_text(encoding="utf-8"))
        return list(raw) if isinstance(raw, list) else []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Impossible de charger l'historique des lots : %s", exc)
        return []


def add_batch_history_entry(entry: dict):
    history = [entry] + load_batch_history()
    history = history[:MAX_HISTORY_ENTRIES]
    try:
        BATCH_HISTORY_FILE.write_text(
            json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Impossible d'enregistrer l'historique des lots : %s", exc)


# --- Projets (v9.0) --------------------------------------------------------
# Un « projet » regroupe la file d'images en cours ET les réglages complets,
# pour pouvoir fermer l'application et reprendre un lot exactement où on
# l'a laissé (utile pour un gros catalogue traité en plusieurs sessions).

PROJECT_FILE_FILTER = "Projet NEXUS Studio (*.nexusproj.json)"


def save_project_file(path: Path, image_paths: list[Path], config: ProcessingConfig, notes: str = ""):
    data = {
        "version": 1,
        "notes": notes,
        "image_paths": [str(p) for p in image_paths],
        "config": asdict(config),
    }
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_project_file(path: Path) -> tuple[list[Path], ProcessingConfig, str]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    image_paths = [Path(p) for p in raw.get("image_paths", [])]
    config = ProcessingConfig.from_dict(raw.get("config", {}))
    notes = str(raw.get("notes", ""))
    return image_paths, config, notes


# ==========================================================================
# 2. IA AVANCÉE — retouche auto, upscale, fiche produit
# ==========================================================================

def auto_enhance_image(img: Image.Image, denoise: bool = False) -> Image.Image:
    """Corrige automatiquement l'exposition, le contraste et la netteté d'une
    photo produit — utile pour les photos prises au téléphone en conditions
    d'éclairage variables (marché, boutique, lumière naturelle à Dakar)."""
    img = img.convert("RGB")
    if denoise:
        img = img.filter(ImageFilter.MedianFilter(size=3))
    img = ImageOps.autocontrast(img, cutoff=1)
    img = ImageEnhance.Color(img).enhance(1.08)
    img = ImageEnhance.Sharpness(img).enhance(1.15)
    return img


def apply_white_balance(img: Image.Image, temperature: int, tint: int) -> Image.Image:
    """Balance des blancs manuelle : `temperature` déplace le rendu vers le
    froid/bleu (négatif) ou le chaud/orange (positif) ; `tint` déplace vers
    le magenta (négatif) ou le vert (positif). Utile pour corriger une photo
    prise sous un éclairage jaune (ampoule) ou trop bleuté (néon)."""
    if temperature == 0 and tint == 0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    r_shift = int(temperature * 0.4)
    b_shift = int(-temperature * 0.4)
    g_shift = int(tint * 0.3)
    if r_shift:
        r = r.point(lambda v, s=r_shift: max(0, min(255, v + s)))
    if g_shift:
        g = g.point(lambda v, s=g_shift: max(0, min(255, v + s)))
    if b_shift:
        b = b.point(lambda v, s=b_shift: max(0, min(255, v + s)))
    return Image.merge("RGB", (r, g, b))


def apply_levels(img: Image.Image, black: int, white: int, gamma: float) -> Image.Image:
    """Réglage des niveaux (point noir / point blanc / gamma des tons
    moyens) — équivalent simplifié des niveaux Photoshop/Lightroom."""
    if black <= 0 and white >= 255 and gamma == 1.0:
        return img
    white = max(white, black + 1)
    lut = []
    for i in range(256):
        v = (i - black) / (white - black)
        v = max(0.0, min(1.0, v))
        if gamma != 1.0:
            v = v ** (1.0 / gamma)
        lut.append(int(round(v * 255)))
    return img.convert("RGB").point(lut * 3)


def apply_highlights_shadows(img: Image.Image, highlights: int, shadows: int) -> Image.Image:
    """Éclaircit ou assombrit séparément les hautes lumières et les ombres,
    sans toucher aux tons moyens — pratique pour rattraper une photo prise
    en contre-jour ou trop contrastée (positif = éclaircir la zone)."""
    if highlights == 0 and shadows == 0:
        return img
    lut = []
    for i in range(256):
        v = float(i)
        if shadows != 0 and i < 128:
            weight = (128 - i) / 128.0
            v += shadows * 0.6 * weight
        if highlights != 0 and i >= 128:
            weight = (i - 128) / 127.0
            v += highlights * 0.6 * weight
        lut.append(int(max(0, min(255, round(v)))))
    return img.convert("RGB").point(lut * 3)


_SEPIA_MATRIX = (
    0.393, 0.769, 0.189, 0,
    0.349, 0.686, 0.168, 0,
    0.272, 0.534, 0.131, 0,
)


def apply_color_style(img: Image.Image, style: str) -> Image.Image:
    """Applique un style de rendu global façon LUT prédéfinie."""
    img = img.convert("RGB")
    if style == "Noir & blanc":
        return ImageOps.grayscale(img).convert("RGB")
    if style == "Sépia":
        return img.convert("RGB", _SEPIA_MATRIX)
    if style == "Film chaud":
        r, g, b = img.split()
        r = r.point(lambda v: min(255, int(v * 1.08 + 6)))
        b = b.point(lambda v: max(0, int(v * 0.93)))
        img = Image.merge("RGB", (r, g, b))
        img = ImageEnhance.Contrast(img).enhance(1.05)
        return ImageEnhance.Color(img).enhance(1.05)
    if style == "Bleu froid":
        r, g, b = img.split()
        b = b.point(lambda v: min(255, int(v * 1.10 + 6)))
        r = r.point(lambda v: max(0, int(v * 0.95)))
        img = Image.merge("RGB", (r, g, b))
        return ImageEnhance.Contrast(img).enhance(1.05)
    if style == "Vif (Pop)":
        img = ImageEnhance.Color(img).enhance(1.35)
        return ImageEnhance.Contrast(img).enhance(1.15)
    if style == "Mat (Fade)":
        img = ImageEnhance.Contrast(img).enhance(0.85)
        faded = Image.blend(img, Image.new("RGB", img.size, (30, 28, 25)), 0.08)
        return ImageEnhance.Color(faded).enhance(0.9)
    if style == "Noir contrasté":
        gray = ImageOps.grayscale(img)
        gray = ImageOps.autocontrast(gray, cutoff=2)
        gray = ImageEnhance.Contrast(gray).enhance(1.25)
        return gray.convert("RGB")
    if style == "Pastel":
        img = ImageEnhance.Color(img).enhance(0.75)
        return Image.blend(img, Image.new("RGB", img.size, (255, 255, 255)), 0.12)
    return img


def apply_vignette(img: Image.Image, strength: int) -> Image.Image:
    """Assombrit progressivement les bords de l'image pour attirer l'œil
    vers le centre (effet vignette classique en photographie produit)."""
    if strength <= 0:
        return img
    img = img.convert("RGB")
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    margin = int(min(w, h) * 0.15)
    draw.ellipse((-margin, -margin, w + margin, h + margin), fill=255)
    blur_radius = max(10, int(min(w, h) * 0.12))
    mask = mask.filter(ImageFilter.GaussianBlur(blur_radius))
    darkened = ImageEnhance.Brightness(img).enhance(1.0 - (strength / 100.0) * 0.6)
    return Image.composite(img, darkened, mask)


def apply_background_blur(img: Image.Image, radius: int) -> Image.Image:
    """Floute l'arrière-plan d'origine tout en gardant le produit net (effet
    bokeh) — nécessite 'rembg' pour distinguer le sujet du fond. À utiliser
    uniquement quand le fond n'est PAS supprimé (sinon le fond est déjà
    remplacé par le canevas généré)."""
    if rembg_remove is None:
        logger.warning("Flou d'arrière-plan ignoré : le module 'rembg' est introuvable.")
        return img
    img = img.convert("RGB")
    try:
        cut = rembg_remove(img.convert("RGBA"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Flou d'arrière-plan ignoré (segmentation impossible) : %s", exc)
        return img
    alpha = cut.getchannel("A")
    blurred = img.filter(ImageFilter.GaussianBlur(max(1, radius)))
    return Image.composite(img, blurred, alpha)


def apply_auto_white_balance(img: Image.Image) -> Image.Image:
    """Balance des blancs automatique par la méthode du « monde gris » :
    suppose que la moyenne d'une photo est globalement neutre, et corrige
    chaque canal RVB pour que ce soit le cas. Fonctionne bien sur la plupart
    des photos produit (fond clair dominant) sans intervention manuelle."""
    img = img.convert("RGB")
    if np is not None:
        arr = np.asarray(img).astype(np.float32)
        means = arr.reshape(-1, 3).mean(axis=0)
        gray = means.mean()
        if gray < 1e-3:
            return img
        gains = gray / np.clip(means, 1e-3, None)
        gains = np.clip(gains, 0.7, 1.4)  # évite les dérives extrêmes sur images très colorées
        arr = np.clip(arr * gains, 0, 255).astype(np.uint8)
        return Image.fromarray(arr, "RGB")
    # Repli sans numpy : mêmes maths, canal par canal.
    r, g, b = (c.convert("L") for c in img.split())
    means = [np.array(c).mean() if np is not None else sum(c.getdata()) / (c.width * c.height)
             for c in (r, g, b)]
    gray = sum(means) / 3.0
    if gray < 1e-3:
        return img
    gains = [max(0.7, min(1.4, gray / max(m, 1e-3))) for m in means]
    chans = img.split()
    corrected = [chans[i].point(lambda v, g=gains[i]: max(0, min(255, int(v * g)))) for i in range(3)]
    return Image.merge("RGB", corrected)


# --- Correction sélective par teinte (HSL) ---

_HSL_BAND_CENTERS = {  # centre de teinte (0-360°) de chaque bande, largeur de cloche ~60°
    "Rouges": 0, "Jaunes": 60, "Verts": 120, "Cyans": 180, "Bleus": 240, "Magentas": 300,
}


def apply_hsl_selective(img: Image.Image, bands: dict) -> Image.Image:
    """Ajuste teinte / saturation / luminance indépendamment pour 6 bandes de
    couleur (rouges, jaunes, verts, cyans, bleus, magentas) — équivalent
    simplifié du réglage HSL de Lightroom. Chaque pixel est influencé par une
    bande selon sa proximité de teinte (transition douce en cloche)."""
    active = {k: v for k, v in (bands or {}).items()
              if v.get("hue") or v.get("sat") or v.get("lum")}
    if not active or np is None:
        return img
    img = img.convert("RGB")
    arr = np.asarray(img).astype(np.float32) / 255.0
    hsv = np.asarray(img.convert("HSV")).astype(np.float32)
    h = hsv[..., 0] * (360.0 / 255.0)   # 0-360
    s = hsv[..., 1] / 255.0             # 0-1
    v = hsv[..., 2] / 255.0             # 0-1

    h_shift = np.zeros_like(h)
    s_mult = np.ones_like(s)
    l_shift = np.zeros_like(v)

    for band, adj in active.items():
        center = _HSL_BAND_CENTERS.get(band)
        if center is None:
            continue
        d = np.abs(h - center)
        d = np.minimum(d, 360.0 - d)  # distance circulaire
        weight = np.clip(1.0 - d / 45.0, 0.0, 1.0)  # cloche de 45°, 0 au-delà
        h_shift += weight * (adj.get("hue", 0) * 0.6)
        s_mult += weight * (adj.get("sat", 0) / 100.0)
        l_shift += weight * (adj.get("lum", 0) / 100.0) * 0.5

    h = (h + h_shift) % 360.0
    s = np.clip(s * np.clip(s_mult, 0.0, 3.0), 0.0, 1.0)
    v = np.clip(v + l_shift, 0.0, 1.0)

    hsv_out = np.stack([h * (255.0 / 360.0), s * 255.0, v * 255.0], axis=-1)
    hsv_out = np.clip(hsv_out, 0, 255).astype(np.uint8)
    return Image.fromarray(hsv_out, "HSV").convert("RGB")


# --- Courbes RVB (simplifiées : ombres / tons moyens / hautes lumières) ---

def _curve_lut(shadow: int, mid: int, highlight: int) -> list:
    """Construit une LUT 256 valeurs à partir de 3 points de contrôle
    (décalages -100..100 aux niveaux 64 / 128 / 192), interpolés en douceur
    façon courbe — une version accessible des courbes RVB par canal."""
    if shadow == 0 and mid == 0 and highlight == 0:
        return list(range(256))
    xs = [0, 64, 128, 192, 255]
    ys = [0, 64 + shadow * 0.6, 128 + mid * 0.8, 192 + highlight * 0.6, 255]
    lut = []
    for i in range(256):
        # interpolation linéaire par morceaux entre les points de contrôle
        for k in range(len(xs) - 1):
            if xs[k] <= i <= xs[k + 1]:
                t = (i - xs[k]) / max(1, (xs[k + 1] - xs[k]))
                val = ys[k] + t * (ys[k + 1] - ys[k])
                lut.append(int(max(0, min(255, round(val)))))
                break
    return lut


def apply_curves(img: Image.Image, master: tuple, red: tuple, green: tuple, blue: tuple) -> Image.Image:
    """Applique une courbe globale (RVB) puis une courbe par canal — chacune
    définie par 3 points (ombres, tons moyens, hautes lumières)."""
    if master == (0, 0, 0) and red == (0, 0, 0) and green == (0, 0, 0) and blue == (0, 0, 0):
        return img
    img = img.convert("RGB")
    master_lut = _curve_lut(*master)
    if master != (0, 0, 0):
        img = img.point(master_lut * 3)
    r, g, b = img.split()
    if red != (0, 0, 0):
        r = r.point(_curve_lut(*red))
    if green != (0, 0, 0):
        g = g.point(_curve_lut(*green))
    if blue != (0, 0, 0):
        b = b.point(_curve_lut(*blue))
    return Image.merge("RGB", (r, g, b))


def apply_clarity(img: Image.Image, strength: int) -> Image.Image:
    """Clarté / texture : accentue (ou adoucit si négatif) le contraste
    local par un masque flou grand rayon — très utilisé en photo produit
    pour faire ressortir la matière (tissu, métal, cuir)."""
    if strength == 0:
        return img
    img = img.convert("RGB")
    radius = max(4, int(min(img.size) * 0.02))
    blurred = img.filter(ImageFilter.GaussianBlur(radius))
    if np is not None:
        base = np.asarray(img).astype(np.float32)
        soft = np.asarray(blurred).astype(np.float32)
        amount = strength / 100.0
        out = base + (base - soft) * amount * 1.2
        return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")
    # Repli sans numpy : Image.blend avec la version accentuée (moins précis).
    if strength > 0:
        sharpened = ImageEnhance.Sharpness(img).enhance(1.0 + strength / 50.0)
        return Image.blend(img, sharpened, min(1.0, strength / 100.0))
    return Image.blend(img, blurred, min(1.0, -strength / 100.0))


def apply_split_toning(img: Image.Image, shadow_hue: int, shadow_sat: int,
                        highlight_hue: int, highlight_sat: int, balance: int) -> Image.Image:
    """Applique une teinte différente dans les ombres et dans les hautes
    lumières (split toning), pondérée par la luminosité du pixel — effet
    très utilisé pour donner un rendu « éditorial » cohérent à une gamme
    de photos produit."""
    if shadow_sat == 0 and highlight_sat == 0:
        return img
    img = img.convert("RGB")

    def hue_to_rgb(hue_deg: int, sat_pct: int) -> tuple:
        tint = Image.new("HSV", (1, 1), (int(hue_deg / 360 * 255), int(sat_pct / 100 * 255), 200))
        return tint.convert("RGB").getpixel((0, 0))

    shadow_rgb = hue_to_rgb(shadow_hue, shadow_sat)
    highlight_rgb = hue_to_rgb(highlight_hue, highlight_sat)
    luminance = img.convert("L")
    bal = 0.5 + (balance / 200.0)  # 0..1, point de bascule ombres/hautes lumières
    weight_highlight = luminance.point(lambda v, b=bal: max(0, min(255, int((v / 255.0 - (1 - b)) / max(b, 0.01) * 255))))
    shadow_layer = Image.new("RGB", img.size, shadow_rgb)
    highlight_layer = Image.new("RGB", img.size, highlight_rgb)
    toned = Image.composite(highlight_layer, shadow_layer, weight_highlight)
    strength = max(shadow_sat, highlight_sat) / 100.0 * 0.35
    return Image.blend(img, _overlay_tone(img, toned), strength)


def _overlay_tone(img: Image.Image, tone: Image.Image) -> Image.Image:
    """Mélange en mode 'douce lumière' approximatif pour que la teinte
    respecte la luminosité d'origine au lieu de l'écraser."""
    if np is None:
        return Image.blend(img, tone, 0.5)
    base = np.asarray(img).astype(np.float32) / 255.0
    top = np.asarray(tone).astype(np.float32) / 255.0
    out = (1 - 2 * top) * base ** 2 + 2 * top * base
    return Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8), "RGB")


def apply_dehaze(img: Image.Image, strength: int) -> Image.Image:
    """Correction de brume / voile : approxime un retrait de brume en
    boostant le contraste local et la saturation dans les tons moyens, et en
    étirant l'histogramme par canal — utile sur des photos ternes ou prises
    par temps voilé."""
    if strength <= 0:
        return img
    img = img.convert("RGB")
    amount = strength / 100.0
    stretched = ImageOps.autocontrast(img, cutoff=int(1 + amount * 4))
    contrasted = ImageEnhance.Contrast(stretched).enhance(1.0 + amount * 0.35)
    saturated = ImageEnhance.Color(contrasted).enhance(1.0 + amount * 0.25)
    return Image.blend(img, saturated, min(1.0, amount * 1.1))


def apply_manual_sharpen(img: Image.Image, radius: float, amount: int, threshold: int) -> Image.Image:
    """Netteté manuelle façon Unsharp Mask (rayon / quantité / seuil),
    séparée de la retouche IA automatique — pour un contrôle fin comme dans
    Lightroom/Photoshop."""
    if amount <= 0:
        return img
    return img.convert("RGB").filter(
        ImageFilter.UnsharpMask(radius=max(0.1, radius), percent=max(0, amount), threshold=max(0, threshold))
    )


def apply_advanced_denoise(img: Image.Image, luminance: int, color: int) -> Image.Image:
    """Réduction de bruit avancée, luminance et chrominance séparées : lisse
    le bruit de couleur (souvent visible dans les zones sombres, en gros
    plan) sans perdre trop de détail net, en travaillant sur les canaux
    luminance/chrominance plutôt que sur l'image RVB directement."""
    if luminance <= 0 and color <= 0:
        return img
    img = img.convert("RGB")
    ycbcr = img.convert("YCbCr")
    y, cb, cr = ycbcr.split()
    if luminance > 0:
        radius = max(1, int(luminance / 25))
        y_smooth = y.filter(ImageFilter.GaussianBlur(radius))
        y = Image.blend(y, y_smooth, min(1.0, luminance / 100.0) * 0.6)
    if color > 0:
        radius = max(1, int(1 + color / 12))
        cb = cb.filter(ImageFilter.GaussianBlur(radius))
        cr = cr.filter(ImageFilter.GaussianBlur(radius))
    return Image.merge("YCbCr", (y, cb, cr)).convert("RGB")


def apply_border(canvas: Image.Image, style: str, width: int, color: tuple) -> Image.Image:
    """Ajoute une bordure/cadre décoratif autour de l'image finale déjà
    composée (fond + produit + ombre). Préserve la transparence d'origine
    (fond transparent) si le canevas est en mode RGBA."""
    if width <= 0 or style == "Aucune":
        return canvas
    keep_alpha = canvas.mode == "RGBA"
    canvas = canvas.convert("RGBA") if keep_alpha else canvas.convert("RGB")
    fill = (tuple(color[:3]) + (255,)) if keep_alpha else tuple(color[:3])
    corner_fill = (tuple(max(0, c - 40) for c in color[:3]) + (255,)) if keep_alpha \
        else tuple(max(0, c - 40) for c in color[:3])

    if style == "Simple":
        w, h = canvas.size
        bordered = Image.new(canvas.mode, (w + width * 2, h + width * 2), fill)
        bordered.paste(canvas, (width, width), canvas if keep_alpha else None)
        return bordered.resize(canvas.size, Image.Resampling.LANCZOS)
    if style == "Cadre + ombre":
        framed = ImageOps.expand(canvas, border=width, fill=fill)
        draw = ImageDraw.Draw(framed)
        draw.rectangle([0, 0, framed.width - 1, framed.height - 1],
                        outline=corner_fill, width=max(1, width // 8))
        return framed.resize(canvas.size, Image.Resampling.LANCZOS)
    if style == "Double liseré":
        center_fill = canvas.getpixel((0, 0))
        outer = ImageOps.expand(canvas, border=max(2, width // 6), fill=fill)
        gap = ImageOps.expand(outer, border=max(2, width // 3), fill=center_fill)
        inner = ImageOps.expand(gap, border=max(2, width // 6), fill=fill)
        return inner.resize(canvas.size, Image.Resampling.LANCZOS)
    return canvas


def apply_mirror_reflection(final_canvas: Image.Image, composed: Image.Image,
                             paste_x: int, paste_y: int, height_ratio: float,
                             fade: int, gap: int) -> Image.Image:
    """Ajoute un reflet en miroir sous le produit (effet « sol brillant »
    très demandé pour chaussures, bijoux, montres). `composed` est le calque
    RGBA du produit (+ ombre éventuelle) tel que collé sur `final_canvas`."""
    if height_ratio <= 0 or composed.height < 2:
        return final_canvas
    reflect_h = max(1, int(composed.height * height_ratio))
    mirror = composed.transpose(Image.FLIP_TOP_BOTTOM).crop((0, 0, composed.width, reflect_h))

    fade_mask = Image.new("L", mirror.size, 0)
    for y in range(reflect_h):
        alpha = int(max(0.0, 1.0 - (y / max(1, reflect_h)) * (1.0 + fade / 100.0)) * 255 * (1 - fade / 200.0))
        ImageDraw.Draw(fade_mask).line([(0, y), (mirror.width, y)], fill=max(0, min(255, alpha)))
    orig_alpha = mirror.getchannel("A") if mirror.mode == "RGBA" else Image.new("L", mirror.size, 255)
    combined_alpha = Image.composite(orig_alpha, Image.new("L", mirror.size, 0), fade_mask)
    mirror.putalpha(combined_alpha)

    final_canvas = final_canvas.convert("RGBA")
    mirror_y = paste_y + composed.height + gap
    final_canvas.paste(mirror, (paste_x, mirror_y), mirror)
    return final_canvas


def apply_contact_shadow(img_no_bg: Image.Image, opacity: int, blur: int) -> Image.Image:
    """Ombre de contact réaliste : une tache elliptique floue posée au sol
    sous le produit (comme une lumière venant du dessus), plutôt qu'une
    copie décalée de sa silhouette (ombre portée classique) — rendu plus
    proche d'un vrai packshot studio, notamment pour des objets posés à
    plat (chaussures, cosmétiques, emballages)."""
    w, h = img_no_bg.size
    pad_x = max(4, int(w * 0.20))
    pad_top = max(2, int(h * 0.04))
    pad_bottom = max(blur * 2, int(h * 0.16))
    canvas = Image.new("RGBA", (w + pad_x * 2, h + pad_top + pad_bottom), (0, 0, 0, 0))

    alpha = img_no_bg.getchannel("A") if img_no_bg.mode == "RGBA" else Image.new("L", img_no_bg.size, 255)
    bbox = alpha.getbbox() or (0, 0, w, h)
    base_w = max(6, int((bbox[2] - bbox[0]) * 0.82))
    ellipse_h = max(3, int(base_w * 0.14))
    cx = pad_x + (bbox[0] + bbox[2]) // 2
    cy = pad_top + bbox[3]

    draw = ImageDraw.Draw(canvas)
    draw.ellipse(
        (cx - base_w // 2, cy - ellipse_h // 2, cx + base_w // 2, cy + ellipse_h // 2),
        fill=(0, 0, 0, max(0, min(255, opacity))),
    )
    if blur > 0:
        canvas = canvas.filter(ImageFilter.GaussianBlur(blur))
    canvas.paste(img_no_bg, (pad_x, pad_top), img_no_bg)
    return canvas


def detect_blur_and_exposure(img: Image.Image) -> dict:
    """Détecte automatiquement une photo probablement floue et/ou mal
    exposée, pour avertir l'utilisateur AVANT de lancer un traitement par
    lot coûteux. Utilise la variance d'un filtre de contours (proxy du
    Laplacien) pour le flou, et la moyenne/l'écrêtage de l'histogramme pour
    l'exposition."""
    gray = img.convert("L")
    small = gray.copy()
    small.thumbnail((600, 600))
    edges = small.filter(ImageFilter.FIND_EDGES)
    if np is not None:
        arr = np.asarray(edges).astype(np.float32)
        blur_score = float(arr.var())
        hist_arr = np.asarray(small).astype(np.float32)
        mean_brightness = float(hist_arr.mean())
        under_ratio = float((hist_arr < 20).mean())
        over_ratio = float((hist_arr > 235).mean())
    else:
        data = list(edges.getdata())
        mean_e = sum(data) / len(data)
        blur_score = sum((v - mean_e) ** 2 for v in data) / len(data)
        hist_data = list(small.getdata())
        mean_brightness = sum(hist_data) / len(hist_data)
        under_ratio = sum(1 for v in hist_data if v < 20) / len(hist_data)
        over_ratio = sum(1 for v in hist_data if v > 235) / len(hist_data)
    return {
        "blur_score": blur_score,
        "blurry": blur_score < 90,          # seuil empirique, adapté aux photos produit nettes
        "mean_brightness": mean_brightness,
        "under_exposed": mean_brightness < 55 or under_ratio > 0.35,
        "over_exposed": mean_brightness > 210 or over_ratio > 0.35,
    }


# --- Auto-crop intelligent du produit ---------------------------------

def detect_subject_bbox(img: Image.Image, margin_ratio: float = 0.08) -> Optional[tuple[int, int, int, int]]:
    """Détecte automatiquement la zone occupée par le sujet (produit) en
    comparant chaque pixel à la couleur du fond, estimée à partir des bords
    de l'image, puis retourne une bbox (left, top, right, bottom) avec une
    marge ajoutée. Retourne None si aucun sujet net ne se détache (image
    trop uniforme ou trop bruitée) — l'image d'origine est alors conservée
    telle quelle plutôt que de risquer un recadrage aberrant."""
    w, h = img.size
    small = img.convert("RGB")
    scale = min(1.0, 400 / max(w, h))
    if scale < 1.0:
        small = small.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.BILINEAR)
    sw, sh = small.size
    if sw < 4 or sh < 4:
        return None

    if np is not None:
        arr = np.asarray(small).astype(np.int16)
        border = np.concatenate([arr[0, :, :], arr[-1, :, :], arr[:, 0, :], arr[:, -1, :]])
        bg_color = np.median(border, axis=0)
        diff = np.abs(arr - bg_color).sum(axis=2)
        threshold = max(30.0, float(np.percentile(diff, 90)) * 0.25)
        ys, xs = np.where(diff > threshold)
        if xs.size < 20:
            return None
        left, right = int(xs.min()), int(xs.max())
        top, bottom = int(ys.min()), int(ys.max())
    else:
        pixels = small.load()
        border_pixels = []
        for x in range(sw):
            border_pixels.append(pixels[x, 0])
            border_pixels.append(pixels[x, sh - 1])
        for y in range(sh):
            border_pixels.append(pixels[0, y])
            border_pixels.append(pixels[sw - 1, y])
        n = len(border_pixels)
        bg = tuple(sum(c[i] for c in border_pixels) / n for i in range(3))
        diffs = [[0] * sw for _ in range(sh)]
        for y in range(sh):
            for x in range(sw):
                p = pixels[x, y]
                diffs[y][x] = abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2])
        flat_sorted = sorted(v for row in diffs for v in row)
        threshold = max(30.0, flat_sorted[int(len(flat_sorted) * 0.9)] * 0.25)
        min_x, min_y, max_x, max_y = sw, sh, 0, 0
        found = False
        for y in range(sh):
            for x in range(sw):
                if diffs[y][x] > threshold:
                    found = True
                    min_x, max_x = min(min_x, x), max(max_x, x)
                    min_y, max_y = min(min_y, y), max(max_y, y)
        if not found:
            return None
        left, top, right, bottom = min_x, min_y, max_x, max_y

    inv = 1.0 / scale
    left, top, right, bottom = (int(left * inv), int(top * inv), int(right * inv), int(bottom * inv))
    bw, bh = right - left, bottom - top
    mx, my = int(bw * margin_ratio), int(bh * margin_ratio)
    left, top = max(0, left - mx), max(0, top - my)
    right, bottom = min(w, right + mx), min(h, bottom + my)
    if right - left < 10 or bottom - top < 10:
        return None
    return (left, top, right, bottom)


def apply_auto_crop(img: Image.Image, margin_pct: int) -> Image.Image:
    """Recadre automatiquement l'image sur son sujet détecté, avec une
    marge configurable. Sans effet si aucun sujet net n'est détecté."""
    bbox = detect_subject_bbox(img, margin_ratio=max(0, margin_pct) / 100.0)
    if bbox is None:
        return img
    return img.crop(bbox)


# --- Variantes de couleur (recolorisation du produit détouré) ----------

def generate_color_variant(img_rgba: Image.Image, hue_shift_degrees: int) -> Image.Image:
    """Applique une rotation de teinte (HSV) à l'image du produit déjà
    détouré (RGBA), en conservant son canal alpha intact — génère une
    variante de couleur (utile textile/accessoires) sans nouvelle séance
    photo. Un décalage de 0° (ou multiple de 360°) retourne une copie
    inchangée."""
    if hue_shift_degrees % 360 == 0:
        return img_rgba.copy()
    rgba = img_rgba.convert("RGBA")
    r, g, b, a = rgba.split()
    hsv = Image.merge("RGB", (r, g, b)).convert("HSV")
    h_chan, s_chan, v_chan = hsv.split()
    shift = int((hue_shift_degrees % 360) / 360 * 255)
    h_chan = h_chan.point(lambda x: (x + shift) % 256)
    shifted_rgb = Image.merge("HSV", (h_chan, s_chan, v_chan)).convert("RGB")
    shifted_rgb.putalpha(a)
    return shifted_rgb


def parse_hue_list(raw: str) -> list[int]:
    """Parse une liste de décalages de teinte séparés par des virgules
    (ex. « 30, 120, 200 ») en une liste d'entiers 1-359, dédupliqués et
    limités à 6 valeurs pour éviter un temps de traitement excessif."""
    hues: list[int] = []
    for part in (raw or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            value = int(float(part)) % 360
        except ValueError:
            continue
        if value != 0 and value not in hues:
            hues.append(value)
    return hues[:6]


# --- Retouche localisée (anti-tache, tampon de duplication, yeux rouges) ---

def _circular_soft_mask(diameter: int, feather: int) -> Image.Image:
    """Masque L (niveaux de gris) circulaire avec bord doux, centré dans un
    carré de côté `diameter + feather * 2`."""
    size = diameter + feather * 2
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((feather, feather, feather + diameter, feather + diameter), fill=255)
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather / 2))
    return mask


def apply_heal_spot(img: Image.Image, cx: int, cy: int, radius: int) -> Image.Image:
    """Anti-tache : supprime une imperfection localisée (tache, poussière,
    petit bouton) en la remplaçant par une version lissée de son voisinage
    immédiat, avec un raccord invisible. Utilise cv2.inpaint (bien plus
    fidèle) si OpenCV est installé, sinon un repli 100% Pillow."""
    img = img.convert("RGB")
    radius = max(2, radius)
    pad = radius + max(4, radius // 2)
    left, top = max(0, cx - pad), max(0, cy - pad)
    right, bottom = min(img.width, cx + pad), min(img.height, cy + pad)
    if right - left < 4 or bottom - top < 4:
        return img
    region = img.crop((left, top, right, bottom))
    local_cx, local_cy = cx - left, cy - top

    healed_region = None
    if cv2 is not None and np is not None:
        try:
            arr = np.array(region)[:, :, ::-1].copy()  # RGB -> BGR pour OpenCV
            spot_mask = np.zeros(arr.shape[:2], dtype="uint8")
            cv2.circle(spot_mask, (local_cx, local_cy), radius, 255, -1)
            healed = cv2.inpaint(arr, spot_mask, 5, cv2.INPAINT_TELEA)
            healed_region = Image.fromarray(healed[:, :, ::-1])
        except Exception as exc:  # noqa: BLE001
            logger.debug("Inpainting OpenCV indisponible, repli Pillow : %s", exc)
    if healed_region is None:
        healed_region = region.filter(ImageFilter.GaussianBlur(max(3, radius // 2 + 2)))

    feather = max(2, radius // 3)
    mask = Image.new("L", region.size, 0)
    ImageDraw.Draw(mask).ellipse(
        (local_cx - radius, local_cy - radius, local_cx + radius, local_cy + radius), fill=255
    )
    mask = mask.filter(ImageFilter.GaussianBlur(feather))

    result = img.copy()
    result.paste(healed_region, (left, top), mask)
    return result


def apply_clone_stroke(img: Image.Image, src_xy: tuple[int, int],
                        dest_points: list[tuple[int, int]], radius: int) -> Image.Image:
    """Tampon de duplication : copie une zone source vers un ensemble de
    points de destination (un trait de pinceau), en conservant un décalage
    constant entre la source et la destination — comportement classique du
    tampon de duplication des logiciels de retouche pro."""
    if not dest_points:
        return img
    img = img.convert("RGB")
    radius = max(2, radius)
    sx, sy = src_xy
    dx0, dy0 = dest_points[0]
    delta = (dx0 - sx, dy0 - sy)

    feather = max(2, radius // 3)
    mask = _circular_soft_mask(radius * 2, feather)
    box_size = mask.size[0]
    result = img.copy()
    for (px, py) in dest_points:
        source_x, source_y = int(px - delta[0]), int(py - delta[1])
        s_left, s_top = source_x - box_size // 2, source_y - box_size // 2
        d_left, d_top = int(px) - box_size // 2, int(py) - box_size // 2
        if (s_left < 0 or s_top < 0 or s_left + box_size > img.width
                or s_top + box_size > img.height):
            continue
        patch = img.crop((s_left, s_top, s_left + box_size, s_top + box_size))
        result.paste(patch, (d_left, d_top), mask)
    return result


def apply_redeye_reduction(img: Image.Image, cx: int, cy: int, radius: int) -> Image.Image:
    """Réduit l'effet 'yeux rouges' dans une zone circulaire en remplaçant
    la composante rouge par la moyenne vert/bleu, avec un raccord doux."""
    img = img.convert("RGB")
    radius = max(2, radius)
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    clamped = (max(0, box[0]), max(0, box[1]), min(img.width, box[2]), min(img.height, box[3]))
    if clamped[2] <= clamped[0] or clamped[3] <= clamped[1]:
        return img
    region = img.crop(clamped)
    r, g, b = region.split()
    from PIL import ImageChops
    neutral = ImageChops.add(g, b, scale=2.0)
    fixed_r = Image.blend(r, neutral, 0.85)
    fixed_region = Image.merge("RGB", (fixed_r, g, b))

    mask = Image.new("L", region.size, 0)
    ellipse_box = (cx - radius - clamped[0], cy - radius - clamped[1],
                   cx + radius - clamped[0], cy + radius - clamped[1])
    ImageDraw.Draw(mask).ellipse(ellipse_box, fill=220)
    mask = mask.filter(ImageFilter.GaussianBlur(max(1, radius // 4)))

    result = img.copy()
    result.paste(fixed_region, (clamped[0], clamped[1]), mask)
    return result


def _upscale_with_realesrgan(img: Image.Image, factor: int, exe: str) -> Image.Image:
    """Agrandit via le binaire externe realesrgan-ncnn-vulkan s'il est présent
    sur le PATH (bien meilleure qualité qu'un simple ré-échantillonnage)."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        src, dst = tmp_path / "input.png", tmp_path / "output.png"
        img.convert("RGBA").save(src, "PNG")
        scale_flag = "4" if factor >= 4 else "2"
        cmd = [exe, "-i", str(src), "-o", str(dst), "-s", scale_flag]
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        with Image.open(dst) as out:
            out.load()
            return out.convert("RGBA")


def upscale_image(img: Image.Image, factor: int) -> Image.Image:
    """Agrandit l'image d'un facteur 2x/4x. Utilise Real-ESRGAN si le binaire
    'realesrgan-ncnn-vulkan' est installé et trouvable sur le PATH, sinon
    bascule sur un ré-échantillonnage LANCZOS haute qualité renforcé par un
    filtre de netteté (moins fin que l'IA, mais toujours disponible)."""
    if factor <= 1:
        return img
    exe = shutil.which("realesrgan-ncnn-vulkan")
    if exe:
        try:
            return _upscale_with_realesrgan(img, factor, exe)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Real-ESRGAN a échoué (%s) — repli sur l'agrandissement standard.", exc)
    new_size = (img.width * factor, img.height * factor)
    upscaled = img.resize(new_size, Image.Resampling.LANCZOS)
    upscaled = upscaled.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2))
    return upscaled


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"

_METADATA_PROMPT = (
    "Tu es un assistant e-commerce pour NEXUS Market, une marketplace à Dakar, "
    "Sénégal (devise FCFA). Analyse cette photo produit et réponds UNIQUEMENT "
    "avec un objet JSON valide, sans aucun texte avant ni après, avec exactement "
    "ces clés : "
    '{"title": "titre court et vendeur en français (8 mots maximum)", '
    '"description": "description marketing en français, 2 à 3 phrases, adaptée '
    'au marché de Dakar", '
    '"category": "catégorie e-commerce la plus probable", '
    '"tags": ["5 mots-clés pertinents en français"]}'
)


def generate_ai_metadata(img: Image.Image, api_key: str, model: str) -> dict:
    """Appelle l'API Anthropic (vision) pour générer une fiche produit
    (titre, description, catégorie, tags) en français à partir de l'image
    déjà traitée. Lève une exception explicite si la clé/API/module manque."""
    if not api_key:
        raise RuntimeError("Clé API Anthropic manquante (réglages « IA avancée »).")
    if requests is None:
        raise RuntimeError("Le module 'requests' n'est pas installé. Installez-le avec : pip install requests")

    thumb = img.copy().convert("RGB")
    thumb.thumbnail((768, 768), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    thumb.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    payload = {
        "model": model,
        "max_tokens": 500,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                {"type": "text", "text": _METADATA_PROMPT},
            ],
        }],
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    resp = requests.post(ANTHROPIC_API_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    raw = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    raw = re.sub(r"^```(json)?|```$", "", raw, flags=re.MULTILINE).strip()
    metadata = json.loads(raw)
    metadata.setdefault("title", "")
    metadata.setdefault("description", "")
    metadata.setdefault("category", "")
    metadata.setdefault("tags", [])
    return metadata


def upload_to_supabase(image_bytes: bytes, remote_path: str, content_type: str,
                        supabase_url: str, supabase_key: str, bucket: str) -> str:
    """Upload un fichier vers un bucket Supabase Storage et retourne son URL
    publique. Nécessite que le bucket soit configuré en lecture publique côté
    Supabase (ou que l'URL soit consommée via une politique RLS adaptée)."""
    if requests is None:
        raise RuntimeError("Le module 'requests' n'est pas installé. Installez-le avec : pip install requests")
    if not supabase_url or not supabase_key or not bucket:
        raise RuntimeError("Configuration Supabase incomplète (URL / clé / bucket).")

    base = supabase_url.rstrip("/")
    endpoint = f"{base}/storage/v1/object/{bucket}/{remote_path}"
    headers = {
        "Authorization": f"Bearer {supabase_key}",
        "apikey": supabase_key,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    resp = requests.post(endpoint, headers=headers, data=image_bytes, timeout=60)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Échec upload Supabase ({resp.status_code}) : {resp.text[:200]}")
    return f"{base}/storage/v1/object/public/{bucket}/{remote_path}"


def build_remote_path(prefix: str, source_stem: str, ext: str) -> str:
    """Construit un chemin distant unique et sûr pour Supabase Storage."""
    slug = re.sub(r"[^\w\-]+", "-", source_stem, flags=re.UNICODE).strip("-").lower() or "produit"
    return f"{prefix.strip('/')}/{slug}-{uuid.uuid4().hex[:8]}.{ext}"


def serialize_image(img: Image.Image, cfg: ProcessingConfig) -> tuple[bytes, str, str]:
    """Encode une image selon le format/qualité de la config. Retourne
    (octets, extension, content-type) — réutilisé par l'export disque et
    l'upload NEXUS Market. Le format JPEG ne supportant pas la transparence,
    toute zone transparente est aplatie sur un fond blanc plutôt que
    tronquée brutalement (ce qui produirait des liserés noirs)."""
    ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[cfg.output_format]
    content_type = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[cfg.output_format]
    buf = io.BytesIO()
    if cfg.output_format == "JPEG":
        if img.mode == "RGBA":
            flattened = Image.new("RGB", img.size, (255, 255, 255))
            flattened.paste(img, mask=img.split()[-1])
            img = flattened
        else:
            img = img.convert("RGB")
        img.save(buf, "JPEG", quality=cfg.jpeg_quality)
    elif cfg.output_format == "WEBP":
        img.save(buf, "WEBP", quality=cfg.jpeg_quality)
    else:
        img.save(buf, "PNG")
    return buf.getvalue(), ext, content_type


# ==========================================================================
# 3. PIPELINE DE TRAITEMENT
# ==========================================================================

# Bibliothèque de dégradés prédéfinis : nom → (couleur1, couleur2, direction)
GRADIENT_PRESETS: dict[str, tuple[tuple[int, int, int], tuple[int, int, int], str]] = {
    "Studio gris":     ((255, 255, 255), (210, 210, 210), "Radial"),
    "Pastel Dakar":    ((255, 236, 214), (255, 183, 197), "Diagonal"),
    "Bleu océan":      ((235, 245, 255), (120, 170, 220), "Vertical"),
    "Doux corail":     ((255, 255, 255), (255, 200, 180), "Horizontal"),
    "Nuit indigo":     ((230, 230, 250), (60, 50, 120), "Radial"),
    "Sable chaud":     ((255, 248, 230), (222, 184, 135), "Diagonal"),
    "Menthe fraîche":  ((245, 255, 250), (150, 220, 200), "Vertical"),
}


def _gradient_mask(size: tuple[int, int], direction: str) -> Image.Image:
    """Construit un masque de dégradé (niveaux de gris 0→255) via les
    primitives Pillow — pas de dépendance externe, rapide même en grand
    format. 0 = couleur 1 (bg_color), 255 = couleur 2 (bg_gradient_color2)."""
    if direction == "Radial":
        return Image.radial_gradient("L").resize(size, Image.Resampling.BICUBIC)

    base = Image.linear_gradient("L")  # noir en haut → blanc en bas (vertical)
    if direction == "Horizontal":
        base = base.rotate(90, expand=True)
    elif direction == "Diagonal":
        base = base.rotate(45, expand=True, resample=Image.BICUBIC)
        w, h = base.size
        crop = int(min(w, h) * 0.5)
        cx, cy = w // 2, h // 2
        base = base.crop((cx - crop // 2, cy - crop // 2, cx + crop // 2, cy + crop // 2))
    return base.resize(size, Image.Resampling.BICUBIC)


def build_background_canvas(size: tuple[int, int], cfg: ProcessingConfig) -> Image.Image:
    """Construit le canevas de fond : uni (bg_color), dégradé entre bg_color
    et bg_gradient_color2, image/texture importée (recadrée en 'cover'), ou
    entièrement transparent (nécessite un format d'export PNG ou WEBP)."""
    if cfg.bg_mode == "transparent":
        return Image.new("RGBA", size, (0, 0, 0, 0))

    if cfg.bg_mode == "image":
        if not cfg.bg_image_path:
            raise RuntimeError("Mode « fond image » activé mais aucune image sélectionnée.")
        bg_path = Path(cfg.bg_image_path)
        if not bg_path.is_file():
            raise RuntimeError(f"Image de fond introuvable : {bg_path}")
        with Image.open(bg_path) as bg_im:
            bg_im.load()
            fitted = ImageOps.fit(bg_im.convert("RGB"), size, method=Image.Resampling.LANCZOS)
        return fitted.convert("RGBA")

    if cfg.bg_mode != "gradient":
        return Image.new("RGBA", size, cfg.bg_color)

    mask = _gradient_mask(size, cfg.bg_gradient_direction)
    color1 = Image.new("RGBA", size, tuple(cfg.bg_color[:3]) + (255,))
    color2 = Image.new("RGBA", size, tuple(cfg.bg_gradient_color2[:3]) + (255,))
    return Image.composite(color2, color1, mask)


def _get_font(size: int):
    """Charge une police lisible en essayant plusieurs stratégies de repli."""
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def apply_watermark(img: Image.Image, cfg: ProcessingConfig) -> Image.Image:
    """Superpose un filigrane texte semi-transparent et/ou un filigrane
    logo (image) sur l'image finale. Préserve la transparence d'origine
    (fond transparent) si présente."""
    text_active = cfg.watermark_enabled and bool(cfg.watermark_text.strip())
    logo_active = cfg.watermark_logo_enabled and bool(cfg.watermark_logo_path)
    if not text_active and not logo_active:
        return img

    keep_alpha = img.mode == "RGBA"
    img = img.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    margin = max(12, img.width // 60)

    if text_active:
        font_size = max(14, img.width // 22)
        font = _get_font(font_size)
        text = cfg.watermark_text
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        positions = {
            "Bas droite": (img.width - tw - margin, img.height - th - margin),
            "Bas gauche": (margin, img.height - th - margin),
            "Centre": ((img.width - tw) // 2, (img.height - th) // 2),
        }
        x, y = positions.get(cfg.watermark_position, positions["Bas droite"])
        draw.text((x, y), text, font=font, fill=(255, 255, 255, cfg.watermark_opacity))

    if logo_active:
        logo_path = Path(cfg.watermark_logo_path)
        if logo_path.is_file():
            try:
                with Image.open(logo_path) as logo_im:
                    logo_im.load()
                    logo = logo_im.convert("RGBA")
                target_w = max(8, int(img.width * cfg.watermark_logo_scale / 100.0))
                ratio = target_w / max(1, logo.width)
                target_h = max(1, int(logo.height * ratio))
                logo = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
                if cfg.watermark_logo_opacity < 255:
                    logo_alpha = logo.getchannel("A").point(
                        lambda a: int(a * max(0, min(255, cfg.watermark_logo_opacity)) / 255)
                    )
                    logo.putalpha(logo_alpha)
                positions = {
                    "Bas droite": (img.width - target_w - margin, img.height - target_h - margin),
                    "Bas gauche": (margin, img.height - target_h - margin),
                    "Centre": ((img.width - target_w) // 2, (img.height - target_h) // 2),
                }
                lx, ly = positions.get(cfg.watermark_position, positions["Bas droite"])
                overlay.paste(logo, (lx, ly), logo)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Logo de filigrane illisible (%s) : %s", cfg.watermark_logo_path, exc)

    combined = Image.alpha_composite(img, overlay)
    return combined if keep_alpha else combined.convert("RGB")


# --- Planche de contact (grille avant / après récapitulative) ----------

def build_contact_sheet(entries: list[tuple[str, Optional[Image.Image], Optional[Image.Image]]],
                         columns: int = 3, cell_width: int = 320) -> Image.Image:
    """Construit une planche de contact récapitulative : une vignette
    avant/après (côte à côte) par photo, avec son nom de fichier, disposées
    en grille — utile pour valider un lot en un coup d'œil ou le partager
    avec un client/vendeur sans rouvrir chaque fichier individuellement."""
    if not entries:
        raise RuntimeError("Aucune image à inclure dans la planche de contact.")
    pad = 16
    label_h = 24
    half_w = (cell_width - 8) // 2
    thumb_h = half_w
    cell_h = thumb_h + label_h
    cols = max(1, columns)
    rows = math.ceil(len(entries) / cols)
    sheet = Image.new("RGB", (cols * (cell_width + pad) + pad, rows * (cell_h + pad) + pad), (28, 28, 30))
    draw = ImageDraw.Draw(sheet)
    font = _get_font(14)

    for idx, (name, before, after) in enumerate(entries):
        col, row = idx % cols, idx // cols
        x0 = pad + col * (cell_width + pad)
        y0 = pad + row * (cell_h + pad)
        for offset, img in ((0, before), (half_w + 8, after)):
            if img is not None:
                thumb = ImageOps.fit(img.convert("RGB"), (half_w, thumb_h), Image.Resampling.LANCZOS)
            else:
                thumb = Image.new("RGB", (half_w, thumb_h), (60, 60, 60))
            sheet.paste(thumb, (x0 + offset, y0))
        draw.rectangle([x0, y0, x0 + cell_width, y0 + thumb_h], outline=(90, 90, 90))
        draw.line([(x0 + half_w + 4, y0), (x0 + half_w + 4, y0 + thumb_h)], fill=(90, 90, 90))
        label = name if len(name) < 40 else name[:37] + "…"
        draw.text((x0, y0 + thumb_h + 4), label, font=font, fill=(230, 230, 230))
    return sheet


# --- Carrousel (post multi-images pour réseaux sociaux) ----------------

CAROUSEL_FORMATS: dict[str, tuple[int, int]] = {
    "Carré Instagram (1080×1080)": (1080, 1080),
    "Portrait Instagram (1080×1350)": (1080, 1350),
    "Story / Reels (1080×1920)": (1080, 1920),
    "Personnalisé (taille du canevas actuel)": (0, 0),
}


def apply_carousel_badge(img: Image.Image, index: int, total: int, position: str = "Bas droite") -> Image.Image:
    """Superpose un petit badge « i/N » (pastille arrondie semi-opaque) sur
    une slide de carrousel, pour indiquer sa position dans la séquence."""
    rgba = img.convert("RGBA")
    overlay = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    text = f"{index}/{total}"
    font_size = max(16, rgba.width // 24)
    font = _get_font(font_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = int(th * 0.7), int(th * 0.4)
    pill_w, pill_h = tw + pad_x * 2, th + pad_y * 2
    margin = max(14, rgba.width // 40)
    positions = {
        "Bas droite": (rgba.width - pill_w - margin, rgba.height - pill_h - margin),
        "Bas gauche": (margin, rgba.height - pill_h - margin),
        "Haut droite": (rgba.width - pill_w - margin, margin),
        "Haut gauche": (margin, margin),
    }
    x, y = positions.get(position, positions["Bas droite"])
    draw.rounded_rectangle([x, y, x + pill_w, y + pill_h], radius=pill_h // 2, fill=(20, 20, 20, 190))
    draw.text((x + pad_x - bbox[0], y + pad_y - bbox[1]), text, font=font, fill=(255, 255, 255, 255))
    combined = Image.alpha_composite(rgba, overlay)
    return combined.convert("RGB")


def build_carousel_slide(img: Image.Image, size: tuple[int, int], bg_color: tuple = (255, 255, 255),
                          index: Optional[int] = None, total: Optional[int] = None,
                          badge_position: str = "Bas droite") -> Image.Image:
    """Prépare une image pour une slide de carrousel : redimensionnée SANS
    recadrage (letterboxing centré) au format cible choisi, puis numérotée
    si demandé — garantit un format homogène pour tout le carrousel même
    si les photos d'origine ont des proportions différentes."""
    fitted = ImageOps.pad(img.convert("RGB"), size, color=tuple(bg_color[:3]), centering=(0.5, 0.5))
    if index is not None and total:
        fitted = apply_carousel_badge(fitted, index, total, position=badge_position)
    return fitted


class EcommercePipeline:
    """Pipeline de traitement d'image produit, entièrement paramétrable."""

    def __init__(self, config: ProcessingConfig):
        self.config = config

    def process_image(self, img: Image.Image, position: Optional[tuple] = None,
                       variant_hue: int = 0) -> Image.Image:
        """`position`, si fourni, est un triplet (offset_x, offset_y, scale)
        propre à CETTE image (voir ImageEdits.canvas_offset_x/y/scale) : il
        permet de repositionner/redimensionner le produit sur le canevas
        final APRÈS suppression du fond — utile car le recadrage classique
        n'a aucun effet visible une fois la silhouette auto-recentrée.
        `variant_hue`, si non nul, applique une rotation de teinte (0-359°)
        au produit détouré uniquement, pour générer une variante de
        couleur (voir generate_color_variant)."""
        cfg = self.config
        offset_x, offset_y, scale = position if position else (0.0, 0.0, 1.0)
        scale = max(0.3, min(2.0, scale))
        offset_x = max(-0.45, min(0.45, offset_x))
        offset_y = max(-0.45, min(0.45, offset_y))
        img = img.convert("RGB")

        if cfg.auto_crop_enabled:
            img = apply_auto_crop(img, cfg.auto_crop_margin)

        if cfg.ai_auto_enhance:
            img = auto_enhance_image(img, denoise=cfg.ai_denoise)

        if cfg.denoise_luminance or cfg.denoise_color:
            img = apply_advanced_denoise(img, cfg.denoise_luminance, cfg.denoise_color)

        if cfg.dehaze_enabled and cfg.dehaze_strength > 0:
            img = apply_dehaze(img, cfg.dehaze_strength)

        if cfg.auto_white_balance:
            img = apply_auto_white_balance(img)
        if cfg.wb_temperature or cfg.wb_tint:
            img = apply_white_balance(img, cfg.wb_temperature, cfg.wb_tint)
        if cfg.saturation != 1.0:
            img = ImageEnhance.Color(img).enhance(cfg.saturation)
        if cfg.levels_black > 0 or cfg.levels_white < 255 or cfg.levels_gamma != 1.0:
            img = apply_levels(img, cfg.levels_black, cfg.levels_white, cfg.levels_gamma)
        if cfg.highlights or cfg.shadows:
            img = apply_highlights_shadows(img, cfg.highlights, cfg.shadows)

        img = apply_curves(img, cfg.curve_master, cfg.curve_red, cfg.curve_green, cfg.curve_blue)
        img = apply_hsl_selective(img, cfg.hsl_bands)

        if cfg.clarity_enabled and cfg.clarity_strength != 0:
            img = apply_clarity(img, cfg.clarity_strength)

        if cfg.contrast != 1.0:
            img = ImageEnhance.Contrast(img).enhance(cfg.contrast)
        if cfg.brightness != 1.0:
            img = ImageEnhance.Brightness(img).enhance(cfg.brightness)

        if cfg.split_toning_enabled:
            img = apply_split_toning(img, cfg.split_shadow_hue, cfg.split_shadow_sat,
                                      cfg.split_highlight_hue, cfg.split_highlight_sat, cfg.split_balance)

        if cfg.color_style != "Couleur":
            img = apply_color_style(img, cfg.color_style)

        if cfg.sharpen_mode == "Manuel":
            img = apply_manual_sharpen(img, cfg.sharpen_radius, cfg.sharpen_amount, cfg.sharpen_threshold)

        if cfg.bg_blur_enabled and not cfg.remove_background:
            img = apply_background_blur(img, cfg.bg_blur_radius)

        if cfg.vignette_enabled:
            img = apply_vignette(img, cfg.vignette_strength)

        if cfg.remove_background:
            if rembg_remove is None:
                raise RuntimeError(
                    "Le module 'rembg' n'est pas installé. "
                    "Installez-le avec : pip install rembg"
                )
            img_no_bg = rembg_remove(img)
        else:
            img_no_bg = img.convert("RGBA")

        bbox = img_no_bg.getbbox()
        if bbox:
            img_no_bg = img_no_bg.crop(bbox)

        if variant_hue:
            img_no_bg = generate_color_variant(img_no_bg, variant_hue)

        if cfg.ai_upscale_enabled:
            # Agrandir AVANT le redimensionnement dans le canevas : utile pour
            # les photos produit de petite taille (ex. captures WhatsApp).
            img_no_bg = upscale_image(img_no_bg, cfg.ai_upscale_factor)

        usable_ratio = max(0.05, 1.0 - cfg.padding_ratio)
        max_w = int(cfg.canvas_size[0] * usable_ratio)
        max_h = int(cfg.canvas_size[1] * usable_ratio)
        img_no_bg.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)

        if scale != 1.0 and img_no_bg.getbbox():
            # `thumbnail()` ne fait que réduire, jamais agrandir : on applique
            # le zoom séparément, relatif à la taille déjà ajustée, pour que
            # le zoom-in fonctionne aussi sur les photos plus petites que la
            # zone utile (cas fréquent avec des photos prises au téléphone).
            new_w = max(1, int(img_no_bg.width * scale))
            new_h = max(1, int(img_no_bg.height * scale))
            img_no_bg = img_no_bg.resize((new_w, new_h), Image.Resampling.LANCZOS)

        if cfg.shadow_enabled and img_no_bg.getbbox():
            composed = self._apply_shadow(img_no_bg)
        else:
            composed = img_no_bg

        final_canvas = build_background_canvas(cfg.canvas_size, cfg)
        paste_x = (cfg.canvas_size[0] - composed.width) // 2 + int(offset_x * cfg.canvas_size[0])
        paste_y = (cfg.canvas_size[1] - composed.height) // 2 + int(offset_y * cfg.canvas_size[1])
        final_canvas.paste(composed, (paste_x, paste_y), composed)

        if cfg.mirror_enabled and img_no_bg.getbbox():
            final_canvas = apply_mirror_reflection(
                final_canvas, composed, paste_x, paste_y,
                cfg.mirror_height_ratio, cfg.mirror_fade, cfg.mirror_gap,
            )

        result = final_canvas if cfg.bg_mode == "transparent" else final_canvas.convert("RGB")
        if cfg.border_enabled:
            result = apply_border(result, cfg.border_style, cfg.border_width, cfg.border_color)
        result = apply_watermark(result, cfg)

        if result.mode == "RGBA" and cfg.output_format == "JPEG":
            # Le JPEG ne supporte pas la transparence : on aplatit sur blanc
            # plutôt que de laisser des liserés noirs à l'export.
            flattened = Image.new("RGB", result.size, (255, 255, 255))
            flattened.paste(result, mask=result.split()[-1])
            result = flattened
        return result

    def _apply_shadow(self, img_no_bg: Image.Image) -> Image.Image:
        cfg = self.config
        if cfg.shadow_style == "Contact":
            return apply_contact_shadow(img_no_bg, cfg.shadow_opacity, cfg.shadow_blur)
        off_x, off_y = cfg.shadow_offset
        shadow = Image.new("RGBA", img_no_bg.size, (0, 0, 0, cfg.shadow_opacity))
        shadow.putalpha(img_no_bg.getchannel("A"))

        canvas_size = (img_no_bg.width + off_x * 2, img_no_bg.height + off_y + off_x)
        shadow_canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        shadow_canvas.paste(shadow, (off_x, off_y), shadow)
        if cfg.shadow_blur > 0:
            shadow_canvas = shadow_canvas.filter(ImageFilter.GaussianBlur(cfg.shadow_blur))
        shadow_canvas.paste(img_no_bg, (off_x, off_x), img_no_bg)
        return shadow_canvas


# ==========================================================================
# 4. TRAITEMENT PAR LOT EN PARALLÈLE (QThreadPool)
# ==========================================================================

@dataclass
class BatchResult:
    source_path: Path
    image: Optional[Image.Image] = None
    error: Optional[str] = None
    # --- Fiche produit générée par l'IA (si ai_tagging_enabled) ---
    ai_title: Optional[str] = None
    ai_description: Optional[str] = None
    ai_category: Optional[str] = None
    ai_tags: list[str] = field(default_factory=list)
    ai_error: Optional[str] = None
    # --- Upload NEXUS Market / Supabase (si supabase_upload_enabled) ---
    supabase_url: Optional[str] = None
    upload_error: Optional[str] = None
    # --- Variantes de couleur (si color_variants_enabled) : degré → image ---
    color_variants: dict = field(default_factory=dict)


def rotate_clockwise(img: Image.Image, degrees: int) -> Image.Image:
    """Pivote une image de `degrees` (multiple de 90) dans le sens horaire."""
    degrees = degrees % 360
    if degrees == 0:
        return img
    # PIL.rotate() tourne dans le sens anti-horaire pour un angle positif.
    return img.rotate(-degrees, expand=True)


@dataclass
class ImageEdits:
    """Retouches manuelles propres à UNE image (recadrage, redressement fin,
    anti-tache, tampon de duplication, yeux rouges). Toutes les coordonnées
    sont stockées normalisées (0.0-1.0) par rapport à l'image sur laquelle
    l'édition a été faite, pour rester valables quelle que soit la
    résolution de traitement."""
    straighten_angle: float = 0.0
    crop_rect: Optional[tuple[float, float, float, float]] = None  # left, top, right, bottom (0..1)
    heal_spots: list[tuple[float, float, float]] = field(default_factory=list)       # x, y, rayon (0..1)
    clone_ops: list[dict] = field(default_factory=list)  # {"src": (x,y), "points": [(x,y),...], "radius": r}
    redeye_points: list[tuple[float, float, float]] = field(default_factory=list)     # x, y, rayon (0..1)

    # Position / taille du produit sur le canevas final, APRÈS suppression du
    # fond — car recadrer la photo source n'a plus d'effet visible une fois
    # que le produit est ré-encadré automatiquement sur sa silhouette.
    canvas_offset_x: float = 0.0    # -0.45 (gauche) .. 0.45 (droite), fraction du canevas
    canvas_offset_y: float = 0.0    # -0.45 (haut) .. 0.45 (bas), fraction du canevas
    canvas_scale: float = 1.0       # 0.3 (petit) .. 2.0 (grand), multiplie la taille du produit

    def is_empty(self) -> bool:
        return (self.straighten_angle == 0.0 and self.crop_rect is None
                and not self.heal_spots and not self.clone_ops and not self.redeye_points
                and self.canvas_offset_x == 0.0 and self.canvas_offset_y == 0.0
                and self.canvas_scale == 1.0)

    def canvas_position(self) -> tuple[float, float, float]:
        return (self.canvas_offset_x, self.canvas_offset_y, self.canvas_scale)


def apply_image_edits(img: Image.Image, edits: Optional[ImageEdits]) -> Image.Image:
    """Applique dans l'ordre : redressement fin, recadrage, anti-taches,
    tampon de duplication puis correction des yeux rouges."""
    if edits is None or edits.is_empty():
        return img
    img = img.convert("RGB")

    if edits.straighten_angle:
        img = img.rotate(-edits.straighten_angle, expand=True, resample=Image.Resampling.BICUBIC,
                          fillcolor=(255, 255, 255))

    if edits.crop_rect:
        w, h = img.size
        l, t, r, b = edits.crop_rect
        box = (int(l * w), int(t * h), int(r * w), int(b * h))
        if box[2] - box[0] >= 2 and box[3] - box[1] >= 2:
            img = img.crop(box)

    w, h = img.size
    diag = math.hypot(w, h)

    for (nx, ny, nr) in edits.heal_spots:
        img = apply_heal_spot(img, int(nx * w), int(ny * h), max(2, int(nr * diag)))

    for op in edits.clone_ops:
        src = op.get("src")
        points = op.get("points") or []
        nr = op.get("radius", 0.02)
        if not src or not points:
            continue
        src_xy = (int(src[0] * w), int(src[1] * h))
        dest_points = [(int(px * w), int(py * h)) for (px, py) in points]
        img = apply_clone_stroke(img, src_xy, dest_points, max(2, int(nr * diag)))

    for (nx, ny, nr) in edits.redeye_points:
        img = apply_redeye_reduction(img, int(nx * w), int(ny * h), max(2, int(nr * diag)))

    return img


class ImageTask(QRunnable):
    """Une unité de travail : traiter une seule image dans un thread du pool.

    Après le traitement de l'image, exécute optionnellement (dans le même
    thread de fond, donc sans bloquer l'UI) la génération de fiche produit
    IA et/ou l'upload vers NEXUS Market — chaque étape échoue indépendamment
    sans faire échouer le traitement de l'image elle-même."""

    def __init__(self, path: Path, config: ProcessingConfig, manager: "BatchManager", rotation: int = 0,
                 integrations: Optional[IntegrationsConfig] = None, edits: Optional[ImageEdits] = None):
        super().__init__()
        self.path = path
        self.config = config
        self.manager = manager
        self.rotation = rotation
        self.integrations = integrations or IntegrationsConfig()
        self.edits = edits
        self.setAutoDelete(True)

    def run(self):
        if self.manager.is_cancelled():
            return
        try:
            pipeline = EcommercePipeline(self.config)
            with Image.open(self.path) as im:
                im.load()
                if self.rotation:
                    im = rotate_clockwise(im, self.rotation)
                if self.edits is not None:
                    im = apply_image_edits(im, self.edits)
                position = self.edits.canvas_position() if self.edits is not None else None
                processed = pipeline.process_image(im, position=position)
            result = BatchResult(source_path=self.path, image=processed)
        except Exception as exc:  # noqa: BLE001
            logger.error("Échec du traitement de %s : %s", self.path, exc)
            logger.debug(traceback.format_exc())
            result = BatchResult(source_path=self.path, error=str(exc))
            self.manager.report_result(result)
            return

        if self.config.color_variants_enabled:
            hues = parse_hue_list(self.config.color_variants_hues)
            for hue in hues:
                try:
                    with Image.open(self.path) as im_variant:
                        im_variant.load()
                        if self.rotation:
                            im_variant = rotate_clockwise(im_variant, self.rotation)
                        if self.edits is not None:
                            im_variant = apply_image_edits(im_variant, self.edits)
                        variant_img = pipeline.process_image(im_variant, position=position, variant_hue=hue)
                    result.color_variants[hue] = variant_img
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Variante couleur (%s°) échouée pour %s : %s", hue, self.path, exc)

        if self.config.ai_tagging_enabled:
            try:
                meta = generate_ai_metadata(processed, self.integrations.anthropic_api_key, self.integrations.ai_model)
                result.ai_title = meta.get("title")
                result.ai_description = meta.get("description")
                result.ai_category = meta.get("category")
                result.ai_tags = meta.get("tags", [])
            except Exception as exc:  # noqa: BLE001
                result.ai_error = str(exc)
                logger.warning("Métadonnées IA indisponibles pour %s : %s", self.path, exc)

        if self.config.supabase_upload_enabled:
            try:
                data, ext, content_type = serialize_image(processed, self.config)
                remote_path = build_remote_path(self.integrations.supabase_path_prefix, self.path.stem, ext)
                result.supabase_url = upload_to_supabase(
                    data, remote_path, content_type,
                    self.integrations.supabase_url, self.integrations.supabase_key, self.integrations.supabase_bucket,
                )
            except Exception as exc:  # noqa: BLE001
                result.upload_error = str(exc)
                logger.warning("Upload NEXUS Market échoué pour %s : %s", self.path, exc)

        self.manager.report_result(result)


class BatchManager(QObject):
    """Orchestre un lot de traitements en parallèle via QThreadPool."""
    progress_signal = pyqtSignal(int, int, str)   # (terminés, total, nom_fichier)
    item_started_signal = pyqtSignal(str)          # chemin de l'image qui démarre
    item_done_signal = pyqtSignal(object)          # BatchResult
    finished_signal = pyqtSignal(int, int)         # (succès, échecs)

    def __init__(self, paths: list[Path], config: ProcessingConfig, rotations: Optional[dict[str, int]] = None,
                 max_workers: int = 2, integrations: Optional[IntegrationsConfig] = None,
                 edits: Optional[dict[str, ImageEdits]] = None):
        super().__init__()
        self.paths = paths
        self.config = config
        self.rotations = rotations or {}
        self.edits = edits or {}
        self.integrations = integrations or IntegrationsConfig()
        self.total = len(paths)
        self.pool = QThreadPool()
        self.pool.setMaxThreadCount(max(1, max_workers))
        self._mutex = QMutex()
        self._completed = 0
        self._success = 0
        self._failed = 0
        self._cancelled = False

    def is_cancelled(self) -> bool:
        with QMutexLocker(self._mutex):
            return self._cancelled

    def cancel(self):
        with QMutexLocker(self._mutex):
            self._cancelled = True
        self.pool.clear()  # retire les tâches pas encore démarrées

    def start(self):
        for path in self.paths:
            self.item_started_signal.emit(str(path))
            task = ImageTask(path, self.config, self, rotation=self.rotations.get(str(path), 0),
                              integrations=self.integrations, edits=self.edits.get(str(path)))
            self.pool.start(task)

    def report_result(self, result: BatchResult):
        with QMutexLocker(self._mutex):
            self._completed += 1
            if result.error:
                self._failed += 1
            else:
                self._success += 1
            completed, success, failed = self._completed, self._success, self._failed

        self.progress_signal.emit(completed, self.total, result.source_path.name)
        self.item_done_signal.emit(result)
        if completed >= self.total:
            self.finished_signal.emit(success, failed)

    def wait_for_done(self):
        self.pool.waitForDone()


class UploadSignals(QObject):
    """Signaux pour un upload NEXUS Market déclenché manuellement (hors lot)."""
    done = pyqtSignal(str, str)   # (chemin source, URL publique)
    error = pyqtSignal(str, str)  # (chemin source, message d'erreur)


class UploadTask(QRunnable):
    """Upload une image déjà traitée vers Supabase Storage, dans un thread de
    fond, pour ne jamais bloquer l'interface le temps de l'appel réseau."""

    def __init__(self, path_str: str, image: Image.Image, config: ProcessingConfig,
                 integrations: IntegrationsConfig, signals: UploadSignals):
        super().__init__()
        self.path_str = path_str
        self.image = image
        self.config = config
        self.integrations = integrations
        self.signals = signals
        self.setAutoDelete(True)

    def run(self):
        try:
            data, ext, content_type = serialize_image(self.image, self.config)
            remote_path = build_remote_path(self.integrations.supabase_path_prefix,
                                             Path(self.path_str).stem, ext)
            url = upload_to_supabase(
                data, remote_path, content_type,
                self.integrations.supabase_url, self.integrations.supabase_key, self.integrations.supabase_bucket,
            )
            self.signals.done.emit(self.path_str, url)
        except Exception as exc:  # noqa: BLE001
            self.signals.error.emit(self.path_str, str(exc))


class AITagSignals(QObject):
    """Signaux pour une (re)génération de fiche IA déclenchée manuellement."""
    done = pyqtSignal(str, dict)  # (chemin source, métadonnées)
    error = pyqtSignal(str, str)  # (chemin source, message d'erreur)


class AITagTask(QRunnable):
    """Régénère uniquement la fiche produit IA d'une image déjà traitée,
    sans retraiter l'image ni la ré-uploader — utile pour réessayer après
    une erreur réseau ponctuelle."""

    def __init__(self, path_str: str, image: Image.Image, integrations: IntegrationsConfig, signals: AITagSignals):
        super().__init__()
        self.path_str = path_str
        self.image = image
        self.integrations = integrations
        self.signals = signals
        self.setAutoDelete(True)

    def run(self):
        try:
            meta = generate_ai_metadata(self.image, self.integrations.anthropic_api_key, self.integrations.ai_model)
            self.signals.done.emit(self.path_str, meta)
        except Exception as exc:  # noqa: BLE001
            self.signals.error.emit(self.path_str, str(exc))


# ==========================================================================
# 5. WIDGETS UTILITAIRES
# ==========================================================================

class ScaledPreviewLabel(QLabel):
    """QLabel qui redimensionne TOUJOURS son image pour qu'elle tienne
    entièrement dans la zone visible (comme `object-fit: contain`), en
    conservant les proportions et en se réajustant dynamiquement au
    redimensionnement de la fenêtre.

    Un QLabel.setPixmap() classique affiche l'image à sa taille native,
    centrée — si l'image est plus grande que la zone disponible (cas
    fréquent avec les photos actuelles, souvent bien plus grandes que le
    panneau d'aperçu), elle déborde et se retrouve rognée sur les bords,
    donnant l'impression d'un cadrage aléatoire/mal centré. Cette classe
    corrige ce comportement."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._source_pixmap: Optional[QPixmap] = None

    def setPixmap(self, pixmap: QPixmap):  # noqa: N802 (override Qt naming)
        self._source_pixmap = pixmap
        self._rescale()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._rescale()

    def clear(self):
        self._source_pixmap = None
        super().clear()

    def setText(self, text: str):  # noqa: N802 (override Qt naming)
        self._source_pixmap = None
        super().setText(text)

    def _rescale(self):
        if self._source_pixmap is None or self._source_pixmap.isNull():
            return
        scaled = self._source_pixmap.scaled(
            self.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation
        )
        super().setPixmap(scaled)


class DropZoneLabel(ScaledPreviewLabel):
    files_dropped = pyqtSignal(list)

    def __init__(self, text: str):
        super().__init__(text)
        self.setAlignment(Qt.AlignCenter)
        self.setAcceptDrops(True)
        self.setMinimumSize(240, 240)
        self.setObjectName("dropZone")

    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()

    def dropEvent(self, event: QDropEvent):
        paths = [Path(url.toLocalFile()) for url in event.mimeData().urls()]
        self.files_dropped.emit(paths)


def pil_to_pixmap(pil_img: Image.Image, max_size: int = 400) -> QPixmap:
    img_copy = pil_img.copy()
    img_copy.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    if img_copy.mode == "RGBA":
        # Composite sur un damier gris clair/gris foncé, façon Photoshop, pour
        # que la transparence soit visible dans l'aperçu au lieu d'apparaître
        # comme un fond noir indéfini.
        img_copy = Image.alpha_composite(_checkerboard(img_copy.size), img_copy)
    img_copy = img_copy.convert("RGB")
    data = img_copy.tobytes("raw", "RGB")
    qimg = QImage(data, img_copy.width, img_copy.height, img_copy.width * 3, QImage.Format_RGB888)
    return QPixmap.fromImage(qimg)


def _checkerboard(size: tuple[int, int], cell: int = 10) -> Image.Image:
    board = Image.new("RGBA", size, (235, 235, 235, 255))
    draw = ImageDraw.Draw(board)
    c1 = (200, 200, 200, 255)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2 == 0:
                draw.rectangle([x, y, x + cell, y + cell], fill=c1)
    return board


def status_icon(color: str) -> QIcon:
    """Génère une petite pastille de couleur pour représenter un statut."""
    pixmap = QPixmap(16, 16)
    pixmap.fill(Qt.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.Antialiasing)
    painter.setBrush(QBrush(QColor(color)))
    painter.setPen(Qt.NoPen)
    painter.drawEllipse(2, 2, 12, 12)
    painter.end()
    return QIcon(pixmap)


_STATUS_COLORS = {
    "pending": "#6c6f7a",
    "processing": "#f2b705",
    "success": "#2ecc71",
    "error": "#e74c3c",
}
_status_icon_cache: dict[str, QIcon] = {}


def get_status_icon(status: str) -> QIcon:
    """Construit (et met en cache) l'icône de statut à la demande.

    Doit être appelé APRÈS la création de QApplication, car QPixmap/QIcon
    ne peuvent pas être instanciés avant elle.
    """
    if status not in _status_icon_cache:
        _status_icon_cache[status] = status_icon(_STATUS_COLORS[status])
    return _status_icon_cache[status]

SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}


def collect_image_paths(paths: list[Path]) -> list[Path]:
    collected: list[Path] = []
    for p in paths:
        if p.is_dir():
            collected.extend(
                sorted(f for f in p.rglob("*") if f.suffix.lower() in SUPPORTED_EXTENSIONS)
            )
        elif p.suffix.lower() in SUPPORTED_EXTENSIONS:
            collected.append(p)
    return collected


def sanitize_preset_name(name: str) -> str:
    """Transforme un nom de preset (ex. 'Amazon (1000x1000, fond blanc)') en nom de dossier sûr."""
    base = re.sub(r"\(.*?\)", "", name).strip()
    base = re.sub(r"[^\w\-]+", "_", base, flags=re.UNICODE).strip("_")
    return base or "preset"


# ==========================================================================
# 5bis. COMPARATEUR AVANT / APRÈS (curseur glissant)
# ==========================================================================

class CompareSliderWidget(QWidget):
    """Superpose deux images (avant / après) avec un curseur glissant interactif."""

    def __init__(self):
        super().__init__()
        self.setObjectName("compareWidget")
        self.setMinimumSize(320, 320)
        self._before: Optional[QPixmap] = None
        self._after: Optional[QPixmap] = None
        self._ratio: float = 0.5
        self._dragging: bool = False
        self.setMouseTracking(True)
        self.setCursor(Qt.PointingHandCursor)

    def set_images(self, before: Optional[Image.Image], after: Optional[Image.Image]):
        self._before = pil_to_pixmap(before, max_size=700) if before is not None else None
        self._after = pil_to_pixmap(after, max_size=700) if after is not None else None
        self._ratio = 0.5
        self.update()

    def clear(self):
        self._before = None
        self._after = None
        self.update()

    # -- interaction souris ------------------------------------------------
    def mousePressEvent(self, event):
        if self._before is not None and self._after is not None:
            self._dragging = True
            self._update_ratio_from_x(event.pos().x())

    def mouseMoveEvent(self, event):
        if self._dragging:
            self._update_ratio_from_x(event.pos().x())

    def mouseReleaseEvent(self, event):
        self._dragging = False

    def _update_ratio_from_x(self, x: int):
        rect = self._image_rect()
        if rect.width() <= 0:
            return
        ratio = (x - rect.left()) / rect.width()
        self._ratio = max(0.0, min(1.0, ratio))
        self.update()

    def _image_rect(self) -> QRect:
        """Rectangle où les images sont dessinées (ajustées à l'échelle, centrées)."""
        base_pixmap = self._before or self._after
        if base_pixmap is None:
            return self.rect()
        scaled = base_pixmap.size().scaled(self.size(), Qt.KeepAspectRatio)
        x = (self.width() - scaled.width()) // 2
        y = (self.height() - scaled.height()) // 2
        return QRect(x, y, scaled.width(), scaled.height())

    # -- rendu ---------------------------------------------------------------
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)
        painter.fillRect(self.rect(), QColor("#26272d"))

        if self._before is None or self._after is None:
            painter.setPen(QColor("#888a94"))
            painter.drawText(
                self.rect(), Qt.AlignCenter,
                "Sélectionnez une image déjà traitée\npour comparer avant / après"
            )
            painter.end()
            return

        rect = self._image_rect()
        painter.drawPixmap(rect, self._after)

        split_x = rect.left() + int(rect.width() * self._ratio)
        before_clip = QRect(rect.left(), rect.top(), split_x - rect.left(), rect.height())
        painter.save()
        painter.setClipRect(before_clip)
        painter.drawPixmap(rect, self._before)
        painter.restore()

        painter.setPen(QPen(QColor("#ffffff"), 2))
        painter.drawLine(split_x, rect.top(), split_x, rect.bottom())

        center_y = rect.top() + rect.height() // 2
        painter.setBrush(QBrush(QColor("#2f80ed")))
        painter.setPen(QPen(QColor("#ffffff"), 2))
        painter.drawEllipse(QPointF(split_x, center_y), 11, 11)
        painter.drawLine(int(split_x - 4), int(center_y), int(split_x - 1), int(center_y))
        painter.drawLine(int(split_x + 1), int(center_y), int(split_x + 4), int(center_y))

        painter.setPen(QColor("#ffffff"))
        painter.drawText(rect.adjusted(10, 8, 0, 0), Qt.AlignLeft | Qt.AlignTop, "AVANT")
        painter.drawText(rect.adjusted(0, 8, -10, 0), Qt.AlignRight | Qt.AlignTop, "APRÈS")
        painter.end()


# ==========================================================================
# 6. PANNEAU DE RÉGLAGES
# ==========================================================================

class SettingsPanel(QWidget):
    config_changed = pyqtSignal()

    def __init__(self):
        super().__init__()
        self.all_presets: dict[str, ProcessingConfig] = {
            **BUILTIN_PRESETS, **load_custom_presets()
        }
        self.config = ProcessingConfig()
        self._build_ui()
        self._apply_config_to_ui(self.config)

    def _build_ui(self):
        outer_layout = QVBoxLayout(self)
        outer_layout.setContentsMargins(4, 4, 4, 4)

        # --- Barre de recherche + mode avancé (v9.0) ---------------------
        # Le panneau de réglages empilait auparavant 18 blocs dans une seule
        # colonne sans fin ; il est maintenant organisé par catégorie, avec
        # une recherche qui saute directement à la bonne catégorie/réglage,
        # et un mode « Simple » par défaut qui masque les réglages experts
        # pour ne pas noyer un usage rapide.
        #
        # Remarque technique : un QTabWidget classique (onglets horizontaux)
        # a été essayé puis abandonné — la barre d'onglets ne tient pas dans
        # une colonne étroite (~300 px) et rendait certains onglets et
        # réglages inaccessibles, sans barre de défilement pour les
        # atteindre. Un sélecteur déroulant + pages empilées n'a pas ce
        # problème de largeur, et chaque page a en plus SA PROPRE zone de
        # défilement verticale indépendante.
        header_row = QHBoxLayout()
        self.settings_search_edit = QLineEdit()
        self.settings_search_edit.setPlaceholderText("🔍 Rechercher un réglage…")
        self.settings_search_edit.textChanged.connect(self._on_settings_search)
        header_row.addWidget(self.settings_search_edit)
        self.advanced_mode_checkbox = QCheckBox("Mode avancé")
        self.advanced_mode_checkbox.setToolTip(
            "Affiche les réglages experts (HSL, courbes RVB, finition\n"
            "avancée, netteté manuelle, variantes de couleur)."
        )
        self.advanced_mode_checkbox.stateChanged.connect(self._on_advanced_mode_toggled)
        header_row.addWidget(self.advanced_mode_checkbox)
        outer_layout.addLayout(header_row)

        self.settings_category_combo = QComboBox()
        outer_layout.addWidget(self.settings_category_combo)

        self.settings_stack = QStackedWidget()
        outer_layout.addWidget(self.settings_stack, 1)

        self._advanced_groups: list[QGroupBox] = []
        self._searchable_groups: list[tuple[QGroupBox, list[str]]] = []
        self._favorite_names: list[str] = load_favorite_presets()
        self._page_stack_index: dict[QWidget, int] = {}

        def make_page() -> tuple[QWidget, QVBoxLayout]:
            page = QWidget()
            page_layout = QVBoxLayout(page)
            return page, page_layout

        def add_category(label: str, page: QWidget):
            scroll = QScrollArea()
            scroll.setWidgetResizable(True)
            scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
            scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
            scroll.setWidget(page)
            index = self.settings_stack.addWidget(scroll)
            self.settings_category_combo.addItem(label)
            self._page_stack_index[page] = index

        accueil_page, accueil_layout = make_page()
        canevas_page, canevas_layout = make_page()
        couleur_page, couleur_layout = make_page()
        effets_page, effets_layout = make_page()
        filigrane_page, filigrane_layout = make_page()
        ia_page, ia_layout = make_page()
        export_page, export_layout = make_page()

        add_category("🏠 Accueil", accueil_page)
        add_category("🖼 Fond et Canevas", canevas_page)
        add_category("🎨 Couleur et Lumière", couleur_page)
        add_category("✨ Effets et Finition", effets_page)
        add_category("🏷 Filigrane", filigrane_page)
        add_category("🤖 IA", ia_page)
        add_category("📤 Export et NEXUS", export_page)

        self.settings_category_combo.currentIndexChanged.connect(self.settings_stack.setCurrentIndex)

        # --- Presets ---
        preset_group = QGroupBox("Préréglages")
        preset_layout = QVBoxLayout(preset_group)
        self.preset_combo = QComboBox()
        self.preset_combo.setSizeAdjustPolicy(QComboBox.AdjustToMinimumContentsLengthWithIcon)
        self.preset_combo.setMinimumContentsLength(14)
        self._refresh_preset_combo()
        self.preset_combo.currentTextChanged.connect(self._on_preset_selected)
        preset_layout.addWidget(self.preset_combo)

        preset_btn_row = QHBoxLayout()
        self.btn_save_preset = QPushButton("💾 Enregistrer")
        self.btn_save_preset.clicked.connect(self._save_current_as_preset)
        self.btn_delete_preset = QPushButton("🗑 Supprimer")
        self.btn_delete_preset.clicked.connect(self._delete_current_preset)
        preset_btn_row.addWidget(self.btn_save_preset)
        preset_btn_row.addWidget(self.btn_delete_preset)
        preset_layout.addLayout(preset_btn_row)

        self.btn_favorite_preset = QPushButton("☆ Ajouter aux favoris")
        self.btn_favorite_preset.setToolTip(
            "Ajoute ou retire le preset sélectionné des favoris (accès rapide "
            "depuis l'onglet Accueil)."
        )
        self.btn_favorite_preset.clicked.connect(self._toggle_favorite_preset)
        preset_layout.addWidget(self.btn_favorite_preset)
        self._reg(preset_group, accueil_layout)
        self.preset_combo.currentTextChanged.connect(self._update_favorite_button_text)
        self._update_favorite_button_text()

        # --- Profil produit (v9.0) ---------------------------------------
        profile_group = QGroupBox("📦 Profil produit")
        profile_v_layout = QVBoxLayout(profile_group)
        profile_note = QLabel(
            "Point de départ rapide : applique une combinaison de réglages "
            "adaptée au type de produit, par-dessus les réglages actuels."
        )
        profile_note.setWordWrap(True)
        profile_v_layout.addWidget(profile_note)
        self.product_profile_combo = QComboBox()
        self.product_profile_combo.setSizeAdjustPolicy(QComboBox.AdjustToMinimumContentsLengthWithIcon)
        self.product_profile_combo.setMinimumContentsLength(14)
        self.product_profile_combo.addItem("Choisir un profil…")
        self.product_profile_combo.addItems(list(PRODUCT_PROFILES.keys()))
        self.product_profile_combo.currentTextChanged.connect(self._on_product_profile_selected)
        profile_v_layout.addWidget(self.product_profile_combo)
        self._reg(profile_group, accueil_layout)

        # --- Favoris (v9.0) ------------------------------------------------
        favorites_group = QGroupBox("⭐ Favoris")
        self.favorites_layout = QVBoxLayout(favorites_group)
        self._refresh_favorites_ui()
        self._reg(favorites_group, accueil_layout)

        # --- Tableau de bord (v9.0) -----------------------------------
        dashboard_group = QGroupBox("📊 Tableau de bord")
        dashboard_v_layout = QVBoxLayout(dashboard_group)
        self.dashboard_stats_label = QLabel("Aucune image en file.")
        self.dashboard_stats_label.setWordWrap(True)
        dashboard_v_layout.addWidget(self.dashboard_stats_label)
        dashboard_v_layout.addWidget(QLabel("<b>Derniers lots traités</b>"))
        self.dashboard_history_label = QLabel("—")
        self.dashboard_history_label.setWordWrap(True)
        dashboard_v_layout.addWidget(self.dashboard_history_label)
        self._refresh_history_ui()
        self._reg(dashboard_group, accueil_layout)

        # --- Canevas ---
        canvas_group = QGroupBox("Canevas de sortie")
        canvas_form = QFormLayout(canvas_group)
        canvas_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.width_spin = QSpinBox(minimum=200, maximum=8000, value=1080, singleStep=10)
        self.height_spin = QSpinBox(minimum=200, maximum=8000, value=1080, singleStep=10)
        self.width_spin.valueChanged.connect(self._on_manual_change)
        self.height_spin.valueChanged.connect(self._on_manual_change)
        canvas_form.addRow("Largeur (px)", self.width_spin)
        canvas_form.addRow("Hauteur (px)", self.height_spin)

        self.bg_color_btn = QPushButton()
        self.bg_color_btn.clicked.connect(self._pick_bg_color)
        canvas_form.addRow("Couleur de fond", self.bg_color_btn)

        self.bg_mode_combo = QComboBox()
        self.bg_mode_combo.addItems(["Uni", "Dégradé", "Image importée", "Transparent (PNG/WEBP)"])
        self.bg_mode_combo.currentTextChanged.connect(self._on_bg_mode_changed)
        canvas_form.addRow("Type de fond", self.bg_mode_combo)

        self.transparent_note = QLabel(
            "ℹ️ Le fond transparent nécessite un export en PNG ou WEBP (réglages « Export » "
            "ci-dessous) — en JPEG, il sera automatiquement aplati sur un fond blanc."
        )
        self.transparent_note.setWordWrap(True)
        canvas_form.addRow(self.transparent_note)

        self.gradient_preset_combo = QComboBox()
        self.gradient_preset_combo.addItem("Personnalisé")
        self.gradient_preset_combo.addItems(list(GRADIENT_PRESETS.keys()))
        self.gradient_preset_combo.currentTextChanged.connect(self._apply_gradient_preset)
        canvas_form.addRow("Dégradés prédéfinis", self.gradient_preset_combo)

        self.bg_gradient_color2_btn = QPushButton()
        self.bg_gradient_color2_btn.clicked.connect(self._pick_bg_gradient_color2)
        canvas_form.addRow("2ᵉ couleur (dégradé)", self.bg_gradient_color2_btn)

        self.bg_gradient_direction_combo = QComboBox()
        self.bg_gradient_direction_combo.addItems(["Vertical", "Horizontal", "Diagonal", "Radial"])
        self.bg_gradient_direction_combo.currentTextChanged.connect(self._on_manual_change)
        canvas_form.addRow("Direction du dégradé", self.bg_gradient_direction_combo)

        self.bg_image_btn = QPushButton("📁 Choisir une image de fond…")
        self.bg_image_btn.clicked.connect(self._pick_bg_image)
        canvas_form.addRow("Image / texture de fond", self.bg_image_btn)

        self.padding_slider = QSlider(Qt.Horizontal, minimum=0, maximum=50, value=20)
        self.padding_slider.valueChanged.connect(self._on_manual_change)
        canvas_form.addRow("Marge (%)", self.padding_slider)
        self._reg(canvas_group, canevas_layout)

        # --- Ombre ---
        shadow_group = QGroupBox("Ombre portée")
        shadow_form = QFormLayout(shadow_group)
        shadow_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.shadow_checkbox = QCheckBox("Activer l'ombre")
        self.shadow_checkbox.setChecked(True)
        self.shadow_checkbox.stateChanged.connect(self._on_manual_change)
        shadow_form.addRow(self.shadow_checkbox)
        self.shadow_style_combo = QComboBox()
        self.shadow_style_combo.addItems(["Portée", "Contact"])
        self.shadow_style_combo.setToolTip(
            "Portée : copie décalée et floutée de la silhouette (classique).\n"
            "Contact : ombre elliptique réaliste posée au sol sous le produit "
            "(idéal pour des objets posés à plat)."
        )
        self.shadow_style_combo.currentTextChanged.connect(self._on_manual_change)
        shadow_form.addRow("Style d'ombre", self.shadow_style_combo)
        self.shadow_opacity_slider = QSlider(Qt.Horizontal, minimum=0, maximum=255, value=100)
        self.shadow_opacity_slider.valueChanged.connect(self._on_manual_change)
        shadow_form.addRow("Opacité", self.shadow_opacity_slider)
        self.shadow_blur_slider = QSlider(Qt.Horizontal, minimum=0, maximum=40, value=15)
        self.shadow_blur_slider.valueChanged.connect(self._on_manual_change)
        shadow_form.addRow("Flou", self.shadow_blur_slider)
        self._reg(shadow_group, canevas_layout)

        # --- Presets de look en un clic ---
        look_group = QGroupBox("✨ Presets de look")
        look_form = QFormLayout(look_group)
        look_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.look_preset_combo = QComboBox()
        self.look_preset_combo.addItems(["Aucun"] + list(LOOK_PRESETS.keys()))
        self.look_preset_combo.setToolTip(
            "Applique instantanément une combinaison de réglages couleur/contraste "
            "par-dessus les réglages actuels (n'affecte pas le canevas ni l'export)."
        )
        self.look_preset_combo.currentTextChanged.connect(self._on_look_preset_selected)
        look_form.addRow("Appliquer un look", self.look_preset_combo)
        self._reg(look_group, couleur_layout)

        # --- Couleurs / contraste ---
        color_group = QGroupBox("Retouche automatique")
        color_form = QFormLayout(color_group)
        color_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.contrast_spin = QDoubleSpinBox(minimum=0.5, maximum=2.0, singleStep=0.05, value=1.10)
        self.contrast_spin.valueChanged.connect(self._on_manual_change)
        self.brightness_spin = QDoubleSpinBox(minimum=0.5, maximum=2.0, singleStep=0.05, value=1.05)
        self.brightness_spin.valueChanged.connect(self._on_manual_change)
        color_form.addRow("Contraste", self.contrast_spin)
        color_form.addRow("Luminosité", self.brightness_spin)
        self._reg(color_group, couleur_layout)

        # --- Retouche couleur pro ---
        pro_color_group = QGroupBox("🎨 Retouche couleur pro")
        pro_color_form = QFormLayout(pro_color_group)
        pro_color_form.setRowWrapPolicy(QFormLayout.WrapLongRows)

        self.saturation_spin = QDoubleSpinBox(minimum=0.0, maximum=2.0, singleStep=0.05, value=1.0)
        self.saturation_spin.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Saturation", self.saturation_spin)

        self.auto_wb_checkbox = QCheckBox("Balance des blancs automatique")
        self.auto_wb_checkbox.setToolTip(
            "Neutralise automatiquement la dominante de couleur de chaque photo, "
            "comme si vous cliquiez sur une zone censée être grise/blanche."
        )
        self.auto_wb_checkbox.stateChanged.connect(self._on_manual_change)
        pro_color_form.addRow(self.auto_wb_checkbox)

        self.wb_temp_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.wb_temp_slider.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Balance (froid ↔ chaud)", self.wb_temp_slider)

        self.wb_tint_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.wb_tint_slider.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Teinte (magenta ↔ vert)", self.wb_tint_slider)

        self.levels_black_spin = QSpinBox(minimum=0, maximum=254, value=0)
        self.levels_black_spin.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Niveaux — point noir", self.levels_black_spin)

        self.levels_white_spin = QSpinBox(minimum=1, maximum=255, value=255)
        self.levels_white_spin.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Niveaux — point blanc", self.levels_white_spin)

        self.levels_gamma_spin = QDoubleSpinBox(minimum=0.1, maximum=3.0, singleStep=0.05, value=1.0)
        self.levels_gamma_spin.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Niveaux — gamma", self.levels_gamma_spin)

        self.highlights_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.highlights_slider.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Hautes lumières", self.highlights_slider)

        self.shadows_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.shadows_slider.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Ombres", self.shadows_slider)

        self.color_style_combo = QComboBox()
        self.color_style_combo.addItems([
            "Couleur", "Noir & blanc", "Sépia", "Film chaud", "Bleu froid",
            "Vif (Pop)", "Mat (Fade)", "Noir contrasté", "Pastel",
        ])
        self.color_style_combo.currentTextChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Style", self.color_style_combo)

        self.vignette_checkbox = QCheckBox("Activer la vignette")
        self.vignette_checkbox.stateChanged.connect(self._on_manual_change)
        pro_color_form.addRow(self.vignette_checkbox)
        self.vignette_strength_slider = QSlider(Qt.Horizontal, minimum=0, maximum=100, value=40)
        self.vignette_strength_slider.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Intensité de la vignette", self.vignette_strength_slider)

        self.bg_blur_checkbox = QCheckBox("Flou d'arrière-plan (bokeh)")
        self.bg_blur_checkbox.setToolTip("Floute l'arrière-plan d'origine autour du produit détouré.")
        self.bg_blur_checkbox.stateChanged.connect(self._on_manual_change)
        pro_color_form.addRow(self.bg_blur_checkbox)
        self.bg_blur_radius_slider = QSlider(Qt.Horizontal, minimum=1, maximum=40, value=12)
        self.bg_blur_radius_slider.valueChanged.connect(self._on_manual_change)
        pro_color_form.addRow("Intensité du flou", self.bg_blur_radius_slider)

        bg_blur_note = QLabel("ℹ️ Le flou d'arrière-plan ne s'applique que si « Supprimer le "
                              "fond (IA) » est désactivé (sinon le fond est déjà remplacé).")
        bg_blur_note.setWordWrap(True)
        pro_color_form.addRow(bg_blur_note)

        self._reg(pro_color_group, couleur_layout)

        # --- Correction sélective par teinte (HSL) ---
        hsl_group = QGroupBox("🌈 Correction sélective (HSL)")
        hsl_form = QFormLayout(hsl_group)
        hsl_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        hsl_note = QLabel("Ajuste teinte / saturation / luminance indépendamment pour chaque famille de couleur.")
        hsl_note.setWordWrap(True)
        hsl_form.addRow(hsl_note)
        self.hsl_band_combo = QComboBox()
        self.hsl_band_combo.addItems(["Rouges", "Jaunes", "Verts", "Cyans", "Bleus", "Magentas"])
        self.hsl_band_combo.currentTextChanged.connect(self._on_hsl_band_selected)
        hsl_form.addRow("Bande de couleur", self.hsl_band_combo)
        self.hsl_hue_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.hsl_hue_slider.valueChanged.connect(self._on_hsl_value_changed)
        hsl_form.addRow("Teinte", self.hsl_hue_slider)
        self.hsl_sat_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.hsl_sat_slider.valueChanged.connect(self._on_hsl_value_changed)
        hsl_form.addRow("Saturation", self.hsl_sat_slider)
        self.hsl_lum_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.hsl_lum_slider.valueChanged.connect(self._on_hsl_value_changed)
        hsl_form.addRow("Luminance", self.hsl_lum_slider)
        self._hsl_bands = {band: {"hue": 0, "sat": 0, "lum": 0} for band in
                            ("Rouges", "Jaunes", "Verts", "Cyans", "Bleus", "Magentas")}
        self._reg(hsl_group, couleur_layout, advanced=True)

        # --- Courbes RVB (par point ombres / tons moyens / hautes lumières) ---
        curves_group = QGroupBox("📈 Courbes RVB")
        curves_form = QFormLayout(curves_group)
        curves_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        curves_note = QLabel("Chaque courbe se règle par 3 points : ombres, tons moyens, hautes lumières.")
        curves_note.setWordWrap(True)
        curves_form.addRow(curves_note)
        self._curve_sliders = {}
        for channel_key, channel_label in (("master", "RVB (global)"), ("red", "Rouge"),
                                            ("green", "Vert"), ("blue", "Bleu")):
            row = QHBoxLayout()
            sliders = []
            for point_label in ("Ombres", "Tons moy.", "Hautes lum."):
                s = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
                s.setToolTip(f"{channel_label} — {point_label}")
                s.valueChanged.connect(self._on_manual_change)
                sliders.append(s)
                row.addWidget(s)
            self._curve_sliders[channel_key] = sliders
            wrapper = QWidget()
            wrapper.setLayout(row)
            curves_form.addRow(channel_label, wrapper)
        self._reg(curves_group, couleur_layout, advanced=True)

        # --- Clarté, split toning, dehaze ---
        finish_group = QGroupBox("✨ Finition avancée")
        finish_form = QFormLayout(finish_group)
        finish_form.setRowWrapPolicy(QFormLayout.WrapLongRows)

        self.clarity_checkbox = QCheckBox("Clarté / texture")
        self.clarity_checkbox.stateChanged.connect(self._on_manual_change)
        finish_form.addRow(self.clarity_checkbox)
        self.clarity_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.clarity_slider.valueChanged.connect(self._on_manual_change)
        finish_form.addRow("Intensité clarté", self.clarity_slider)

        self.dehaze_checkbox = QCheckBox("Dehaze (brume / voile)")
        self.dehaze_checkbox.setToolTip("Corrige la brume ou le voile atmosphérique de la photo.")
        self.dehaze_checkbox.stateChanged.connect(self._on_manual_change)
        finish_form.addRow(self.dehaze_checkbox)
        self.dehaze_slider = QSlider(Qt.Horizontal, minimum=0, maximum=100, value=0)
        self.dehaze_slider.valueChanged.connect(self._on_manual_change)
        finish_form.addRow("Intensité dehaze", self.dehaze_slider)

        self.split_toning_checkbox = QCheckBox("Split toning")
        self.split_toning_checkbox.setToolTip("Applique une teinte différente aux ombres et aux hautes lumières.")
        self.split_toning_checkbox.stateChanged.connect(self._on_manual_change)
        finish_form.addRow(self.split_toning_checkbox)
        self.split_shadow_hue_slider = QSlider(Qt.Horizontal, minimum=0, maximum=360, value=220)
        self.split_shadow_hue_slider.valueChanged.connect(self._on_manual_change)
        finish_form.addRow("Teinte des ombres", self.split_shadow_hue_slider)
        self.split_shadow_sat_slider = QSlider(Qt.Horizontal, minimum=0, maximum=100, value=0)
        self.split_shadow_sat_slider.valueChanged.connect(self._on_manual_change)
        finish_form.addRow("Intensité ombres", self.split_shadow_sat_slider)
        self.split_highlight_hue_slider = QSlider(Qt.Horizontal, minimum=0, maximum=360, value=40)
        self.split_highlight_hue_slider.valueChanged.connect(self._on_manual_change)
        finish_form.addRow("Teinte des hautes lumières", self.split_highlight_hue_slider)
        self.split_highlight_sat_slider = QSlider(Qt.Horizontal, minimum=0, maximum=100, value=0)
        self.split_highlight_sat_slider.valueChanged.connect(self._on_manual_change)
        finish_form.addRow("Intensité hautes lumières", self.split_highlight_sat_slider)
        self.split_balance_slider = QSlider(Qt.Horizontal, minimum=-100, maximum=100, value=0)
        self.split_balance_slider.valueChanged.connect(self._on_manual_change)
        finish_form.addRow("Équilibre ombres ↔ lumières", self.split_balance_slider)
        self._reg(finish_group, effets_layout, advanced=True)

        # --- Netteté manuelle & réduction de bruit avancée ---
        sharp_group = QGroupBox("🔍 Netteté & bruit")
        sharp_form = QFormLayout(sharp_group)
        sharp_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.sharpen_mode_combo = QComboBox()
        self.sharpen_mode_combo.addItems(["Auto", "Manuel", "Off"])
        self.sharpen_mode_combo.setToolTip(
            "« Auto » utilise la retouche IA (case ci-dessus). « Manuel » applique "
            "un Unsharp Mask réglable ci-dessous. « Off » désactive toute netteté additionnelle."
        )
        self.sharpen_mode_combo.currentTextChanged.connect(self._on_manual_change)
        sharp_form.addRow("Mode de netteté", self.sharpen_mode_combo)
        self.sharpen_radius_spin = QDoubleSpinBox(minimum=0.1, maximum=10.0, singleStep=0.1, value=2.0)
        self.sharpen_radius_spin.valueChanged.connect(self._on_manual_change)
        sharp_form.addRow("Rayon", self.sharpen_radius_spin)
        self.sharpen_amount_slider = QSlider(Qt.Horizontal, minimum=0, maximum=300, value=100)
        self.sharpen_amount_slider.valueChanged.connect(self._on_manual_change)
        sharp_form.addRow("Quantité (%)", self.sharpen_amount_slider)
        self.sharpen_threshold_spin = QSpinBox(minimum=0, maximum=30, value=3)
        self.sharpen_threshold_spin.valueChanged.connect(self._on_manual_change)
        sharp_form.addRow("Seuil", self.sharpen_threshold_spin)

        self.denoise_lum_slider = QSlider(Qt.Horizontal, minimum=0, maximum=100, value=0)
        self.denoise_lum_slider.valueChanged.connect(self._on_manual_change)
        sharp_form.addRow("Bruit — luminance", self.denoise_lum_slider)
        self.denoise_color_slider = QSlider(Qt.Horizontal, minimum=0, maximum=100, value=0)
        self.denoise_color_slider.valueChanged.connect(self._on_manual_change)
        sharp_form.addRow("Bruit — couleur", self.denoise_color_slider)
        self._reg(sharp_group, effets_layout, advanced=True)

        # --- Bordure décorative & reflet miroir ---
        deco_group = QGroupBox("🖼 Bordure & reflet")
        deco_form = QFormLayout(deco_group)
        deco_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.border_checkbox = QCheckBox("Bordure / cadre décoratif")
        self.border_checkbox.stateChanged.connect(self._on_manual_change)
        deco_form.addRow(self.border_checkbox)
        self.border_style_combo = QComboBox()
        self.border_style_combo.addItems(["Simple", "Cadre + ombre", "Double liseré"])
        self.border_style_combo.currentTextChanged.connect(self._on_manual_change)
        deco_form.addRow("Style de bordure", self.border_style_combo)
        self.border_width_slider = QSlider(Qt.Horizontal, minimum=2, maximum=80, value=20)
        self.border_width_slider.valueChanged.connect(self._on_manual_change)
        deco_form.addRow("Épaisseur", self.border_width_slider)
        self.border_color_btn = QPushButton()
        self.border_color_btn.clicked.connect(self._pick_border_color)
        deco_form.addRow("Couleur de la bordure", self.border_color_btn)

        self.mirror_checkbox = QCheckBox("Effet miroir / reflet")
        self.mirror_checkbox.setToolTip("Idéal pour chaussures, bijoux, montres — effet « sol brillant ».")
        self.mirror_checkbox.stateChanged.connect(self._on_manual_change)
        deco_form.addRow(self.mirror_checkbox)
        self.mirror_height_slider = QSlider(Qt.Horizontal, minimum=10, maximum=60, value=35)
        self.mirror_height_slider.valueChanged.connect(self._on_manual_change)
        deco_form.addRow("Hauteur du reflet (%)", self.mirror_height_slider)
        self.mirror_fade_slider = QSlider(Qt.Horizontal, minimum=0, maximum=100, value=70)
        self.mirror_fade_slider.valueChanged.connect(self._on_manual_change)
        deco_form.addRow("Estompage du reflet", self.mirror_fade_slider)
        self.mirror_gap_slider = QSlider(Qt.Horizontal, minimum=0, maximum=60, value=0)
        self.mirror_gap_slider.valueChanged.connect(self._on_manual_change)
        deco_form.addRow("Espace produit ↔ reflet", self.mirror_gap_slider)
        self._reg(deco_group, effets_layout)

        # --- Productivité ---
        prod_group = QGroupBox("⚙️ Productivité")
        prod_form = QFormLayout(prod_group)
        prod_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.blur_check_checkbox = QCheckBox("Avertir si flou/exposition")
        self.blur_check_checkbox.setToolTip(
            "Analyse chaque photo avant le traitement par lot et permet\n"
            "d'exclure celles qui semblent floues ou mal exposées."
        )
        self.blur_check_checkbox.setChecked(True)
        self.blur_check_checkbox.stateChanged.connect(self._on_manual_change)
        prod_form.addRow(self.blur_check_checkbox)
        self.auto_crop_checkbox = QCheckBox("Recadrage automatique")
        self.auto_crop_checkbox.setToolTip(
            "Détecte automatiquement le produit dans la photo d'origine et recadre "
            "autour, avant le reste du traitement — utile pour des photos avec "
            "trop d'espace vide ou mal centrées."
        )
        self.auto_crop_checkbox.stateChanged.connect(self._on_manual_change)
        prod_form.addRow(self.auto_crop_checkbox)
        self.auto_crop_margin_slider = QSlider(Qt.Horizontal, minimum=0, maximum=40, value=8)
        self.auto_crop_margin_slider.valueChanged.connect(self._on_manual_change)
        prod_form.addRow("Marge autour du sujet (%)", self.auto_crop_margin_slider)
        self._reg(prod_group, accueil_layout)

        # --- Filigrane ---
        watermark_group = QGroupBox("Filigrane")
        watermark_form = QFormLayout(watermark_group)
        watermark_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.watermark_checkbox = QCheckBox("Activer le filigrane texte")
        self.watermark_checkbox.stateChanged.connect(self._on_manual_change)
        watermark_form.addRow(self.watermark_checkbox)
        self.watermark_text_edit = QLineEdit()
        self.watermark_text_edit.setPlaceholderText("© Ma Boutique")
        self.watermark_text_edit.textChanged.connect(self._on_manual_change)
        watermark_form.addRow("Texte", self.watermark_text_edit)
        self.watermark_position_combo = QComboBox()
        self.watermark_position_combo.addItems(["Bas droite", "Bas gauche", "Centre"])
        self.watermark_position_combo.currentTextChanged.connect(self._on_manual_change)
        watermark_form.addRow("Position", self.watermark_position_combo)
        self.watermark_opacity_slider = QSlider(Qt.Horizontal, minimum=0, maximum=255, value=160)
        self.watermark_opacity_slider.valueChanged.connect(self._on_manual_change)
        watermark_form.addRow("Opacité", self.watermark_opacity_slider)

        self.watermark_logo_checkbox = QCheckBox("Filigrane logo (image)")
        self.watermark_logo_checkbox.setToolTip(
            "Ajoute un filigrane logo/image, en plus ou à la place du filigrane texte."
        )
        self.watermark_logo_checkbox.stateChanged.connect(self._on_manual_change)
        watermark_form.addRow(self.watermark_logo_checkbox)
        self.watermark_logo_btn = QPushButton("📁 Choisir un logo…")
        self.watermark_logo_btn.clicked.connect(self._pick_watermark_logo)
        watermark_form.addRow(self.watermark_logo_btn)
        self.watermark_logo_scale_slider = QSlider(Qt.Horizontal, minimum=5, maximum=40, value=15)
        self.watermark_logo_scale_slider.valueChanged.connect(self._on_manual_change)
        watermark_form.addRow("Taille du logo (% largeur)", self.watermark_logo_scale_slider)
        self.watermark_logo_opacity_slider = QSlider(Qt.Horizontal, minimum=0, maximum=255, value=200)
        self.watermark_logo_opacity_slider.valueChanged.connect(self._on_manual_change)
        watermark_form.addRow("Opacité du logo", self.watermark_logo_opacity_slider)
        self._reg(watermark_group, filigrane_layout)

        # --- Variantes de couleur produit ---
        variants_group = QGroupBox("🎨 Variantes couleur produit")
        variants_form = QFormLayout(variants_group)
        variants_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.color_variants_checkbox = QCheckBox("Variantes de couleur")
        self.color_variants_checkbox.setToolTip(
            "Recolorise automatiquement le produit détouré selon les décalages de "
            "teinte indiqués (utile textile/accessoires) — chaque variante est "
            "exportée en plus de l'image principale."
        )
        self.color_variants_checkbox.stateChanged.connect(self._on_manual_change)
        variants_form.addRow(self.color_variants_checkbox)
        self.color_variants_hues_edit = QLineEdit()
        self.color_variants_hues_edit.setPlaceholderText("ex : 30, 120, 200 (degrés, 6 max)")
        self.color_variants_hues_edit.textChanged.connect(self._on_manual_change)
        variants_form.addRow("Décalages de teinte", self.color_variants_hues_edit)
        self._reg(variants_group, effets_layout, advanced=True)

        # --- IA / fond ---
        ai_group = QGroupBox("Intelligence artificielle")
        ai_form = QFormLayout(ai_group)
        ai_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.remove_bg_checkbox = QCheckBox("Supprimer le fond (IA)")
        self.remove_bg_checkbox.setChecked(True)
        self.remove_bg_checkbox.stateChanged.connect(self._on_manual_change)
        ai_form.addRow(self.remove_bg_checkbox)
        self.workers_spin = QSpinBox(minimum=1, maximum=8, value=2)
        ai_form.addRow("Traitements simultanés", self.workers_spin)
        self._reg(ai_group, ia_layout)

        # --- Export ---
        export_group = QGroupBox("Export")
        export_form = QFormLayout(export_group)
        export_form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        self.format_combo = QComboBox()
        self.format_combo.addItems(["JPEG", "PNG", "WEBP"])
        self.format_combo.currentTextChanged.connect(self._on_manual_change)
        self.quality_spin = QSpinBox(minimum=10, maximum=100, value=95)
        self.quality_spin.valueChanged.connect(self._on_manual_change)
        self.filename_pattern = QLineEdit("{name}_optimise")
        self.filename_pattern.textChanged.connect(self._on_manual_change)
        export_form.addRow("Format", self.format_combo)
        export_form.addRow("Qualité", self.quality_spin)
        export_form.addRow("Modèle de nom", self.filename_pattern)
        self._reg(export_group, export_layout)

        # --- IA avancée ---
        ai_adv_group = QGroupBox("🤖 IA avancée")
        ai_adv_form = QFormLayout(ai_adv_group)
        ai_adv_form.setRowWrapPolicy(QFormLayout.WrapLongRows)

        self.auto_enhance_checkbox = QCheckBox("Retouche automatique IA")
        self.auto_enhance_checkbox.setToolTip(
            "Corrige automatiquement l'exposition, le contraste et la netteté."
        )
        self.auto_enhance_checkbox.stateChanged.connect(self._on_manual_change)
        ai_adv_form.addRow(self.auto_enhance_checkbox)

        self.denoise_checkbox = QCheckBox("Réduction du bruit")
        self.denoise_checkbox.stateChanged.connect(self._on_manual_change)
        ai_adv_form.addRow(self.denoise_checkbox)

        self.upscale_checkbox = QCheckBox("Agrandissement IA")
        self.upscale_checkbox.setToolTip("Agrandit l'image (upscale) via IA — Real-ESRGAN ou repli Lanczos.")
        self.upscale_checkbox.stateChanged.connect(self._on_manual_change)
        ai_adv_form.addRow(self.upscale_checkbox)

        self.upscale_factor_combo = QComboBox()
        self.upscale_factor_combo.addItems(["2x", "4x"])
        self.upscale_factor_combo.currentTextChanged.connect(self._on_manual_change)
        ai_adv_form.addRow("Facteur d'agrandissement", self.upscale_factor_combo)

        self.tagging_checkbox = QCheckBox("Fiche produit IA")
        self.tagging_checkbox.setToolTip(
            "Génère automatiquement titre, description, catégorie et tags via l'IA."
        )
        self.tagging_checkbox.stateChanged.connect(self._on_manual_change)
        ai_adv_form.addRow(self.tagging_checkbox)

        self.ai_model_combo = QComboBox()
        self.ai_model_combo.addItems(["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-4-8"])
        self.ai_model_combo.setSizeAdjustPolicy(QComboBox.AdjustToMinimumContentsLengthWithIcon)
        self.ai_model_combo.setMinimumContentsLength(10)
        self.ai_model_combo.currentTextChanged.connect(self._on_manual_change)
        ai_adv_form.addRow("Modèle IA", self.ai_model_combo)

        self.anthropic_key_edit = QLineEdit(os.environ.get("ANTHROPIC_API_KEY", ""))
        self.anthropic_key_edit.setEchoMode(QLineEdit.Password)
        self.anthropic_key_edit.setPlaceholderText("sk-ant-...")
        self.anthropic_key_edit.textChanged.connect(self._on_manual_change)
        ai_adv_form.addRow("Clé API Anthropic", self.anthropic_key_edit)

        ai_adv_note = QLabel(
            "ℹ️ La clé est utilisée uniquement pour générer les fiches produit et n'est\n"
            "jamais incluse dans les presets sauvegardés."
        )
        ai_adv_note.setWordWrap(True)
        ai_adv_form.addRow(ai_adv_note)
        self._reg(ai_adv_group, ia_layout)

        # --- NEXUS Market — Upload Supabase ---
        supa_group = QGroupBox("🚀 NEXUS Market — Upload")
        supa_form = QFormLayout(supa_group)
        supa_form.setRowWrapPolicy(QFormLayout.WrapLongRows)

        self.supabase_upload_checkbox = QCheckBox("Upload automatique")
        self.supabase_upload_checkbox.setToolTip(
            "Envoie automatiquement chaque image vers NEXUS Market après son traitement."
        )
        self.supabase_upload_checkbox.stateChanged.connect(self._on_manual_change)
        supa_form.addRow(self.supabase_upload_checkbox)

        self.supabase_url_edit = QLineEdit(os.environ.get(
            "SUPABASE_URL", "https://pqcqbstbdujzaclsiosv.supabase.co"))
        self.supabase_url_edit.textChanged.connect(self._on_manual_change)
        supa_form.addRow("URL Supabase", self.supabase_url_edit)

        self.supabase_key_edit = QLineEdit(os.environ.get(
            "SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_KEY", "")))
        self.supabase_key_edit.setEchoMode(QLineEdit.Password)
        self.supabase_key_edit.setPlaceholderText("service_role ou anon key")
        self.supabase_key_edit.textChanged.connect(self._on_manual_change)
        supa_form.addRow("Clé Supabase", self.supabase_key_edit)

        self.supabase_bucket_edit = QLineEdit("products")
        self.supabase_bucket_edit.textChanged.connect(self._on_manual_change)
        supa_form.addRow("Bucket", self.supabase_bucket_edit)

        self.supabase_prefix_edit = QLineEdit("nexus-market")
        self.supabase_prefix_edit.textChanged.connect(self._on_manual_change)
        supa_form.addRow("Préfixe de dossier", self.supabase_prefix_edit)

        self.btn_test_supabase = QPushButton("🔌 Tester la connexion")
        self.btn_test_supabase.clicked.connect(self._test_supabase_connection)
        supa_form.addRow(self.btn_test_supabase)
        self._reg(supa_group, export_layout)

        for page_layout in (accueil_layout, canevas_layout, couleur_layout,
                            effets_layout, filigrane_layout, ia_layout, export_layout):
            page_layout.addStretch()

        # Mode Simple par défaut : les groupes marqués "avancé" démarrent masqués.
        self._on_advanced_mode_toggled()

    # -- réglages avancés / recherche / onglets (v9.0) --------------------
    def _reg(self, group: QGroupBox, page_layout: QVBoxLayout, advanced: bool = False) -> QGroupBox:
        """Ajoute un groupe de réglages à l'onglet correspondant, et
        l'enregistre pour la recherche et le mode Simple/Avancé."""
        page_layout.addWidget(group)
        if advanced:
            self._advanced_groups.append(group)
        labels = [group.title()]
        body = group.layout()
        if isinstance(body, QFormLayout):
            for row in range(body.rowCount()):
                item = body.itemAt(row, QFormLayout.LabelRole)
                widget = item.widget() if item else None
                if widget is not None and hasattr(widget, "text"):
                    try:
                        labels.append(widget.text())
                    except Exception:
                        pass
        self._searchable_groups.append((group, labels))
        return group

    def _on_advanced_mode_toggled(self, _state=None):
        show = self.advanced_mode_checkbox.isChecked()
        for group in self._advanced_groups:
            group.setVisible(show)

    def _on_settings_search(self, text: str):
        for group, _labels in self._searchable_groups:
            group.setStyleSheet("")
        needle = text.strip().lower()
        if not needle:
            return
        for group, labels in self._searchable_groups:
            if any(needle in (lbl or "").lower() for lbl in labels):
                page = group.parentWidget()
                index = self._page_stack_index.get(page, -1)
                if index >= 0:
                    self.settings_category_combo.setCurrentIndex(index)
                if group in self._advanced_groups and not self.advanced_mode_checkbox.isChecked():
                    self.advanced_mode_checkbox.setChecked(True)
                group.setVisible(True)
                group.setStyleSheet(
                    "QGroupBox { border: 2px solid #f2b705; border-radius: 6px; margin-top: 6px; }"
                    "QGroupBox::title { color: #f2b705; }"
                )
                break

    # -- profils produit (v9.0) -------------------------------------------
    def _on_product_profile_selected(self, name: str):
        overrides = PRODUCT_PROFILES.get(name)
        if overrides is None:
            return
        self._sync_config_from_ui()
        for key, value in overrides.items():
            setattr(self.config, key, value)
        self._apply_config_to_ui(self.config)
        self._sync_config_from_ui()
        self.config_changed.emit()
        self.product_profile_combo.blockSignals(True)
        self.product_profile_combo.setCurrentIndex(0)
        self.product_profile_combo.blockSignals(False)

    # -- favoris (v9.0) -----------------------------------------------------
    def _update_favorite_button_text(self, *_):
        name = self.preset_combo.currentText()
        self.btn_favorite_preset.setText(
            "★ Retirer des favoris" if name in self._favorite_names else "☆ Ajouter aux favoris"
        )

    def _toggle_favorite_preset(self):
        name = self.preset_combo.currentText()
        if not name:
            return
        if name in self._favorite_names:
            self._favorite_names.remove(name)
        else:
            self._favorite_names.append(name)
        save_favorite_presets(self._favorite_names)
        self._update_favorite_button_text()
        self._refresh_favorites_ui()

    def _refresh_favorites_ui(self):
        while self.favorites_layout.count():
            child = self.favorites_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
        valid = [n for n in self._favorite_names if n in self.all_presets]
        if not valid:
            empty_label = QLabel("Aucun favori — utilisez le bouton « ☆ Favori » ci-dessus.")
            empty_label.setWordWrap(True)
            self.favorites_layout.addWidget(empty_label)
            return
        for name in valid:
            btn = QPushButton(f"⭐ {name}")
            btn.clicked.connect(lambda _checked, n=name: self._apply_favorite(n))
            self.favorites_layout.addWidget(btn)

    def _apply_favorite(self, name: str):
        if name in self.all_presets:
            self.preset_combo.setCurrentText(name)

    # -- tableau de bord (v9.0) ---------------------------------------------
    def update_dashboard_stats(self, pending: int, success: int, failed: int):
        total = pending + success + failed
        if total == 0:
            self.dashboard_stats_label.setText("Aucune image en file.")
            return
        self.dashboard_stats_label.setText(
            f"<b>{total}</b> image(s) en file — "
            f"⏳ {pending} en attente · ✅ {success} réussie(s) · ❌ {failed} échec(s)"
        )

    def _refresh_history_ui(self):
        history = load_batch_history()
        if not history:
            self.dashboard_history_label.setText("Aucun lot traité pour l'instant.")
            return
        lines = []
        for entry in history[:5]:
            lines.append(
                f"• {entry.get('timestamp', '?')} — {entry.get('total', 0)} image(s), "
                f"✅ {entry.get('success', 0)} / ❌ {entry.get('failed', 0)}"
            )
        self.dashboard_history_label.setText("<br>".join(lines))

    def notify_batch_finished(self, total: int, success: int, failed: int, output_dir: str = ""):
        from datetime import datetime
        add_batch_history_entry({
            "timestamp": datetime.now().strftime("%d/%m/%Y %H:%M"),
            "total": total, "success": success, "failed": failed,
            "output_dir": output_dir,
        })
        self._refresh_history_ui()

    # -- gestion des presets ---------------------------------------------
    def _refresh_preset_combo(self):
        self.preset_combo.blockSignals(True)
        current = self.preset_combo.currentText() if self.preset_combo.count() else None
        self.preset_combo.clear()
        self.preset_combo.addItems(self.all_presets.keys())
        if current and current in self.all_presets:
            self.preset_combo.setCurrentText(current)
        self.preset_combo.blockSignals(False)

    def _on_preset_selected(self, name: str):
        preset = self.all_presets.get(name)
        if preset is None:
            return
        self._apply_config_to_ui(preset)
        self._sync_config_from_ui()
        self.config_changed.emit()

    def _save_current_as_preset(self):
        self._sync_config_from_ui()
        name, ok = QInputDialog.getText(self, "Enregistrer le preset", "Nom du preset :")
        if not ok or not name.strip():
            return
        name = name.strip()
        save_custom_preset(name, self.config)
        self.all_presets[name] = self.config
        self._refresh_preset_combo()
        self.preset_combo.setCurrentText(name)

    def _delete_current_preset(self):
        name = self.preset_combo.currentText()
        if name in BUILTIN_PRESETS:
            QMessageBox.information(self, "Impossible", "Les presets intégrés ne peuvent pas être supprimés.")
            return
        delete_custom_preset(name)
        self.all_presets.pop(name, None)
        if name in self._favorite_names:
            self._favorite_names.remove(name)
            save_favorite_presets(self._favorite_names)
            self._refresh_favorites_ui()
        self._refresh_preset_combo()

    def _apply_config_to_ui(self, cfg: ProcessingConfig):
        self.width_spin.blockSignals(True)
        self.height_spin.blockSignals(True)
        self.width_spin.setValue(cfg.canvas_size[0])
        self.height_spin.setValue(cfg.canvas_size[1])
        self.width_spin.blockSignals(False)
        self.height_spin.blockSignals(False)

        self._bg_color = QColor(*cfg.bg_color[:3])
        self._update_color_button()

        self._bg_gradient_color2 = QColor(*cfg.bg_gradient_color2[:3])
        self._update_gradient_color_button()
        self.bg_mode_combo.blockSignals(True)
        self.bg_mode_combo.setCurrentText(
            {"gradient": "Dégradé", "image": "Image importée",
             "transparent": "Transparent (PNG/WEBP)"}.get(cfg.bg_mode, "Uni")
        )
        self.bg_mode_combo.blockSignals(False)
        self.bg_gradient_direction_combo.blockSignals(True)
        self.bg_gradient_direction_combo.setCurrentText(cfg.bg_gradient_direction)
        self.bg_gradient_direction_combo.blockSignals(False)
        self.gradient_preset_combo.blockSignals(True)
        self.gradient_preset_combo.setCurrentText("Personnalisé")
        self.gradient_preset_combo.blockSignals(False)
        self._bg_image_path = cfg.bg_image_path
        self._update_bg_image_button()
        self._update_gradient_controls_visibility()

        self.padding_slider.setValue(int(cfg.padding_ratio * 100))
        self.shadow_checkbox.setChecked(cfg.shadow_enabled)
        self.shadow_style_combo.setCurrentText(cfg.shadow_style)
        self.shadow_opacity_slider.setValue(cfg.shadow_opacity)
        self.shadow_blur_slider.setValue(cfg.shadow_blur)
        self.contrast_spin.setValue(cfg.contrast)
        self.brightness_spin.setValue(cfg.brightness)
        self.saturation_spin.setValue(cfg.saturation)
        self.auto_wb_checkbox.setChecked(cfg.auto_white_balance)
        self.wb_temp_slider.setValue(cfg.wb_temperature)
        self.wb_tint_slider.setValue(cfg.wb_tint)
        self.levels_black_spin.setValue(cfg.levels_black)
        self.levels_white_spin.setValue(cfg.levels_white)
        self.levels_gamma_spin.setValue(cfg.levels_gamma)
        self.highlights_slider.setValue(cfg.highlights)
        self.shadows_slider.setValue(cfg.shadows)
        self.color_style_combo.setCurrentText(cfg.color_style)
        self.vignette_checkbox.setChecked(cfg.vignette_enabled)
        self.vignette_strength_slider.setValue(cfg.vignette_strength)
        self.bg_blur_checkbox.setChecked(cfg.bg_blur_enabled)
        self.bg_blur_radius_slider.setValue(cfg.bg_blur_radius)

        self._hsl_bands = {band: dict(vals) for band, vals in (cfg.hsl_bands or {}).items()} or {
            band: {"hue": 0, "sat": 0, "lum": 0}
            for band in ("Rouges", "Jaunes", "Verts", "Cyans", "Bleus", "Magentas")
        }
        self._on_hsl_band_selected(self.hsl_band_combo.currentText())

        for key, values in (("master", cfg.curve_master), ("red", cfg.curve_red),
                             ("green", cfg.curve_green), ("blue", cfg.curve_blue)):
            for slider, value in zip(self._curve_sliders[key], values):
                slider.blockSignals(True)
                slider.setValue(value)
                slider.blockSignals(False)

        self.clarity_checkbox.setChecked(cfg.clarity_enabled)
        self.clarity_slider.setValue(cfg.clarity_strength)
        self.dehaze_checkbox.setChecked(cfg.dehaze_enabled)
        self.dehaze_slider.setValue(cfg.dehaze_strength)
        self.split_toning_checkbox.setChecked(cfg.split_toning_enabled)
        self.split_shadow_hue_slider.setValue(cfg.split_shadow_hue)
        self.split_shadow_sat_slider.setValue(cfg.split_shadow_sat)
        self.split_highlight_hue_slider.setValue(cfg.split_highlight_hue)
        self.split_highlight_sat_slider.setValue(cfg.split_highlight_sat)
        self.split_balance_slider.setValue(cfg.split_balance)

        self.sharpen_mode_combo.setCurrentText(cfg.sharpen_mode)
        self.sharpen_radius_spin.setValue(cfg.sharpen_radius)
        self.sharpen_amount_slider.setValue(cfg.sharpen_amount)
        self.sharpen_threshold_spin.setValue(cfg.sharpen_threshold)
        self.denoise_lum_slider.setValue(cfg.denoise_luminance)
        self.denoise_color_slider.setValue(cfg.denoise_color)

        self.border_checkbox.setChecked(cfg.border_enabled)
        self.border_style_combo.setCurrentText(cfg.border_style)
        self.border_width_slider.setValue(cfg.border_width)
        self._border_color = QColor(*cfg.border_color[:3])
        self._update_border_color_button()

        self.mirror_checkbox.setChecked(cfg.mirror_enabled)
        self.mirror_height_slider.setValue(int(cfg.mirror_height_ratio * 100))
        self.mirror_fade_slider.setValue(cfg.mirror_fade)
        self.mirror_gap_slider.setValue(cfg.mirror_gap)

        self.blur_check_checkbox.setChecked(cfg.blur_exposure_check_enabled)
        self.auto_crop_checkbox.setChecked(cfg.auto_crop_enabled)
        self.auto_crop_margin_slider.setValue(cfg.auto_crop_margin)
        self.watermark_checkbox.setChecked(cfg.watermark_enabled)
        self.watermark_text_edit.setText(cfg.watermark_text)
        self.watermark_position_combo.setCurrentText(cfg.watermark_position)
        self.watermark_opacity_slider.setValue(cfg.watermark_opacity)
        self.watermark_logo_checkbox.setChecked(cfg.watermark_logo_enabled)
        self._watermark_logo_path = cfg.watermark_logo_path
        self._update_watermark_logo_button()
        self.watermark_logo_scale_slider.setValue(cfg.watermark_logo_scale)
        self.watermark_logo_opacity_slider.setValue(cfg.watermark_logo_opacity)
        self.color_variants_checkbox.setChecked(cfg.color_variants_enabled)
        self.color_variants_hues_edit.setText(cfg.color_variants_hues)
        self.remove_bg_checkbox.setChecked(cfg.remove_background)
        self.format_combo.setCurrentText(cfg.output_format)
        self.quality_spin.setValue(cfg.jpeg_quality)
        self.auto_enhance_checkbox.setChecked(cfg.ai_auto_enhance)
        self.denoise_checkbox.setChecked(cfg.ai_denoise)
        self.upscale_checkbox.setChecked(cfg.ai_upscale_enabled)
        self.upscale_factor_combo.setCurrentText(f"{cfg.ai_upscale_factor}x")
        self.tagging_checkbox.setChecked(cfg.ai_tagging_enabled)
        self.supabase_upload_checkbox.setChecked(cfg.supabase_upload_enabled)

    def _pick_border_color(self):
        color = QColorDialog.getColor(getattr(self, "_border_color", QColor("white")),
                                       self, "Choisir la couleur de la bordure")
        if color.isValid():
            self._border_color = color
            self._update_border_color_button()
            self._on_manual_change()

    def _update_border_color_button(self):
        self.border_color_btn.setStyleSheet(
            f"background-color: {self._border_color.name()}; border: 1px solid #555;"
        )
        self.border_color_btn.setText(self._border_color.name())

    def _on_look_preset_selected(self, name: str):
        if name == "Aucun":
            return
        self._apply_look_preset(name)

    def _apply_look_preset(self, name: str):
        """Applique un preset de look (combinaison couleur/contraste) par-
        dessus les réglages actuels, puis réinitialise le combo — c'est une
        action ponctuelle, pas un état persistant (contrairement au preset
        marketplace)."""
        preset = LOOK_PRESETS.get(name)
        if not preset:
            return
        if "contrast" in preset:
            self.contrast_spin.setValue(preset["contrast"])
        if "brightness" in preset:
            self.brightness_spin.setValue(preset["brightness"])
        if "saturation" in preset:
            self.saturation_spin.setValue(preset["saturation"])
        if "highlights" in preset:
            self.highlights_slider.setValue(preset["highlights"])
        if "shadows" in preset:
            self.shadows_slider.setValue(preset["shadows"])
        if "color_style" in preset:
            self.color_style_combo.setCurrentText(preset["color_style"])
        if "clarity_enabled" in preset:
            self.clarity_checkbox.setChecked(preset["clarity_enabled"])
        if "clarity_strength" in preset:
            self.clarity_slider.setValue(preset["clarity_strength"])
        if "vignette_enabled" in preset:
            self.vignette_checkbox.setChecked(preset["vignette_enabled"])
        if "vignette_strength" in preset:
            self.vignette_strength_slider.setValue(preset["vignette_strength"])
        if "split_toning_enabled" in preset:
            self.split_toning_checkbox.setChecked(preset["split_toning_enabled"])
        if "split_shadow_hue" in preset:
            self.split_shadow_hue_slider.setValue(preset["split_shadow_hue"])
        if "split_shadow_sat" in preset:
            self.split_shadow_sat_slider.setValue(preset["split_shadow_sat"])
        if "split_highlight_hue" in preset:
            self.split_highlight_hue_slider.setValue(preset["split_highlight_hue"])
        if "split_highlight_sat" in preset:
            self.split_highlight_sat_slider.setValue(preset["split_highlight_sat"])
        self._on_manual_change()
        self.look_preset_combo.blockSignals(True)
        self.look_preset_combo.setCurrentText("Aucun")
        self.look_preset_combo.blockSignals(False)

    def _on_hsl_band_selected(self, band: str):
        """Affiche les valeurs mémorisées pour la bande de couleur choisie,
        sans déclencher de changement de config (juste un affichage)."""
        vals = self._hsl_bands.get(band, {"hue": 0, "sat": 0, "lum": 0})
        for slider, key in ((self.hsl_hue_slider, "hue"), (self.hsl_sat_slider, "sat"), (self.hsl_lum_slider, "lum")):
            slider.blockSignals(True)
            slider.setValue(vals.get(key, 0))
            slider.blockSignals(False)

    def _on_hsl_value_changed(self, *_):
        band = self.hsl_band_combo.currentText()
        self._hsl_bands[band] = {
            "hue": self.hsl_hue_slider.value(),
            "sat": self.hsl_sat_slider.value(),
            "lum": self.hsl_lum_slider.value(),
        }
        self._on_manual_change()

    def _pick_bg_color(self):
        color = QColorDialog.getColor(self._bg_color, self, "Choisir la couleur de fond")
        if color.isValid():
            self._bg_color = color
            self._update_color_button()
            self._reset_gradient_preset_silently()
            self._on_manual_change()

    def _update_color_button(self):
        self.bg_color_btn.setStyleSheet(
            f"background-color: {self._bg_color.name()}; border: 1px solid #555;"
        )
        self.bg_color_btn.setText(self._bg_color.name())

    def _pick_bg_gradient_color2(self):
        color = QColorDialog.getColor(self._bg_gradient_color2, self, "Choisir la 2ᵉ couleur du dégradé")
        if color.isValid():
            self._bg_gradient_color2 = color
            self._update_gradient_color_button()
            self._reset_gradient_preset_silently()
            self._on_manual_change()

    def _reset_gradient_preset_silently(self):
        self.gradient_preset_combo.blockSignals(True)
        self.gradient_preset_combo.setCurrentText("Personnalisé")
        self.gradient_preset_combo.blockSignals(False)

    def _update_gradient_color_button(self):
        self.bg_gradient_color2_btn.setStyleSheet(
            f"background-color: {self._bg_gradient_color2.name()}; border: 1px solid #555;"
        )
        self.bg_gradient_color2_btn.setText(self._bg_gradient_color2.name())

    def _update_gradient_controls_visibility(self):
        mode = self.bg_mode_combo.currentText()
        is_gradient = mode == "Dégradé"
        is_image = mode == "Image importée"
        is_transparent = mode == "Transparent (PNG/WEBP)"
        self.gradient_preset_combo.setEnabled(is_gradient)
        self.bg_gradient_color2_btn.setEnabled(is_gradient)
        self.bg_gradient_direction_combo.setEnabled(is_gradient)
        self.bg_image_btn.setEnabled(is_image)
        self.bg_color_btn.setEnabled(not is_image and not is_transparent)
        self.transparent_note.setVisible(is_transparent)

    def _on_bg_mode_changed(self, *_):
        self._update_gradient_controls_visibility()
        self._on_manual_change()

    def _apply_gradient_preset(self, name: str):
        """Applique instantanément les 2 couleurs + la direction d'un
        dégradé prédéfini. « Personnalisé » ne modifie rien (laisse les
        couleurs choisies manuellement en place)."""
        preset = GRADIENT_PRESETS.get(name)
        if preset is None:
            return
        c1, c2, direction = preset
        self._bg_color = QColor(*c1)
        self._update_color_button()
        self._bg_gradient_color2 = QColor(*c2)
        self._update_gradient_color_button()
        self.bg_gradient_direction_combo.blockSignals(True)
        self.bg_gradient_direction_combo.setCurrentText(direction)
        self.bg_gradient_direction_combo.blockSignals(False)
        self._on_manual_change()

    def _pick_bg_image(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Choisir une image de fond", "",
            "Images (*.png *.jpg *.jpeg *.webp *.bmp *.tiff)"
        )
        if path:
            self._bg_image_path = path
            self._update_bg_image_button()
            self._on_manual_change()

    def _pick_watermark_logo(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Choisir un logo (filigrane image)", "",
            "Images (*.png *.jpg *.jpeg *.webp *.bmp *.tiff)"
        )
        if path:
            self._watermark_logo_path = path
            self._update_watermark_logo_button()
            self._on_manual_change()

    def _update_watermark_logo_button(self):
        path = getattr(self, "_watermark_logo_path", "") or ""
        if path:
            self.watermark_logo_btn.setText(f"📁 {Path(path).name}")
            self.watermark_logo_btn.setToolTip(path)
        else:
            self.watermark_logo_btn.setText("📁 Choisir un logo…")
            self.watermark_logo_btn.setToolTip("")

    def _update_bg_image_button(self):
        path = getattr(self, "_bg_image_path", "") or ""
        if path:
            self.bg_image_btn.setText(f"📁 {Path(path).name}")
            self.bg_image_btn.setToolTip(path)
        else:
            self.bg_image_btn.setText("📁 Choisir une image de fond…")
            self.bg_image_btn.setToolTip("")

    def _on_manual_change(self, *_):
        self.preset_combo.blockSignals(True)
        self.preset_combo.setCurrentText("Personnalisé")
        self.preset_combo.blockSignals(False)
        self._sync_config_from_ui()
        self.config_changed.emit()

    def _sync_config_from_ui(self):
        self.config = ProcessingConfig(
            canvas_size=(self.width_spin.value(), self.height_spin.value()),
            bg_color=(self._bg_color.red(), self._bg_color.green(),
                      self._bg_color.blue(), 255),
            bg_mode={"Dégradé": "gradient", "Image importée": "image",
                     "Transparent (PNG/WEBP)": "transparent"}.get(
                self.bg_mode_combo.currentText(), "solid"),
            bg_gradient_color2=(self._bg_gradient_color2.red(), self._bg_gradient_color2.green(),
                                self._bg_gradient_color2.blue(), 255),
            bg_gradient_direction=self.bg_gradient_direction_combo.currentText(),
            bg_image_path=getattr(self, "_bg_image_path", "") or "",
            padding_ratio=self.padding_slider.value() / 100.0,
            contrast=self.contrast_spin.value(),
            brightness=self.brightness_spin.value(),
            saturation=self.saturation_spin.value(),
            auto_white_balance=self.auto_wb_checkbox.isChecked(),
            wb_temperature=self.wb_temp_slider.value(),
            wb_tint=self.wb_tint_slider.value(),
            levels_black=self.levels_black_spin.value(),
            levels_white=self.levels_white_spin.value(),
            levels_gamma=self.levels_gamma_spin.value(),
            highlights=self.highlights_slider.value(),
            shadows=self.shadows_slider.value(),
            color_style=self.color_style_combo.currentText(),
            vignette_enabled=self.vignette_checkbox.isChecked(),
            vignette_strength=self.vignette_strength_slider.value(),
            bg_blur_enabled=self.bg_blur_checkbox.isChecked(),
            bg_blur_radius=self.bg_blur_radius_slider.value(),
            hsl_bands={band: dict(vals) for band, vals in self._hsl_bands.items()},
            curve_master=tuple(s.value() for s in self._curve_sliders["master"]),
            curve_red=tuple(s.value() for s in self._curve_sliders["red"]),
            curve_green=tuple(s.value() for s in self._curve_sliders["green"]),
            curve_blue=tuple(s.value() for s in self._curve_sliders["blue"]),
            clarity_enabled=self.clarity_checkbox.isChecked(),
            clarity_strength=self.clarity_slider.value(),
            dehaze_enabled=self.dehaze_checkbox.isChecked(),
            dehaze_strength=self.dehaze_slider.value(),
            split_toning_enabled=self.split_toning_checkbox.isChecked(),
            split_shadow_hue=self.split_shadow_hue_slider.value(),
            split_shadow_sat=self.split_shadow_sat_slider.value(),
            split_highlight_hue=self.split_highlight_hue_slider.value(),
            split_highlight_sat=self.split_highlight_sat_slider.value(),
            split_balance=self.split_balance_slider.value(),
            sharpen_mode=self.sharpen_mode_combo.currentText(),
            sharpen_radius=self.sharpen_radius_spin.value(),
            sharpen_amount=self.sharpen_amount_slider.value(),
            sharpen_threshold=self.sharpen_threshold_spin.value(),
            denoise_luminance=self.denoise_lum_slider.value(),
            denoise_color=self.denoise_color_slider.value(),
            border_enabled=self.border_checkbox.isChecked(),
            border_style=self.border_style_combo.currentText(),
            border_width=self.border_width_slider.value(),
            border_color=(self._border_color.red(), self._border_color.green(),
                          self._border_color.blue(), 255),
            mirror_enabled=self.mirror_checkbox.isChecked(),
            mirror_height_ratio=self.mirror_height_slider.value() / 100.0,
            mirror_fade=self.mirror_fade_slider.value(),
            mirror_gap=self.mirror_gap_slider.value(),
            blur_exposure_check_enabled=self.blur_check_checkbox.isChecked(),
            auto_crop_enabled=self.auto_crop_checkbox.isChecked(),
            auto_crop_margin=self.auto_crop_margin_slider.value(),
            shadow_enabled=self.shadow_checkbox.isChecked(),
            shadow_style=self.shadow_style_combo.currentText(),
            shadow_opacity=self.shadow_opacity_slider.value(),
            shadow_blur=self.shadow_blur_slider.value(),
            output_format=self.format_combo.currentText(),
            jpeg_quality=self.quality_spin.value(),
            remove_background=self.remove_bg_checkbox.isChecked(),
            watermark_enabled=self.watermark_checkbox.isChecked(),
            watermark_text=self.watermark_text_edit.text(),
            watermark_opacity=self.watermark_opacity_slider.value(),
            watermark_position=self.watermark_position_combo.currentText(),
            watermark_logo_enabled=self.watermark_logo_checkbox.isChecked(),
            watermark_logo_path=getattr(self, "_watermark_logo_path", "") or "",
            watermark_logo_scale=self.watermark_logo_scale_slider.value(),
            watermark_logo_opacity=self.watermark_logo_opacity_slider.value(),
            color_variants_enabled=self.color_variants_checkbox.isChecked(),
            color_variants_hues=self.color_variants_hues_edit.text(),
            ai_auto_enhance=self.auto_enhance_checkbox.isChecked(),
            ai_denoise=self.denoise_checkbox.isChecked(),
            ai_upscale_enabled=self.upscale_checkbox.isChecked(),
            ai_upscale_factor=int(self.upscale_factor_combo.currentText().rstrip("x")),
            ai_tagging_enabled=self.tagging_checkbox.isChecked(),
            supabase_upload_enabled=self.supabase_upload_checkbox.isChecked(),
        )

    def get_config(self) -> ProcessingConfig:
        self._sync_config_from_ui()
        return self.config

    def apply_config(self, cfg: ProcessingConfig):
        """Applique une configuration complète à l'UI (v9.0) — utilisé lors
        de l'ouverture d'un projet enregistré."""
        self.config = cfg
        self._apply_config_to_ui(self.config)
        self._sync_config_from_ui()
        self.config_changed.emit()

    def get_filename_pattern(self) -> str:
        return self.filename_pattern.text() or "{name}_optimise"

    def get_max_workers(self) -> int:
        return self.workers_spin.value()

    def get_integrations(self) -> IntegrationsConfig:
        """Construit les identifiants d'intégration (IA + Supabase) à partir
        de l'UI. Jamais persisté au sein d'un preset partagé."""
        return IntegrationsConfig(
            anthropic_api_key=self.anthropic_key_edit.text().strip(),
            ai_model=self.ai_model_combo.currentText(),
            supabase_url=self.supabase_url_edit.text().strip(),
            supabase_key=self.supabase_key_edit.text().strip(),
            supabase_bucket=self.supabase_bucket_edit.text().strip() or "products",
            supabase_path_prefix=self.supabase_prefix_edit.text().strip() or "nexus-market",
        )

    def _test_supabase_connection(self):
        """Vérifie que le bucket Supabase configuré est accessible avec la clé fournie."""
        if requests is None:
            QMessageBox.critical(self, "Module manquant",
                                  "Installez 'requests' avec : pip install requests")
            return
        integrations = self.get_integrations()
        if not integrations.supabase_url or not integrations.supabase_key:
            QMessageBox.warning(self, "Configuration incomplète",
                                 "Renseignez l'URL et la clé Supabase.")
            return
        try:
            endpoint = f"{integrations.supabase_url.rstrip('/')}/storage/v1/bucket/{integrations.supabase_bucket}"
            headers = {"Authorization": f"Bearer {integrations.supabase_key}", "apikey": integrations.supabase_key}
            resp = requests.get(endpoint, headers=headers, timeout=10)
            if resp.status_code == 200:
                QMessageBox.information(self, "Connexion réussie",
                                         f"Bucket « {integrations.supabase_bucket} » accessible ✅")
            else:
                QMessageBox.warning(self, "Échec", f"Réponse Supabase ({resp.status_code}) :\n{resp.text[:300]}")
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Erreur de connexion", str(exc))

    # -- persistance QSettings ---------------------------------------------
    def save_to_qsettings(self, settings: QSettings):
        cfg = self.get_config()
        settings.setValue("config", json.dumps(asdict(cfg)))
        settings.setValue("filename_pattern", self.get_filename_pattern())
        settings.setValue("max_workers", self.get_max_workers())
        # Identifiants d'intégration : stockés localement (non chiffrés, comme
        # le reste de QSettings) — préférez les variables d'environnement
        # ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY si possible.
        integrations = self.get_integrations()
        settings.setValue("integrations", json.dumps(asdict(integrations)))

    def load_from_qsettings(self, settings: QSettings):
        raw = settings.value("config", None)
        if raw:
            try:
                cfg = ProcessingConfig.from_dict(json.loads(raw))
                self._apply_config_to_ui(cfg)
                self._sync_config_from_ui()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Réglages sauvegardés illisibles : %s", exc)
        pattern = settings.value("filename_pattern", None)
        if pattern:
            self.filename_pattern.setText(pattern)
        workers = settings.value("max_workers", None)
        if workers:
            self.workers_spin.setValue(int(workers))

        raw_integrations = settings.value("integrations", None)
        if raw_integrations:
            try:
                data = json.loads(raw_integrations)
                self.anthropic_key_edit.setText(data.get("anthropic_api_key", "") or self.anthropic_key_edit.text())
                self.ai_model_combo.setCurrentText(data.get("ai_model", self.ai_model_combo.currentText()))
                self.supabase_url_edit.setText(data.get("supabase_url", "") or self.supabase_url_edit.text())
                self.supabase_key_edit.setText(data.get("supabase_key", "") or self.supabase_key_edit.text())
                self.supabase_bucket_edit.setText(data.get("supabase_bucket", "products"))
                self.supabase_prefix_edit.setText(data.get("supabase_path_prefix", "nexus-market"))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Identifiants d'intégration sauvegardés illisibles : %s", exc)


# ==========================================================================
# 6ter. VÉRIFICATION QUALITÉ EN LOT (flou / exposition)
# ==========================================================================

class QualityCheckDialog(QDialog):
    """Affiche un rapport de qualité (flou / exposition) par image avant un
    traitement en lot, avec la possibilité de décocher certaines photos
    pour les exclure du traitement plutôt que d'annuler tout le lot."""

    def __init__(self, flagged: list[tuple[Path, dict]], parent=None):
        super().__init__(parent)
        self.setWindowTitle("Vérification qualité avant traitement")
        self.resize(540, 440)
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel(
            f"{len(flagged)} photo(s) semblent floues et/ou mal exposées.\n"
            "Décochez celles à exclure du traitement, ou continuez telles quelles."
        ))
        self.list_widget = QListWidget()
        for path, diag in flagged:
            issues = []
            if diag.get("blurry"):
                issues.append("floue")
            if diag.get("under_exposed"):
                issues.append("sous-exposée")
            if diag.get("over_exposed"):
                issues.append("surexposée")
            item = QListWidgetItem(f"{path.name} — {', '.join(issues)}")
            item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
            item.setCheckState(Qt.Checked)
            item.setData(Qt.UserRole, str(path))
            self.list_widget.addItem(item)
        layout.addWidget(self.list_widget)

        select_row = QHBoxLayout()
        btn_all = QPushButton("Tout cocher")
        btn_all.clicked.connect(lambda: self._set_all_checked(True))
        btn_none = QPushButton("Tout décocher")
        btn_none.clicked.connect(lambda: self._set_all_checked(False))
        select_row.addWidget(btn_all)
        select_row.addWidget(btn_none)
        select_row.addStretch()
        layout.addLayout(select_row)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.button(QDialogButtonBox.Ok).setText("Traiter les photos cochées")
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _set_all_checked(self, checked: bool):
        state = Qt.Checked if checked else Qt.Unchecked
        for i in range(self.list_widget.count()):
            self.list_widget.item(i).setCheckState(state)

    def excluded_paths(self) -> set:
        excluded = set()
        for i in range(self.list_widget.count()):
            item = self.list_widget.item(i)
            if item.checkState() != Qt.Checked:
                excluded.add(item.data(Qt.UserRole))
        return excluded


# ==========================================================================
# 6bis. EXPORT MULTI-PLATEFORMES
# ==========================================================================

class MultiExportDialog(QDialog):
    """Sélection de plusieurs presets à traiter et exporter en une seule action."""

    _DEFAULT_CHECKED = ("Amazon", "Instagram", "Etsy")

    def __init__(self, preset_names: list[str], parent=None):
        super().__init__(parent)
        self.setWindowTitle("Export multi-plateformes")
        self.resize(380, 440)
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel(
            "Sélectionnez les plateformes à générer.\n"
            "Chaque plateforme sera traitée avec son propre preset\n"
            "puis exportée dans son propre sous-dossier — en un clic."
        ))

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        inner = QWidget()
        inner_layout = QVBoxLayout(inner)
        self.checkboxes: dict[str, QCheckBox] = {}
        for name in preset_names:
            cb = QCheckBox(name)
            if any(name.startswith(prefix) for prefix in self._DEFAULT_CHECKED):
                cb.setChecked(True)
            inner_layout.addWidget(cb)
            self.checkboxes[name] = cb
        inner_layout.addStretch()
        scroll.setWidget(inner)
        layout.addWidget(scroll)

        select_row = QHBoxLayout()
        btn_all = QPushButton("Tout cocher")
        btn_all.clicked.connect(lambda: self._set_all(True))
        btn_none = QPushButton("Tout décocher")
        btn_none.clicked.connect(lambda: self._set_all(False))
        select_row.addWidget(btn_all)
        select_row.addWidget(btn_none)
        layout.addLayout(select_row)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.button(QDialogButtonBox.Ok).setText("Lancer l'export")
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _set_all(self, checked: bool):
        for cb in self.checkboxes.values():
            cb.setChecked(checked)

    def get_selected(self) -> list[str]:
        return [name for name, cb in self.checkboxes.items() if cb.isChecked()]


# ==========================================================================
# 6quater. STUDIO CARROUSEL (post multi-images pour réseaux sociaux)
# ==========================================================================

class CarouselDialog(QDialog):
    """Sélection et mise en ordre d'images déjà traitées pour créer un
    carrousel (post multi-images) prêt à publier, avec numérotation des
    slides et choix du format (carré, portrait, story)."""

    def __init__(self, entries: list[tuple[str, Image.Image]], parent=None):
        super().__init__(parent)
        self.setWindowTitle("Créer un carrousel")
        self.resize(460, 540)
        self._entries = {path: img for path, img in entries}
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel(
            "Cochez les images à inclure et utilisez les flèches pour définir\n"
            "l'ordre des slides du carrousel (2 images minimum)."
        ))

        self.list_widget = QListWidget()
        for path, _img in entries:
            item = QListWidgetItem(Path(path).name)
            item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
            item.setCheckState(Qt.Checked)
            item.setData(Qt.UserRole, path)
            self.list_widget.addItem(item)
        layout.addWidget(self.list_widget)

        order_row = QHBoxLayout()
        btn_up = QPushButton("⬆ Monter")
        btn_up.clicked.connect(self._move_up)
        btn_down = QPushButton("⬇ Descendre")
        btn_down.clicked.connect(self._move_down)
        order_row.addWidget(btn_up)
        order_row.addWidget(btn_down)
        order_row.addStretch()
        layout.addLayout(order_row)

        form = QFormLayout()
        self.format_combo = QComboBox()
        self.format_combo.addItems(list(CAROUSEL_FORMATS.keys()))
        form.addRow("Format des slides", self.format_combo)

        self.badge_checkbox = QCheckBox("Numéroter les slides (1/N, 2/N…)")
        self.badge_checkbox.setChecked(True)
        form.addRow(self.badge_checkbox)

        self.badge_position_combo = QComboBox()
        self.badge_position_combo.addItems(["Bas droite", "Bas gauche", "Haut droite", "Haut gauche"])
        form.addRow("Position du numéro", self.badge_position_combo)
        layout.addLayout(form)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.button(QDialogButtonBox.Ok).setText("Générer le carrousel…")
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _move_up(self):
        row = self.list_widget.currentRow()
        if row > 0:
            item = self.list_widget.takeItem(row)
            self.list_widget.insertItem(row - 1, item)
            self.list_widget.setCurrentRow(row - 1)

    def _move_down(self):
        row = self.list_widget.currentRow()
        if 0 <= row < self.list_widget.count() - 1:
            item = self.list_widget.takeItem(row)
            self.list_widget.insertItem(row + 1, item)
            self.list_widget.setCurrentRow(row + 1)

    def get_ordered_selection(self) -> list[tuple[str, Image.Image]]:
        result = []
        for i in range(self.list_widget.count()):
            item = self.list_widget.item(i)
            if item.checkState() == Qt.Checked:
                path = item.data(Qt.UserRole)
                result.append((path, self._entries[path]))
        return result

    def get_format_size(self, current_canvas_size: tuple[int, int]) -> tuple[int, int]:
        size = CAROUSEL_FORMATS.get(self.format_combo.currentText(), (0, 0))
        if size == (0, 0):
            return current_canvas_size
        return size

    def badge_enabled(self) -> bool:
        return self.badge_checkbox.isChecked()

    def badge_position(self) -> str:
        return self.badge_position_combo.currentText()


# ==========================================================================
# 7. FENÊTRE PRINCIPALE
# ==========================================================================


# ==========================================================================
# STUDIO COLLAGE & ÉTIQUETTES PRO — compositeur de collages + moteur de
# calques (bandeaux promo, étiquettes prix, texte libre stylé) superposables
# sur une ou plusieurs images.
# ==========================================================================

# ==========================================================================
# 1. POLICES — recherche de vraies polices TTF, repli propre sinon
# ==========================================================================

_FONT_CANDIDATES: dict[str, list[str]] = {
    "Sans (Regular)": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ],
    "Sans (Bold)": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ],
    "Serif (Bold)": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "C:/Windows/Fonts/georgiab.ttf",
    ],
    "Condensé (Bold)": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
        "C:/Windows/Fonts/arialnb.ttf",
    ],
    "Mono (Bold)": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
        "C:/Windows/Fonts/consolab.ttf",
    ],
}

_font_cache: dict[tuple[str, int], "ImageFont.FreeTypeFont"] = {}


def get_font(family: str, size: int):
    """Charge une police TTF réelle si possible (avec cache), sinon repli
    sur la police bitmap intégrée à Pillow (toujours disponible)."""
    size = max(6, int(size))
    key = (family, size)
    if key in _font_cache:
        return _font_cache[key]
    for path in _FONT_CANDIDATES.get(family, []):
        if Path(path).is_file():
            try:
                font = ImageFont.truetype(path, size)
                _font_cache[key] = font
                return font
            except Exception:
                continue
    try:
        font = ImageFont.load_default(size=size)
    except TypeError:
        font = ImageFont.load_default()
    _font_cache[key] = font
    return font


def available_font_families() -> list[str]:
    return list(_FONT_CANDIDATES.keys())


# ==========================================================================
# 2. MODÈLE DE DONNÉES — calques de design (texte / bandeau / étiquette / forme)
# ==========================================================================

FREE_ANCHOR = "🖱 Libre (glisser dans l'aperçu)"

ANCHORS = [
    "Haut gauche", "Haut centre", "Haut droite",
    "Milieu gauche", "Centre", "Milieu droite",
    "Bas gauche", "Bas centre", "Bas droite",
    FREE_ANCHOR,
]

BG_SHAPES = ["Aucun", "Rectangle", "Arrondi", "Pilule", "Ruban (coin)"]


@dataclass
class DesignElement:
    """Un calque texte/design superposable (bandeau, étiquette prix, texte
    libre ou simple forme/cadre)."""
    kind: str = "Texte libre"          # libellé lisible, purement informatif
    text: str = "NOUVEAU"
    font_family: str = "Sans (Bold)"
    font_size: int = 46
    text_color: tuple = (255, 255, 255, 255)
    stroke_width: int = 0
    stroke_color: tuple = (0, 0, 0, 255)
    bg_shape: str = "Arrondi"
    bg_color: tuple = (214, 40, 40, 235)
    padding_x: int = 26
    padding_y: int = 14
    anchor: str = "Haut droite"
    offset_x: int = 24
    offset_y: int = 24
    rotation: int = 0
    shadow: bool = True
    # Position libre (utilisée seulement si anchor == FREE_ANCHOR) : ratios
    # 0..1 du CENTRE de l'élément par rapport au canevas, réglés en glissant
    # l'élément dans l'aperçu du Studio Collage.
    pos_x: float = 0.5
    pos_y: float = 0.5

    @classmethod
    def from_dict(cls, data: dict) -> "DesignElement":
        valid_keys = {f.name for f in fields(cls)}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        for key in ("text_color", "stroke_color", "bg_color"):
            if key in filtered and isinstance(filtered[key], list):
                filtered[key] = tuple(filtered[key])
        return cls(**filtered)


def _rounded_rect_mask(size: tuple[int, int], radius: int) -> Image.Image:
    w, h = size
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    radius = max(0, min(radius, min(w, h) // 2))
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return mask


def build_element_layer(el: DesignElement) -> Image.Image:
    """Construit une image RGBA compacte (juste assez grande pour contenir
    le fond + le texte) pour un calque de design, prête à être pivotée puis
    collée sur le visuel final."""
    font = get_font(el.font_family, el.font_size)
    tmp = Image.new("RGBA", (10, 10))
    d = ImageDraw.Draw(tmp)
    bbox = d.textbbox((0, 0), el.text or " ", font=font, stroke_width=el.stroke_width)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

    ribbon_tail = 0
    if el.bg_shape == "Ruban (coin)":
        ribbon_tail = max(16, el.font_size // 2)

    box_w = tw + el.padding_x * 2 + ribbon_tail
    box_h = th + el.padding_y * 2
    shadow_pad = 10 if el.shadow and el.bg_shape != "Aucun" else 0
    layer_w = box_w + shadow_pad * 2
    layer_h = box_h + shadow_pad * 2

    layer = Image.new("RGBA", (layer_w, layer_h), (0, 0, 0, 0))

    # --- ombre portée du fond (facultative) ---
    if el.shadow and el.bg_shape != "Aucun":
        shadow_layer = Image.new("RGBA", (layer_w, layer_h), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow_layer)
        sx0, sy0 = shadow_pad + 4, shadow_pad + 6
        sx1, sy1 = sx0 + box_w, sy0 + box_h
        if el.bg_shape == "Pilule":
            sd.rounded_rectangle([sx0, sy0, sx1, sy1], radius=box_h // 2, fill=(0, 0, 0, 130))
        else:
            radius = 10 if el.bg_shape == "Arrondi" else 0
            sd.rounded_rectangle([sx0, sy0, sx1, sy1], radius=radius, fill=(0, 0, 0, 130))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(6))
        layer = Image.alpha_composite(layer, shadow_layer)

    # --- fond ---
    bx0, by0 = shadow_pad, shadow_pad
    bx1, by1 = bx0 + box_w, by0 + box_h
    if el.bg_shape != "Aucun":
        bg_layer = Image.new("RGBA", (layer_w, layer_h), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bg_layer)
        if el.bg_shape == "Rectangle":
            bd.rectangle([bx0, by0, bx1, by1], fill=el.bg_color)
        elif el.bg_shape == "Arrondi":
            bd.rounded_rectangle([bx0, by0, bx1, by1], radius=14, fill=el.bg_color)
        elif el.bg_shape == "Pilule":
            bd.rounded_rectangle([bx0, by0, bx1, by1], radius=box_h // 2, fill=el.bg_color)
        elif el.bg_shape == "Ruban (coin)":
            # rectangle + pointe triangulaire à droite façon étiquette/ruban
            bd.polygon(
                [
                    (bx0, by0), (bx1 - ribbon_tail, by0), (bx1, (by0 + by1) // 2),
                    (bx1 - ribbon_tail, by1), (bx0, by1),
                ],
                fill=el.bg_color,
            )
        layer = Image.alpha_composite(layer, bg_layer)

    # --- texte ---
    text_x = bx0 + el.padding_x - bbox[0]
    text_y = by0 + el.padding_y - bbox[1]
    if el.bg_shape == "Ruban (coin)":
        text_x = bx0 + el.padding_x - bbox[0]
    td = ImageDraw.Draw(layer)
    td.text(
        (text_x, text_y), el.text or "", font=font, fill=el.text_color,
        stroke_width=el.stroke_width, stroke_fill=el.stroke_color,
    )

    if el.rotation:
        layer = layer.rotate(el.rotation, expand=True, resample=Image.Resampling.BICUBIC)
    return layer


def _anchor_position(canvas_size: tuple[int, int], layer_size: tuple[int, int],
                      anchor: str, offset_x: int, offset_y: int) -> tuple[int, int]:
    cw, ch = canvas_size
    lw, lh = layer_size
    x_map = {"gauche": offset_x, "centre": (cw - lw) // 2, "droite": cw - lw - offset_x}
    y_map = {"haut": offset_y, "milieu": (ch - lh) // 2, "bas": ch - lh - offset_y}
    a = anchor.lower()
    xk = "gauche" if "gauche" in a else ("droite" if "droite" in a else "centre")
    yk = "haut" if "haut" in a else ("bas" if "bas" in a else "milieu")
    return x_map[xk], y_map[yk]


def resolve_position(canvas_size: tuple[int, int], layer_size: tuple[int, int],
                      el: "DesignElement") -> tuple[int, int]:
    """Position (coin haut-gauche) d'un calque sur le canevas : ancre fixe
    classique, ou position libre (pos_x/pos_y = centre en ratio 0..1) quand
    l'élément a été positionné à la souris dans l'aperçu."""
    if el.anchor == FREE_ANCHOR:
        cw, ch = canvas_size
        lw, lh = layer_size
        cx = max(0.0, min(1.0, el.pos_x)) * cw
        cy = max(0.0, min(1.0, el.pos_y)) * ch
        return int(cx - lw / 2), int(cy - lh / 2)
    return _anchor_position(canvas_size, layer_size, el.anchor, el.offset_x, el.offset_y)


def compose_elements(base: Image.Image, elements: list[DesignElement]) -> Image.Image:
    """Superpose une liste de calques de design sur une image de base (RGBA)."""
    result = base.convert("RGBA")
    for el in elements:
        layer = build_element_layer(el)
        pos = resolve_position(result.size, layer.size, el)
        result = Image.alpha_composite(result, _place(layer, result.size, pos))
    return result


def _place(layer: Image.Image, canvas_size: tuple[int, int], pos: tuple[int, int]) -> Image.Image:
    full = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    full.paste(layer, pos, layer)
    return full


# --- Préréglages rapides (bandeaux promo & étiquette prix) ---------------

BADGE_PRESETS: dict[str, dict] = {
    "🔥 -20%": dict(text="-20%", bg_color=(214, 40, 40, 235), text_color=(255, 255, 255, 255),
                    bg_shape="Ruban (coin)", anchor="Haut droite"),
    "✨ NOUVEAU": dict(text="NOUVEAU", bg_color=(20, 130, 90, 235), text_color=(255, 255, 255, 255),
                       bg_shape="Pilule", anchor="Haut gauche"),
    "⛔ RUPTURE DE STOCK": dict(text="RUPTURE DE STOCK", bg_color=(30, 30, 30, 220),
                                text_color=(255, 255, 255, 255), bg_shape="Rectangle", anchor="Centre",
                                rotation=-18),
    "🏆 MEILLEURE VENTE": dict(text="MEILLEURE VENTE", bg_color=(196, 148, 24, 235),
                               text_color=(30, 20, 0, 255), bg_shape="Pilule", anchor="Haut gauche"),
    "🚚 LIVRAISON GRATUITE": dict(text="LIVRAISON GRATUITE", bg_color=(20, 90, 190, 230),
                                  text_color=(255, 255, 255, 255), bg_shape="Arrondi", anchor="Bas centre"),
    "💥 PROMO": dict(text="PROMO", bg_color=(226, 88, 34, 235), text_color=(255, 255, 255, 255),
                     bg_shape="Ruban (coin)", anchor="Haut gauche"),
}


def make_price_tag(amount: str, currency: str = "FCFA") -> DesignElement:
    text = f"{amount} {currency}".strip()
    return DesignElement(
        kind="Étiquette prix", text=text, font_family="Sans (Bold)", font_size=40,
        text_color=(255, 255, 255, 255), bg_color=(15, 15, 15, 235), bg_shape="Ruban (coin)",
        anchor="Bas droite", offset_x=20, offset_y=20, padding_x=22, padding_y=12,
    )


# ==========================================================================
# 3. COLLAGE — dispositions et rendu
# ==========================================================================

CANVAS_PRESETS: dict[str, tuple[int, int]] = {
    "Carré Instagram (1080×1080)": (1080, 1080),
    "Post Facebook (1200×630)": (1200, 630),
    "Story (1080×1920)": (1080, 1920),
    "Pinterest (1000×1500)": (1000, 1500),
    "Bannière large (1600×800)": (1600, 800),
    "Personnalisé": (1080, 1080),
}

COLLAGE_TEMPLATES = [
    "Grille automatique",
    "2 colonnes",
    "3 colonnes",
    "1 grande + petites (droite)",
    "1 grande + petites (bas)",
    "Bande verticale (story)",
    "Bande horizontale (bannière)",
    "Avant / Après (2 cases)",
    "Catalogue 4 cases (2×2)",
]


def compute_layout(template: str, n: int, canvas: tuple[int, int], spacing: int) -> list[tuple[int, int, int, int]]:
    """Retourne, pour n images, une liste de rectangles (x, y, w, h) couvrant
    élégamment le canevas selon le gabarit choisi."""
    if n <= 0:
        return []
    cw, ch = canvas
    s = spacing

    def grid(rows: int, cols: int) -> list[tuple[int, int, int, int]]:
        rects = []
        cell_w = (cw - s * (cols + 1)) // cols
        cell_h = (ch - s * (rows + 1)) // rows
        for i in range(n):
            r, c = divmod(i, cols)
            if r >= rows:
                break
            x = s + c * (cell_w + s)
            y = s + r * (cell_h + s)
            rects.append((x, y, cell_w, cell_h))
        # centrer la dernière ligne incomplète
        last_row_count = n - (rows - 1) * cols if rows > 0 else n
        if 0 < last_row_count < cols and len(rects) >= last_row_count:
            row_items = rects[-last_row_count:]
            used_w = last_row_count * cell_w + (last_row_count - 1) * s
            extra = (cw - s * 2 - used_w) // 2
            new_row = []
            for i, (x, y, w, h) in enumerate(row_items):
                new_row.append((s + extra + i * (cell_w + s), y, w, h))
            rects[-last_row_count:] = new_row
        return rects

    if template == "Grille automatique":
        cols = max(1, math.ceil(math.sqrt(n)))
        rows = max(1, math.ceil(n / cols))
        return grid(rows, cols)

    if template == "2 colonnes":
        cols = 2
        rows = math.ceil(n / cols)
        return grid(rows, cols)

    if template == "3 colonnes":
        cols = 3
        rows = math.ceil(n / cols)
        return grid(rows, cols)

    if template == "Bande verticale (story)":
        cell_h = (ch - s * (n + 1)) // n
        return [(s, s + i * (cell_h + s), cw - 2 * s, cell_h) for i in range(n)]

    if template == "Bande horizontale (bannière)":
        cell_w = (cw - s * (n + 1)) // n
        return [(s + i * (cell_w + s), s, cell_w, ch - 2 * s) for i in range(n)]

    if template == "1 grande + petites (droite)":
        if n == 1:
            return [(s, s, cw - 2 * s, ch - 2 * s)]
        big_w = int((cw - s * 3) * 0.62)
        rest_w = cw - s * 3 - big_w
        rects = [(s, s, big_w, ch - 2 * s)]
        rest_n = n - 1
        cell_h = (ch - s * (rest_n + 1)) // rest_n
        for i in range(rest_n):
            rects.append((s * 2 + big_w, s + i * (cell_h + s), rest_w, cell_h))
        return rects

    if template == "1 grande + petites (bas)":
        if n == 1:
            return [(s, s, cw - 2 * s, ch - 2 * s)]
        big_h = int((ch - s * 3) * 0.62)
        rest_h = ch - s * 3 - big_h
        rects = [(s, s, cw - 2 * s, big_h)]
        rest_n = n - 1
        cell_w = (cw - s * (rest_n + 1)) // rest_n
        for i in range(rest_n):
            rects.append((s + i * (cell_w + s), s * 2 + big_h, cell_w, rest_h))
        return rects

    if template == "Avant / Après (2 cases)":
        # Deux panneaux égaux côte à côte — idéal pour une comparaison
        # avant/après ou deux angles d'un même produit (v9.0).
        cell_w = (cw - s * 3) // 2
        panels = [(s, s, cell_w, ch - 2 * s), (s * 2 + cell_w, s, cell_w, ch - 2 * s)]
        return panels[:max(1, min(n, 2))]

    if template == "Catalogue 4 cases (2×2)":
        # Grille fixe 2×2 — pratique pour présenter les variantes de couleur
        # d'un même produit générées automatiquement (v9.0).
        return grid(2, 2)

    # repli
    cols = max(1, math.ceil(math.sqrt(n)))
    rows = max(1, math.ceil(n / cols))
    return grid(rows, cols)


def _round_corners(img: Image.Image, radius: int) -> Image.Image:
    if radius <= 0:
        return img
    mask = _rounded_rect_mask(img.size, radius)
    out = img.copy()
    out.putalpha(mask if img.mode != "RGBA" else Image.composite(img.split()[3], Image.new("L", img.size, 0), mask))
    out.putalpha(mask)
    return out


def _paste_with_cell_shadow(canvas: Image.Image, cell: Image.Image, pos: tuple[int, int]) -> Image.Image:
    x, y = pos
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    off = max(4, cell.width // 80)
    sd.rectangle([x + off, y + off + 4, x + cell.width + off, y + cell.height + off + 4], fill=(0, 0, 0, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(cell, (x, y), cell)
    return canvas


def _load_source_image(source) -> Image.Image:
    """Charge une image de collage, que la source soit un chemin sur disque
    ou une image PIL déjà en mémoire (ex. une photo déjà traitée par le
    pipeline principal, envoyée directement vers le collage)."""
    if isinstance(source, Image.Image):
        return ImageOps.exif_transpose(source.convert("RGB"))
    with Image.open(source) as im:
        return ImageOps.exif_transpose(im.convert("RGB"))


def render_collage(image_sources: list, template: str, canvas_size: tuple[int, int],
                    spacing: int, corner_radius: int, bg_color: tuple, cell_shadow: bool) -> Image.Image:
    canvas = Image.new("RGBA", canvas_size, bg_color)
    rects = compute_layout(template, len(image_sources), canvas_size, spacing)
    for source, rect in zip(image_sources, rects):
        x, y, w, h = rect
        if w <= 0 or h <= 0:
            continue
        im = _load_source_image(source)
        fitted = ImageOps.fit(im, (w, h), method=Image.Resampling.LANCZOS)
        fitted = fitted.convert("RGBA")
        if corner_radius > 0:
            fitted = _round_corners(fitted, corner_radius)
        if cell_shadow:
            canvas = _paste_with_cell_shadow(canvas, fitted, (x, y))
        else:
            canvas.paste(fitted, (x, y), fitted)
    return canvas


# ==========================================================================
# 4. UI — outils communs
# ==========================================================================

def _design_pil_to_pixmap(img: Image.Image) -> QPixmap:
    """Conversion PIL -> QPixmap dédiée au Studio Collage (sans redimensionnement
    automatique, contrairement à pil_to_pixmap() utilisée ailleurs dans l'appli)."""
    img = img.convert("RGBA")
    data = img.tobytes("raw", "RGBA")
    qimg = QImage(data, img.width, img.height, QImage.Format_RGBA8888)
    return QPixmap.fromImage(qimg)


def _color_button(initial_rgba: tuple, on_change) -> QPushButton:
    btn = QPushButton()
    btn.setFixedHeight(28)

    def refresh(c):
        btn.setStyleSheet(
            f"background-color: rgba({c[0]},{c[1]},{c[2]},{c[3]}); border: 1px solid #555;"
        )

    state = {"color": tuple(initial_rgba)}
    refresh(state["color"])

    def pick():
        qc = QColorDialog.getColor(
            QColor(*state["color"]), None, "Choisir une couleur",
            QColorDialog.ShowAlphaChannel,
        )
        if qc.isValid():
            state["color"] = (qc.red(), qc.green(), qc.blue(), qc.alpha())
            refresh(state["color"])
            on_change(state["color"])

    btn.clicked.connect(pick)
    btn.get_color = lambda: state["color"]
    return btn


# ==========================================================================
# 5. DIALOGUE — éditeur de calque (texte / bandeau / étiquette / forme)
# ==========================================================================

class ElementEditorDialog(QDialog):
    """Éditeur complet d'un calque de design : presets rapides, police,
    couleurs, fond (rectangle/arrondi/pilule/ruban), position sur 9 ancrages,
    rotation, ombre — avec aperçu en direct."""

    def __init__(self, element: Optional[DesignElement] = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Éditeur de bandeau / étiquette / texte")
        self.setMinimumWidth(620)
        self.el = element or DesignElement()
        self._build_ui()
        self._load_from_element()
        self._refresh_preview()

    # ------------------------------------------------------------------
    def _build_ui(self):
        root = QHBoxLayout(self)

        left = QVBoxLayout()

        preset_group = QGroupBox("⚡ Préréglages rapides")
        preset_layout = QGridLayout(preset_group)
        for i, name in enumerate(BADGE_PRESETS):
            btn = QPushButton(name)
            btn.clicked.connect(lambda _, n=name: self._apply_preset(n))
            preset_layout.addWidget(btn, i // 2, i % 2)
        left.addWidget(preset_group)

        content_group = QGroupBox("Contenu")
        content_form = QFormLayout(content_group)
        self.text_edit = QLineEdit()
        self.text_edit.textChanged.connect(self._refresh_preview)
        content_form.addRow("Texte", self.text_edit)

        self.font_combo = QComboBox()
        self.font_combo.addItems(available_font_families())
        self.font_combo.currentTextChanged.connect(self._refresh_preview)
        content_form.addRow("Police", self.font_combo)

        self.size_spin = QSpinBox(minimum=10, maximum=200, value=46)
        self.size_spin.valueChanged.connect(self._refresh_preview)
        content_form.addRow("Taille du texte", self.size_spin)

        self.text_color_btn = _color_button((255, 255, 255, 255), lambda c: self._refresh_preview())
        content_form.addRow("Couleur du texte", self.text_color_btn)

        self.stroke_width_spin = QSpinBox(minimum=0, maximum=10, value=0)
        self.stroke_width_spin.valueChanged.connect(self._refresh_preview)
        content_form.addRow("Contour (épaisseur)", self.stroke_width_spin)

        self.stroke_color_btn = _color_button((0, 0, 0, 255), lambda c: self._refresh_preview())
        content_form.addRow("Couleur du contour", self.stroke_color_btn)
        left.addWidget(content_group)

        bg_group = QGroupBox("Fond de l'étiquette")
        bg_form = QFormLayout(bg_group)
        self.bg_shape_combo = QComboBox()
        self.bg_shape_combo.addItems(BG_SHAPES)
        self.bg_shape_combo.currentTextChanged.connect(self._refresh_preview)
        bg_form.addRow("Forme", self.bg_shape_combo)

        self.bg_color_btn = _color_button((214, 40, 40, 235), lambda c: self._refresh_preview())
        bg_form.addRow("Couleur de fond", self.bg_color_btn)

        self.pad_x_spin = QSpinBox(minimum=0, maximum=100, value=26)
        self.pad_x_spin.valueChanged.connect(self._refresh_preview)
        bg_form.addRow("Marge horizontale", self.pad_x_spin)

        self.pad_y_spin = QSpinBox(minimum=0, maximum=100, value=14)
        self.pad_y_spin.valueChanged.connect(self._refresh_preview)
        bg_form.addRow("Marge verticale", self.pad_y_spin)

        self.shadow_checkbox = QCheckBox("Ombre portée")
        self.shadow_checkbox.setChecked(True)
        self.shadow_checkbox.stateChanged.connect(self._refresh_preview)
        bg_form.addRow(self.shadow_checkbox)
        left.addWidget(bg_group)

        pos_group = QGroupBox("Position sur l'image")
        pos_layout = QVBoxLayout(pos_group)
        anchor_grid = QGridLayout()
        self.anchor_buttons = QButtonGroup(self)
        for i, name in enumerate(ANCHORS):
            rb = QRadioButton(name)
            rb.toggled.connect(self._refresh_preview)
            self.anchor_buttons.addButton(rb)
            anchor_grid.addWidget(rb, i // 3, i % 3)
            if name == "Haut droite":
                rb.setChecked(True)
        pos_layout.addLayout(anchor_grid)

        offset_form = QFormLayout()
        self.offset_x_spin = QSpinBox(minimum=0, maximum=500, value=24)
        self.offset_x_spin.valueChanged.connect(self._refresh_preview)
        self.offset_y_spin = QSpinBox(minimum=0, maximum=500, value=24)
        self.offset_y_spin.valueChanged.connect(self._refresh_preview)
        offset_form.addRow("Décalage horizontal", self.offset_x_spin)
        offset_form.addRow("Décalage vertical", self.offset_y_spin)
        self.rotation_slider = QSlider(Qt.Horizontal, minimum=-45, maximum=45, value=0)
        self.rotation_slider.valueChanged.connect(self._refresh_preview)
        offset_form.addRow("Rotation", self.rotation_slider)
        pos_layout.addLayout(offset_form)
        left.addWidget(pos_group)

        root.addLayout(left, 3)

        right = QVBoxLayout()
        right.addWidget(QLabel("<b>Aperçu</b>"))
        self.preview_label = QLabel()
        self.preview_label.setFixedSize(280, 280)
        self.preview_label.setStyleSheet(
            "background-color: #3a3b42; border: 1px solid #555;"
        )
        self.preview_label.setAlignment(Qt.AlignCenter)
        right.addWidget(self.preview_label)
        right.addStretch()

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        right.addWidget(buttons)
        root.addLayout(right, 2)

    # ------------------------------------------------------------------
    def _apply_preset(self, name: str):
        p = BADGE_PRESETS[name]
        self.text_edit.setText(p["text"])
        self.bg_shape_combo.setCurrentText(p.get("bg_shape", "Arrondi"))
        for name_ in ANCHORS:
            pass
        target_anchor = p.get("anchor", "Haut droite")
        for btn in self.anchor_buttons.buttons():
            if btn.text() == target_anchor:
                btn.setChecked(True)
        self.rotation_slider.setValue(p.get("rotation", 0))
        self.text_color_btn.get_color = lambda c=p.get("text_color", (255, 255, 255, 255)): c
        self.text_color_btn.setStyleSheet(
            f"background-color: rgba{p.get('text_color', (255,255,255,255))}; border: 1px solid #555;"
        )
        self.bg_color_btn.get_color = lambda c=p.get("bg_color", (214, 40, 40, 235)): c
        self.bg_color_btn.setStyleSheet(
            f"background-color: rgba{p.get('bg_color', (214,40,40,235))}; border: 1px solid #555;"
        )
        self._refresh_preview()

    def _load_from_element(self):
        el = self.el
        self.text_edit.setText(el.text)
        self.font_combo.setCurrentText(el.font_family)
        self.size_spin.setValue(el.font_size)
        self.stroke_width_spin.setValue(el.stroke_width)
        self.bg_shape_combo.setCurrentText(el.bg_shape)
        self.pad_x_spin.setValue(el.padding_x)
        self.pad_y_spin.setValue(el.padding_y)
        self.shadow_checkbox.setChecked(el.shadow)
        self.offset_x_spin.setValue(el.offset_x)
        self.offset_y_spin.setValue(el.offset_y)
        self.rotation_slider.setValue(el.rotation)
        for btn in self.anchor_buttons.buttons():
            if btn.text() == el.anchor:
                btn.setChecked(True)
        self.text_color_btn.get_color = lambda c=el.text_color: c
        self.text_color_btn.setStyleSheet(f"background-color: rgba{el.text_color}; border: 1px solid #555;")
        self.bg_color_btn.get_color = lambda c=el.bg_color: c
        self.bg_color_btn.setStyleSheet(f"background-color: rgba{el.bg_color}; border: 1px solid #555;")
        self.stroke_color_btn.get_color = lambda c=el.stroke_color: c
        self.stroke_color_btn.setStyleSheet(f"background-color: rgba{el.stroke_color}; border: 1px solid #555;")

    def current_anchor(self) -> str:
        for btn in self.anchor_buttons.buttons():
            if btn.isChecked():
                return btn.text()
        return "Haut droite"

    def build_element(self) -> DesignElement:
        return DesignElement(
            kind=self.el.kind,
            text=self.text_edit.text(),
            font_family=self.font_combo.currentText(),
            font_size=self.size_spin.value(),
            text_color=self.text_color_btn.get_color(),
            stroke_width=self.stroke_width_spin.value(),
            stroke_color=self.stroke_color_btn.get_color(),
            bg_shape=self.bg_shape_combo.currentText(),
            bg_color=self.bg_color_btn.get_color(),
            padding_x=self.pad_x_spin.value(),
            padding_y=self.pad_y_spin.value(),
            anchor=self.current_anchor(),
            offset_x=self.offset_x_spin.value(),
            offset_y=self.offset_y_spin.value(),
            rotation=self.rotation_slider.value(),
            shadow=self.shadow_checkbox.isChecked(),
            pos_x=self.el.pos_x,
            pos_y=self.el.pos_y,
        )

    def _refresh_preview(self, *_):
        el = self.build_element()
        try:
            layer = build_element_layer(el)
        except Exception:
            return
        base = Image.new("RGBA", (280, 280), (58, 59, 66, 255))
        pos = resolve_position(base.size, layer.size, el)
        pos = (max(0, min(pos[0], 280 - layer.width)), max(0, min(pos[1], 280 - layer.height)))
        composed = Image.alpha_composite(base, _place(layer, base.size, pos))
        self.preview_label.setPixmap(_design_pil_to_pixmap(composed))
        if el.anchor == FREE_ANCHOR:
            self.preview_label.setToolTip(
                "Position libre réglée par glisser-déposer dans l'aperçu du Studio Collage."
            )
        else:
            self.preview_label.setToolTip("")


# ==========================================================================
# 6. WIDGET RÉUTILISABLE — panneau de gestion des calques (liste + actions)
# ==========================================================================

class LayerPanel(QGroupBox):
    """Liste de calques de design avec Ajouter / Modifier / Dupliquer /
    Supprimer / Monter / Descendre. Émet on_change() à chaque modification."""

    def __init__(self, on_change, parent=None):
        super().__init__("🏷️ Bandeaux, étiquettes & texte", parent)
        self.on_change = on_change
        self.elements: list[DesignElement] = []
        layout = QVBoxLayout(self)
        self.list_widget = QListWidget()
        layout.addWidget(self.list_widget)

        row1 = QHBoxLayout()
        btn_add = QPushButton("➕ Ajouter")
        btn_add.clicked.connect(self._add)
        btn_edit = QPushButton("✏️ Modifier")
        btn_edit.clicked.connect(self._edit)
        btn_dup = QPushButton("📄 Dupliquer")
        btn_dup.clicked.connect(self._duplicate)
        btn_del = QPushButton("🗑 Supprimer")
        btn_del.clicked.connect(self._remove)
        row1.addWidget(btn_add)
        row1.addWidget(btn_edit)
        row1.addWidget(btn_dup)
        row1.addWidget(btn_del)
        layout.addLayout(row1)

        row2 = QHBoxLayout()
        btn_up = QPushButton("⬆️ Monter")
        btn_up.clicked.connect(lambda: self._move(-1))
        btn_down = QPushButton("⬇️ Descendre")
        btn_down.clicked.connect(lambda: self._move(1))
        btn_price = QPushButton("💰 Étiquette prix…")
        btn_price.clicked.connect(self._add_price_tag)
        row2.addWidget(btn_up)
        row2.addWidget(btn_down)
        row2.addWidget(btn_price)
        layout.addLayout(row2)

        template_group = QGroupBox("📁 Modèles de design réutilisables")
        template_layout = QVBoxLayout(template_group)
        self.template_combo = QComboBox()
        template_layout.addWidget(self.template_combo)
        template_btn_row = QHBoxLayout()
        btn_load_tpl = QPushButton("📂 Charger")
        btn_load_tpl.clicked.connect(self._load_template)
        btn_save_tpl = QPushButton("💾 Enregistrer…")
        btn_save_tpl.clicked.connect(self._save_template)
        btn_del_tpl = QPushButton("🗑 Supprimer")
        btn_del_tpl.clicked.connect(self._delete_template)
        template_btn_row.addWidget(btn_load_tpl)
        template_btn_row.addWidget(btn_save_tpl)
        template_btn_row.addWidget(btn_del_tpl)
        template_layout.addLayout(template_btn_row)
        layout.addWidget(template_group)
        self._refresh_template_combo()

        self.list_widget.itemDoubleClicked.connect(lambda _: self._edit())

    def _refresh_list(self):
        self.list_widget.clear()
        for el in self.elements:
            label = f"{el.kind} — “{el.text}” ({el.anchor})"
            self.list_widget.addItem(QListWidgetItem(label))

    def _refresh_template_combo(self):
        current = self.template_combo.currentText()
        self.template_combo.blockSignals(True)
        self.template_combo.clear()
        self.template_combo.addItems(load_design_templates().keys())
        idx = self.template_combo.findText(current)
        if idx >= 0:
            self.template_combo.setCurrentIndex(idx)
        self.template_combo.blockSignals(False)

    def _load_template(self):
        name = self.template_combo.currentText()
        if not name:
            QMessageBox.information(self, "Aucun modèle", "Aucun modèle de design enregistré pour l'instant.")
            return
        templates = load_design_templates()
        elements = templates.get(name)
        if elements is None:
            return
        import copy
        self.elements = copy.deepcopy(elements)
        self._refresh_list()
        self.on_change()

    def _save_template(self):
        if not self.elements:
            QMessageBox.information(self, "Rien à enregistrer", "Ajoutez au moins un bandeau/étiquette/texte d'abord.")
            return
        from PyQt5.QtWidgets import QInputDialog
        name, ok = QInputDialog.getText(self, "Enregistrer comme modèle", "Nom du modèle :")
        if not ok or not name.strip():
            return
        save_design_template(name.strip(), self.elements)
        self._refresh_template_combo()
        self.template_combo.setCurrentText(name.strip())
        QMessageBox.information(self, "Modèle enregistré", f"Le modèle « {name.strip()} » a été enregistré.")

    def _delete_template(self):
        name = self.template_combo.currentText()
        if not name:
            return
        reply = QMessageBox.question(
            self, "Supprimer le modèle", f"Supprimer définitivement le modèle « {name} » ?",
            QMessageBox.Yes | QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            delete_design_template(name)
            self._refresh_template_combo()

    def _add(self):
        dlg = ElementEditorDialog(DesignElement(), self)
        if dlg.exec_() == QDialog.Accepted:
            self.elements.append(dlg.build_element())
            self._refresh_list()
            self.on_change()

    def _add_price_tag(self):
        from PyQt5.QtWidgets import QInputDialog
        amount, ok = QInputDialog.getText(self, "Étiquette prix", "Montant (ex: 12 500) :")
        if not ok or not amount.strip():
            return
        el = make_price_tag(amount.strip())
        dlg = ElementEditorDialog(el, self)
        if dlg.exec_() == QDialog.Accepted:
            self.elements.append(dlg.build_element())
            self._refresh_list()
            self.on_change()

    def _selected_index(self) -> Optional[int]:
        row = self.list_widget.currentRow()
        return row if 0 <= row < len(self.elements) else None

    def _edit(self):
        idx = self._selected_index()
        if idx is None:
            return
        dlg = ElementEditorDialog(self.elements[idx], self)
        if dlg.exec_() == QDialog.Accepted:
            self.elements[idx] = dlg.build_element()
            self._refresh_list()
            self.on_change()

    def _duplicate(self):
        idx = self._selected_index()
        if idx is None:
            return
        import copy
        self.elements.append(copy.deepcopy(self.elements[idx]))
        self._refresh_list()
        self.on_change()

    def _remove(self):
        idx = self._selected_index()
        if idx is None:
            return
        self.elements.pop(idx)
        self._refresh_list()
        self.on_change()

    def _move(self, direction: int):
        idx = self._selected_index()
        if idx is None:
            return
        new_idx = idx + direction
        if not (0 <= new_idx < len(self.elements)):
            return
        self.elements[idx], self.elements[new_idx] = self.elements[new_idx], self.elements[idx]
        self._refresh_list()
        self.list_widget.setCurrentRow(new_idx)
        self.on_change()


# ==========================================================================
# 7. STUDIO COLLAGE & DESIGN — intégré comme onglet de la fenêtre principale
# ==========================================================================

class InteractivePreviewLabel(QLabel):
    """QLabel d'aperçu qui relaie les événements souris au widget parent
    (CollageStudioWidget), pour permettre de glisser-déposer les
    bandeaux/étiquettes directement sur le visuel."""

    def __init__(self, controller, parent=None):
        super().__init__(parent)
        self.controller = controller

    def mousePressEvent(self, event):
        self.controller._on_preview_mouse_press(event.pos())

    def mouseMoveEvent(self, event):
        self.controller._on_preview_mouse_move(event.pos())

    def mouseReleaseEvent(self, event):
        self.controller._on_preview_mouse_release(event.pos())


class ProcessedImagePickerDialog(QDialog):
    """Petite fenêtre pour choisir une ou plusieurs photos déjà traitées
    (issues du lot en cours) à ajouter au collage."""

    def __init__(self, available_results: list[tuple[str, str, Image.Image]], parent=None):
        super().__init__(parent)
        self.setWindowTitle("Ajouter une image déjà traitée")
        self.resize(360, 420)
        self.available_results = available_results
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Sélectionnez une ou plusieurs images :"))
        self.list_widget = QListWidget()
        self.list_widget.setSelectionMode(QAbstractItemView.ExtendedSelection)
        for _key, label, _img in available_results:
            self.list_widget.addItem(QListWidgetItem(label))
        layout.addWidget(self.list_widget)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def selected_results(self) -> list[tuple[str, str, Image.Image]]:
        rows = {i.row() for i in self.list_widget.selectedIndexes()}
        return [self.available_results[r] for r in sorted(rows)]


class CollageStudioWidget(QWidget):
    """Outil complet : assemble plusieurs photos en un collage professionnel
    et permet d'ajouter des bandeaux/étiquettes/texte design par-dessus,
    avec positionnement possible à la souris directement dans l'aperçu.

    Intégré directement comme onglet dans la fenêtre principale (et non plus
    ouvert dans une fenêtre séparée) : voir MainWindow._build_ui, où une
    instance unique et persistante de ce widget est ajoutée à self.preview_tabs."""

    def __init__(self, initial_paths: Optional[list] = None, parent=None,
                 available_results: Optional[list[tuple[str, str, Image.Image]]] = None):
        super().__init__(parent)
        # Chaque source est un tuple (libellé affiché, Path *ou* PIL.Image déjà
        # en mémoire — ex. une photo déjà traitée par le pipeline principal).
        # self._source_keys retient, pour chaque entrée de image_sources (même
        # index), une clé stable (le chemin d'origine) qui permet de reconnaître
        # « c'est la même photo » lors d'un sync ultérieur : au lieu d'ajouter un
        # doublon, on met à jour l'entrée existante en place. C'est ce qui donne
        # la continuité entre l'éditeur principal et le Studio Collage.
        self.image_sources: list[tuple[str, object]] = []
        self._source_keys: list[Optional[str]] = []
        for p in (initial_paths or []):
            self.image_sources.append((Path(p).name, Path(p)))
            self._source_keys.append(str(Path(p)))
        self.available_results = available_results or []
        self._base_collage: Optional[Image.Image] = None
        self._last_render: Optional[Image.Image] = None
        self._preview_canvas_size: Optional[tuple[int, int]] = None
        self._preview_offset = (0, 0)
        self._preview_scale = 1.0
        self._dragging_idx: Optional[int] = None
        self._drag_grab_delta = (0.0, 0.0)
        self._build_ui()
        self._refresh_image_list()
        self._refresh_preview()

    # ------------------------------------------------------------------
    def _build_ui(self):
        root = QHBoxLayout(self)

        # --- colonne gauche : sources + gabarit + réglages ---
        left_scroll = QScrollArea()
        left_scroll.setWidgetResizable(True)
        left = QWidget()
        left_layout = QVBoxLayout(left)

        img_group = QGroupBox("🖼 Photos du collage")
        img_layout = QVBoxLayout(img_group)
        # Liste des photos actuellement dans le collage, dans l'ordre où elles
        # seront placées par le gabarit choisi plus bas.
        self.image_list = QListWidget()
        self.image_list.setSelectionMode(QAbstractItemView.ExtendedSelection)
        img_layout.addWidget(self.image_list)
        img_btn_row = QHBoxLayout()
        # Ajouter : ouvre un sélecteur de fichiers pour choisir des photos sur disque.
        btn_add_img = QPushButton("➕ Ajouter")
        btn_add_img.clicked.connect(self._add_images)
        # Retirer : supprime les photos sélectionnées dans la liste ci-dessus.
        btn_remove_img = QPushButton("🗑 Retirer")
        btn_remove_img.clicked.connect(self._remove_images)
        # ⬆️/⬇️ : change l'ordre de la photo sélectionnée (donc sa position
        # dans le gabarit de collage, qui suit l'ordre de la liste).
        btn_up = QPushButton("⬆️")
        btn_up.clicked.connect(lambda: self._move_image(-1))
        btn_down = QPushButton("⬇️")
        btn_down.clicked.connect(lambda: self._move_image(1))
        img_btn_row.addWidget(btn_add_img)
        img_btn_row.addWidget(btn_remove_img)
        img_btn_row.addWidget(btn_up)
        img_btn_row.addWidget(btn_down)
        img_layout.addLayout(img_btn_row)

        # Nouveau collage : vide entièrement la liste ci-dessus pour repartir
        # de zéro (avec confirmation si elle n'est pas déjà vide).
        self.btn_new_collage = QPushButton("🆕 Nouveau collage")
        self.btn_new_collage.setToolTip(
            "Vide le collage actuel pour repartir de zéro (demande confirmation)."
        )
        self.btn_new_collage.clicked.connect(self._confirm_reset_collage)
        img_layout.addWidget(self.btn_new_collage)

        # Depuis les photos déjà traitées… : ouvre un sélecteur listant les
        # résultats du lot en cours traités par le pipeline principal (masqué
        # tant qu'aucun résultat n'est disponible, voir set_available_results).
        self.btn_add_processed = QPushButton("🖼 Depuis les photos déjà traitées…")
        self.btn_add_processed.clicked.connect(self._add_processed_images)
        self.btn_add_processed.setVisible(bool(self.available_results))
        img_layout.addWidget(self.btn_add_processed)

        left_layout.addWidget(img_group)

        # Réglages du gabarit de collage : disposition des photos, format de
        # sortie, espacement/coins/fond, ombre sous chaque photo.
        layout_group = QGroupBox("🧩 Mise en page du collage")
        layout_form = QFormLayout(layout_group)
        # Gabarit : disposition des photos dans la grille (2x2, bande verticale,
        # mosaïque...) — voir COLLAGE_TEMPLATES.
        self.template_combo = QComboBox()
        self.template_combo.addItems(COLLAGE_TEMPLATES)
        self.template_combo.currentTextChanged.connect(self._refresh_preview)
        layout_form.addRow("Gabarit", self.template_combo)

        # Format de sortie : préréglages de dimensions (carré réseau social,
        # portrait produit...) qui remplissent Largeur/Hauteur ci-dessous.
        self.canvas_combo = QComboBox()
        self.canvas_combo.addItems(CANVAS_PRESETS.keys())
        self.canvas_combo.currentTextChanged.connect(self._on_canvas_preset_changed)
        layout_form.addRow("Format de sortie", self.canvas_combo)

        # Dimensions exactes du canevas final en pixels (modifiables librement,
        # bascule le préréglage ci-dessus sur « Personnalisé »).
        self.width_spin = QSpinBox(minimum=200, maximum=6000, value=1080, singleStep=10)
        self.height_spin = QSpinBox(minimum=200, maximum=6000, value=1080, singleStep=10)
        self.width_spin.valueChanged.connect(self._refresh_preview)
        self.height_spin.valueChanged.connect(self._refresh_preview)
        layout_form.addRow("Largeur (px)", self.width_spin)
        layout_form.addRow("Hauteur (px)", self.height_spin)

        # Espace (en px) laissé entre les photos du collage.
        self.spacing_slider = QSlider(Qt.Horizontal, minimum=0, maximum=60, value=14)
        self.spacing_slider.valueChanged.connect(self._refresh_preview)
        layout_form.addRow("Espacement", self.spacing_slider)

        # Rayon des coins arrondis appliqué à chaque photo du collage.
        self.radius_slider = QSlider(Qt.Horizontal, minimum=0, maximum=80, value=18)
        self.radius_slider.valueChanged.connect(self._refresh_preview)
        layout_form.addRow("Coins arrondis", self.radius_slider)

        # Couleur du fond visible dans l'espacement entre les photos.
        self.bg_color_btn = _color_button((255, 255, 255, 255), lambda c: self._refresh_preview())
        layout_form.addRow("Couleur de fond", self.bg_color_btn)

        # Ombre portée sous chaque photo pour un effet de profondeur.
        self.cell_shadow_checkbox = QCheckBox("Ombre sous chaque photo")
        self.cell_shadow_checkbox.setChecked(True)
        self.cell_shadow_checkbox.stateChanged.connect(self._refresh_preview)
        layout_form.addRow(self.cell_shadow_checkbox)
        left_layout.addWidget(layout_group)

        # Panneau des calques de design (bandeaux, étiquettes prix, texte) qui
        # se superposent au collage — repositionnables à la souris dans l'aperçu.
        self.layer_panel = LayerPanel(self._refresh_preview)
        left_layout.addWidget(self.layer_panel)

        left_layout.addStretch()
        left_scroll.setWidget(left)
        root.addWidget(left_scroll, 2)

        # --- colonne droite : aperçu + export ---
        right = QVBoxLayout()
        aperçu_label = QLabel(
            "<b>Aperçu</b> — cliquez-glissez un bandeau/étiquette directement sur l'image pour le repositionner"
        )
        aperçu_label.setWordWrap(True)
        right.addWidget(aperçu_label)
        # Aperçu en temps réel du collage + calques ; gère aussi le
        # glisser-déposer des calques (voir _on_preview_mouse_*).
        self.preview_label = InteractivePreviewLabel(self)
        self.preview_label.setText("Ajoutez des photos pour commencer…")
        self.preview_label.setAlignment(Qt.AlignCenter)
        self.preview_label.setMinimumSize(420, 420)
        self.preview_label.setStyleSheet("background-color: #2b2c33; border: 1px solid #555; color: #aaa;")
        right.addWidget(self.preview_label, 1)

        # Force un recalcul complet de l'aperçu (utile après un changement
        # externe, ex. une photo synchronisée mise à jour).
        btn_refresh = QPushButton("🔄 Actualiser l'aperçu")
        btn_refresh.clicked.connect(self._refresh_preview)
        right.addWidget(btn_refresh)

        # Enregistre le rendu final (collage + calques) en PNG ou JPEG sur disque.
        btn_export = QPushButton("💾 Exporter l'image finale…")
        btn_export.clicked.connect(self._export)
        right.addWidget(btn_export)

        root.addLayout(right, 3)

    # ------------------------------------------------------------------
    def set_available_results(self, available_results: Optional[list[tuple[str, str, Image.Image]]]):
        """Met à jour la liste des photos déjà traitées proposables (appelé
        par MainWindow à chaque fois que de nouveaux résultats sont disponibles,
        puisque ce widget est maintenant persistant plutôt que recréé à chaque
        ouverture). Chaque entrée est (clé/chemin d'origine, libellé, image)."""
        self.available_results = available_results or []
        self.btn_add_processed.setVisible(bool(self.available_results))

    def load_paths(self, paths: Optional[list]):
        """Remplace le contenu actuel du collage par la liste de chemins donnée."""
        self.image_sources = []
        self._source_keys = []
        for p in (paths or []):
            self.image_sources.append((Path(p).name, Path(p)))
            self._source_keys.append(str(Path(p)))
        self._refresh_image_list()
        self._refresh_preview()

    def has_synced_image(self, key: str) -> bool:
        """Indique si une image portant cette clé (chemin d'origine) est déjà
        présente dans le collage — utilisé par MainWindow pour savoir si un
        retraitement doit être répercuté immédiatement via sync_image()."""
        return key in self._source_keys

    def reset_collage(self):
        """Vide entièrement le collage en cours (photos + clés de sync) pour
        repartir de zéro — appelé explicitement (bouton « Nouveau collage »)
        ou par MainWindow quand un nouveau lot d'images remplace l'ancien."""
        self.image_sources = []
        self._source_keys = []
        self._refresh_image_list()
        self._refresh_preview()

    def _confirm_reset_collage(self):
        if not self.image_sources:
            return
        reply = QMessageBox.question(
            self, "Nouveau collage",
            "Vider le collage actuel et repartir de zéro ?\n\n"
            "Les photos déjà traitées du lot en cours resteront disponibles "
            "via « Depuis les photos déjà traitées… ».",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            self.reset_collage()

    def sync_image(self, key: str, label: str, image_or_path):
        """Ajoute cette image au collage si elle n'y est pas encore, ou met à
        jour en place (même position) l'entrée existante si elle y est déjà —
        reconnue via `key` (typiquement le chemin d'origine). C'est ce qui
        permet de continuer à retravailler la même photo (recadrage, retouche,
        traitement IA, envoi vers le collage...) sans dupliquer ni avoir à la
        recharger : le Studio Collage reste synchronisé avec l'image en cours."""
        if key in self._source_keys:
            idx = self._source_keys.index(key)
            self.image_sources[idx] = (label, image_or_path)
        else:
            self._source_keys.append(key)
            self.image_sources.append((label, image_or_path))
        self._refresh_image_list()
        self._refresh_preview()

    # ------------------------------------------------------------------
    def _on_canvas_preset_changed(self, name: str):
        """Applique les dimensions du préréglage choisi aux champs Largeur/Hauteur
        (sauf « Personnalisé », où l'utilisateur garde la main)."""
        if name in CANVAS_PRESETS and name != "Personnalisé":
            w, h = CANVAS_PRESETS[name]
            self.width_spin.blockSignals(True)
            self.height_spin.blockSignals(True)
            self.width_spin.setValue(w)
            self.height_spin.setValue(h)
            self.width_spin.blockSignals(False)
            self.height_spin.blockSignals(False)
        self._refresh_preview()

    def _add_images(self):
        """Bouton ➕ Ajouter : ouvre un sélecteur de fichiers et ajoute les
        photos choisies au collage (via sync_image, pour rester cohérent avec
        le suivi par clé même pour un ajout manuel)."""
        files, _ = QFileDialog.getOpenFileNames(
            self, "Choisir des photos produit", "", "Images (*.png *.jpg *.jpeg *.webp *.bmp)"
        )
        for f in files:
            self.sync_image(str(Path(f)), Path(f).name, Path(f))

    def _add_processed_images(self):
        """Bouton « Depuis les photos déjà traitées… » : ouvre un sélecteur
        listant les résultats du lot en cours et ajoute ceux choisis au collage."""
        dlg = ProcessedImagePickerDialog(self.available_results, self)
        if dlg.exec_() == QDialog.Accepted:
            chosen = dlg.selected_results()
            if not chosen:
                return
            for key, label, img in chosen:
                self.sync_image(key, f"✓ {label}", img.copy())

    def _remove_images(self):
        """Bouton 🗑 Retirer : supprime les photos sélectionnées du collage
        (et leurs clés de suivi associées)."""
        rows = sorted({i.row() for i in self.image_list.selectedIndexes()}, reverse=True)
        for r in rows:
            if 0 <= r < len(self.image_sources):
                self.image_sources.pop(r)
                if 0 <= r < len(self._source_keys):
                    self._source_keys.pop(r)
        self._refresh_image_list()
        self._refresh_preview()

    def _move_image(self, direction: int):
        """Boutons ⬆️/⬇️ : échange la photo actuellement sélectionnée avec sa
        voisine, ce qui change sa place dans le gabarit de collage."""
        row = self.image_list.currentRow()
        new_row = row + direction
        if not (0 <= row < len(self.image_sources)) or not (0 <= new_row < len(self.image_sources)):
            return
        self.image_sources[row], self.image_sources[new_row] = self.image_sources[new_row], self.image_sources[row]
        self._source_keys[row], self._source_keys[new_row] = self._source_keys[new_row], self._source_keys[row]
        self._refresh_image_list()
        self.image_list.setCurrentRow(new_row)
        self._refresh_preview()

    def _refresh_image_list(self):
        """Redessine la liste de gauche à partir de l'état actuel de image_sources."""
        self.image_list.clear()
        for label, _ in self.image_sources:
            self.image_list.addItem(QListWidgetItem(label))

    # ------------------------------------------------------------------
    def _refresh_preview(self, *_):
        """Recalcule tout : la mosaïque de base (chargement des photos depuis
        le disque/la mémoire) puis les calques de design par-dessus."""
        if not self.image_sources:
            self.preview_label.setText("Ajoutez des photos pour commencer…")
            self.preview_label.setPixmap(QPixmap())
            self._base_collage = None
            self._last_render = None
            return
        canvas_size = (self.width_spin.value(), self.height_spin.value())
        sources = [src for _, src in self.image_sources]
        try:
            self._base_collage = render_collage(
                sources, self.template_combo.currentText(), canvas_size,
                self.spacing_slider.value(), self.radius_slider.value(),
                self.bg_color_btn.get_color(), self.cell_shadow_checkbox.isChecked(),
            )
        except Exception as exc:  # noqa: BLE001
            self.preview_label.setText(f"Erreur d'aperçu : {exc}")
            self._base_collage = None
            return
        self._preview_canvas_size = canvas_size
        self._recompose_only()

    def _recompose_only(self):
        """Ne fait que superposer les calques de design sur la mosaïque déjà
        calculée (self._base_collage) : rapide, utilisé pendant le glisser."""
        if self._base_collage is None:
            return
        composed = compose_elements(self._base_collage, self.layer_panel.elements)
        self._last_render = composed
        preview = composed.copy()
        preview.thumbnail((560, 700), Image.Resampling.LANCZOS)
        self.preview_label.setPixmap(_design_pil_to_pixmap(preview))

        pm = self.preview_label.pixmap()
        if pm and not pm.isNull() and self._preview_canvas_size:
            lw, lh = self.preview_label.width(), self.preview_label.height()
            pw, ph = pm.width(), pm.height()
            self._preview_offset = ((lw - pw) // 2, (lh - ph) // 2)
            self._preview_scale = pw / self._preview_canvas_size[0] if self._preview_canvas_size[0] else 1.0

    # ------------------------------------------------------------------
    # Glisser-déposer des calques directement dans l'aperçu
    # ------------------------------------------------------------------
    def _label_to_canvas(self, pos) -> Optional[tuple[float, float]]:
        """Convertit une position souris (dans le QLabel d'aperçu, mis à
        l'échelle et centré) en coordonnées réelles sur le canevas du collage."""
        if not self._preview_canvas_size or not self._preview_scale:
            return None
        x = (pos.x() - self._preview_offset[0]) / self._preview_scale
        y = (pos.y() - self._preview_offset[1]) / self._preview_scale
        return x, y

    def _on_preview_mouse_press(self, pos):
        """Clic dans l'aperçu : repère si un calque (bandeau/étiquette/texte)
        se trouve sous le curseur et, si oui, démarre son glisser (en partant
        du calque le plus au-dessus, donc dessiné en dernier)."""
        canvas_pos = self._label_to_canvas(pos)
        if canvas_pos is None or not self.layer_panel.elements:
            return
        cx, cy = canvas_pos
        for idx in reversed(range(len(self.layer_panel.elements))):
            el = self.layer_panel.elements[idx]
            try:
                layer = build_element_layer(el)
            except Exception:
                continue
            lpos = resolve_position(self._preview_canvas_size, layer.size, el)
            if lpos[0] <= cx <= lpos[0] + layer.width and lpos[1] <= cy <= lpos[1] + layer.height:
                center = (lpos[0] + layer.width / 2, lpos[1] + layer.height / 2)
                self._dragging_idx = idx
                self._drag_grab_delta = (cx - center[0], cy - center[1])
                self.layer_panel.list_widget.setCurrentRow(idx)
                return
        self._dragging_idx = None

    def _on_preview_mouse_move(self, pos):
        """Pendant le glisser : déplace le calque saisi pour qu'il suive la
        souris, en position libre (ancre FREE_ANCHOR), bornée au canevas."""
        if self._dragging_idx is None:
            return
        canvas_pos = self._label_to_canvas(pos)
        if canvas_pos is None:
            return
        cx, cy = canvas_pos
        cw, ch = self._preview_canvas_size
        gx, gy = self._drag_grab_delta
        el = self.layer_panel.elements[self._dragging_idx]
        el.anchor = FREE_ANCHOR
        el.pos_x = max(0.0, min(1.0, (cx - gx) / cw)) if cw else 0.5
        el.pos_y = max(0.0, min(1.0, (cy - gy) / ch)) if ch else 0.5
        self._recompose_only()

    def _on_preview_mouse_release(self, pos):
        """Fin du glisser : relâche le calque et rafraîchit la liste des
        calques (pour refléter la nouvelle position/ancre)."""
        if self._dragging_idx is not None:
            self._dragging_idx = None
            self.layer_panel._refresh_list()

    def _export(self):
        """Bouton 💾 Exporter l'image finale : enregistre le dernier rendu
        (collage + calques) sur disque, en PNG ou JPEG selon l'extension
        choisie dans la boîte de dialogue."""
        if not self._last_render:
            QMessageBox.information(self, "Rien à exporter", "Ajoutez au moins une photo d'abord.")
            return
        path, fmt_filter = QFileDialog.getSaveFileName(
            self, "Exporter le collage", "collage_nexus_market.png",
            "PNG (*.png);;JPEG (*.jpg)"
        )
        if not path:
            return
        img = self._last_render
        try:
            if path.lower().endswith((".jpg", ".jpeg")):
                img.convert("RGB").save(path, "JPEG", quality=95)
            else:
                img.save(path, "PNG")
        except Exception as exc:  # noqa: BLE001
            QMessageBox.warning(self, "Erreur d'export", f"Impossible d'enregistrer l'image :\n{exc}")
            return
        QMessageBox.information(self, "Export réussi", f"Image enregistrée :\n{path}")


# ==========================================================================
# 6ter. RECADRAGE / REDRESSEMENT & RETOUCHE LOCALISÉE
# ==========================================================================

class CropCanvas(QWidget):
    """Zone interactive de recadrage : rectangle ajustable par ses 4 coins
    ou déplaçable, superposé à un aperçu de l'image (assombrissement des
    zones exclues, à la manière des outils de recadrage pro). Se combine
    avec des champs numériques (dans CropStraightenDialog) pour un cadrage
    au pixel près, la souris seule manquant de précision sur une image
    haute résolution affichée en aperçu réduit."""

    changed = pyqtSignal()
    HANDLE = 9

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(640, 640)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.StrongFocus)
        self._pixmap: Optional[QPixmap] = None
        self._image_size: tuple[int, int] = (1, 1)  # taille RÉELLE (pleine résolution) de l'image affichée
        self._rect: Optional[tuple[float, float, float, float]] = None
        self._aspect: Optional[float] = None
        self._drag_mode: Optional[str] = None
        self._drag_start = None
        self._rect_start = None

    def set_image(self, img: Image.Image):
        self._image_size = img.size
        self._pixmap = pil_to_pixmap(img, max_size=1400)
        if self._rect is None:
            self._rect = (0.0, 0.0, 1.0, 1.0)
        self.update()

    def get_image_size(self) -> tuple[int, int]:
        return self._image_size

    def set_rect(self, rect: tuple[float, float, float, float]):
        self._rect = rect
        self.update()

    def get_rect(self) -> tuple[float, float, float, float]:
        return self._rect or (0.0, 0.0, 1.0, 1.0)

    def set_aspect(self, ratio: Optional[float]):
        self._aspect = ratio
        if ratio and self._rect:
            ir = self._image_rect()
            if ir.width() and ir.height():
                l, t, r, b = self._rect
                cx, cy = (l + r) / 2, (t + b) / 2
                h = b - t
                img_ratio = ir.width() / ir.height() if ir.height() else 1.0
                target_w = (h * ratio / img_ratio) if img_ratio else h * ratio
                new_l, new_r = cx - target_w / 2, cx + target_w / 2
                if new_l < 0:
                    new_r -= new_l
                    new_l = 0.0
                if new_r > 1:
                    new_l -= (new_r - 1)
                    new_r = 1.0
                self._rect = (max(0.0, new_l), t, min(1.0, new_r), b)
        self.update()
        self.changed.emit()

    def _image_rect(self) -> QRect:
        if self._pixmap is None:
            return self.rect()
        scaled = self._pixmap.size().scaled(self.size(), Qt.KeepAspectRatio)
        x = (self.width() - scaled.width()) // 2
        y = (self.height() - scaled.height()) // 2
        return QRect(x, y, scaled.width(), scaled.height())

    def _rect_px(self) -> QRect:
        ir = self._image_rect()
        l, t, r, b = self._rect or (0.0, 0.0, 1.0, 1.0)
        return QRect(
            int(ir.left() + l * ir.width()), int(ir.top() + t * ir.height()),
            int((r - l) * ir.width()), int((b - t) * ir.height())
        )

    def _hit_test(self, pos, rpx: QRect) -> Optional[str]:
        h = self.HANDLE
        corners = {"tl": rpx.topLeft(), "tr": rpx.topRight(),
                   "bl": rpx.bottomLeft(), "br": rpx.bottomRight()}
        for name, pt in corners.items():
            if (pos - pt).manhattanLength() <= h * 1.6:
                return name
        if rpx.contains(pos):
            return "move"
        return None

    def mousePressEvent(self, event):
        if self._pixmap is None:
            return
        self.setFocus()
        self._drag_mode = self._hit_test(event.pos(), self._rect_px())
        self._drag_start = event.pos()
        self._rect_start = self._rect

    def mouseMoveEvent(self, event):
        if self._pixmap is None:
            return
        if self._drag_mode is None:
            mode = self._hit_test(event.pos(), self._rect_px())
            cursor = {"tl": Qt.SizeFDiagCursor, "br": Qt.SizeFDiagCursor,
                      "tr": Qt.SizeBDiagCursor, "bl": Qt.SizeBDiagCursor,
                      "move": Qt.SizeAllCursor}.get(mode, Qt.ArrowCursor)
            self.setCursor(cursor)
            return
        ir = self._image_rect()
        if ir.width() <= 0 or ir.height() <= 0 or self._rect_start is None:
            return
        dx = (event.pos().x() - self._drag_start.x()) / ir.width()
        dy = (event.pos().y() - self._drag_start.y()) / ir.height()
        l, t, r, b = self._rect_start
        min_size = 0.03
        if self._drag_mode == "move":
            w, h = r - l, b - t
            new_l = max(0.0, min(1.0 - w, l + dx))
            new_t = max(0.0, min(1.0 - h, t + dy))
            self._rect = (new_l, new_t, new_l + w, new_t + h)
        elif self._drag_mode == "tl":
            self._rect = (min(l + dx, r - min_size), min(t + dy, b - min_size), r, b)
        elif self._drag_mode == "tr":
            self._rect = (l, min(t + dy, b - min_size), max(r + dx, l + min_size), b)
        elif self._drag_mode == "bl":
            self._rect = (min(l + dx, r - min_size), t, r, max(b + dy, t + min_size))
        elif self._drag_mode == "br":
            self._rect = (l, t, max(r + dx, l + min_size), max(b + dy, t + min_size))
        else:
            return
        self._rect = tuple(max(0.0, min(1.0, v)) for v in self._rect)
        self.changed.emit()
        self.update()

    def mouseReleaseEvent(self, event):
        self._drag_mode = None

    def keyPressEvent(self, event):
        """Flèches = déplace la sélection de 1 px (10 px avec Majuscule) —
        pour un ajustement fin impossible à la souris seule."""
        if self._pixmap is None or self._rect is None or event.key() not in (
                Qt.Key_Left, Qt.Key_Right, Qt.Key_Up, Qt.Key_Down):
            super().keyPressEvent(event)
            return
        step = 10 if event.modifiers() & Qt.ShiftModifier else 1
        iw, ih = self._image_size
        dx, dy = step / max(1, iw), step / max(1, ih)
        l, t, r, b = self._rect
        w, h = r - l, b - t
        if event.key() == Qt.Key_Left:
            l = max(0.0, l - dx)
        elif event.key() == Qt.Key_Right:
            l = min(1.0 - w, l + dx)
        elif event.key() == Qt.Key_Up:
            t = max(0.0, t - dy)
        elif event.key() == Qt.Key_Down:
            t = min(1.0 - h, t + dy)
        self._rect = (l, t, l + w, t + h)
        self.changed.emit()
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)
        painter.fillRect(self.rect(), QColor("#141518"))
        if self._pixmap is None:
            painter.setPen(QColor("#888a94"))
            painter.drawText(self.rect(), Qt.AlignCenter, "Aucune image")
            painter.end()
            return
        ir = self._image_rect()
        painter.drawPixmap(ir, self._pixmap)

        rpx = self._rect_px()
        overlay = QColor(0, 0, 0, 140)
        painter.fillRect(QRect(ir.left(), ir.top(), ir.width(), rpx.top() - ir.top()), overlay)
        painter.fillRect(QRect(ir.left(), rpx.bottom(), ir.width(), ir.bottom() - rpx.bottom()), overlay)
        painter.fillRect(QRect(ir.left(), rpx.top(), rpx.left() - ir.left(), rpx.height()), overlay)
        painter.fillRect(QRect(rpx.right(), rpx.top(), ir.right() - rpx.right(), rpx.height()), overlay)

        painter.setPen(QPen(QColor("#2f80ed"), 2))
        painter.drawRect(rpx)
        painter.setBrush(QBrush(QColor("#2f80ed")))
        painter.setPen(QPen(QColor("#ffffff"), 1))
        for pt in (rpx.topLeft(), rpx.topRight(), rpx.bottomLeft(), rpx.bottomRight()):
            painter.drawEllipse(pt, 5, 5)
        painter.end()


class CropStraightenDialog(QDialog):
    """Recadrage libre ou par ratio prédéfini + redressement fin (rotation à
    l'angle près, ex. pour aligner un horizon ou un bord de produit)."""

    ASPECTS = {"Libre": None, "1:1": 1.0, "4:5": 4 / 5, "4:3": 4 / 3, "16:9": 16 / 9}

    def __init__(self, base_image: Image.Image, existing: Optional[ImageEdits], parent=None):
        super().__init__(parent)
        self.setWindowTitle("✂️ Recadrer / redresser")
        self.resize(940, 820)
        self._base_image = base_image.convert("RGB")
        self._angle = existing.straighten_angle if existing else 0.0
        self._syncing = False
        self._build_ui()
        self._refresh_rotated_image()
        if existing and existing.crop_rect:
            self.canvas.set_rect(existing.crop_rect)
        self.angle_slider.blockSignals(True)
        self.angle_slider.setValue(int(round(self._angle * 10)))
        self.angle_slider.blockSignals(False)
        self.angle_label.setText(f"{self._angle:.1f}°")
        self._sync_spins_from_canvas()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        self.canvas = CropCanvas()
        self.canvas.changed.connect(self._sync_spins_from_canvas)
        layout.addWidget(self.canvas, stretch=1)

        aspect_row = QHBoxLayout()
        aspect_row.addWidget(QLabel("Ratio de recadrage :"))
        self.aspect_combo = QComboBox()
        self.aspect_combo.addItems(self.ASPECTS.keys())
        self.aspect_combo.currentTextChanged.connect(lambda n: self.canvas.set_aspect(self.ASPECTS.get(n)))
        aspect_row.addWidget(self.aspect_combo)
        aspect_row.addStretch()
        layout.addLayout(aspect_row)

        # --- Champs numériques précis (X / Y / largeur / hauteur en pixels) ---
        precise_group = QGroupBox("📐 Recadrage précis (en pixels)")
        precise_form = QFormLayout(precise_group)
        self.spin_x = QSpinBox(minimum=0, maximum=100000)
        self.spin_y = QSpinBox(minimum=0, maximum=100000)
        self.spin_w = QSpinBox(minimum=1, maximum=100000)
        self.spin_h = QSpinBox(minimum=1, maximum=100000)
        for spin in (self.spin_x, self.spin_y, self.spin_w, self.spin_h):
            spin.valueChanged.connect(self._sync_canvas_from_spins)
        xy_row = QHBoxLayout()
        xy_row.addWidget(QLabel("X")); xy_row.addWidget(self.spin_x)
        xy_row.addWidget(QLabel("Y")); xy_row.addWidget(self.spin_y)
        precise_form.addRow("Position", self._wrap(xy_row))
        wh_row = QHBoxLayout()
        wh_row.addWidget(QLabel("Largeur")); wh_row.addWidget(self.spin_w)
        wh_row.addWidget(QLabel("Hauteur")); wh_row.addWidget(self.spin_h)
        precise_form.addRow("Taille", self._wrap(wh_row))
        self.lbl_image_size = QLabel("")
        precise_form.addRow("Image source", self.lbl_image_size)
        layout.addWidget(precise_group)

        angle_row = QHBoxLayout()
        angle_row.addWidget(QLabel("Redressement fin (°) :"))
        self.angle_slider = QSlider(Qt.Horizontal, minimum=-450, maximum=450, value=0)
        self.angle_slider.valueChanged.connect(self._on_angle_changed)
        self.angle_label = QLabel("0.0°")
        self.angle_label.setMinimumWidth(50)
        angle_row.addWidget(self.angle_slider)
        angle_row.addWidget(self.angle_label)
        layout.addLayout(angle_row)

        note = QLabel("ℹ️ Faites glisser les coins bleus pour recadrer, ou l'intérieur pour "
                      "déplacer la zone. Pour un cadrage au pixel près, utilisez les champs "
                      "numériques ci-dessus, ou les flèches du clavier (1 px, 10 px avec "
                      "Majuscule) après avoir cliqué dans l'aperçu. Le redressement pivote "
                      "l'image entière (utile pour aligner un horizon).")
        note.setWordWrap(True)
        layout.addWidget(note)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    @staticmethod
    def _wrap(inner_layout) -> QWidget:
        w = QWidget()
        w.setLayout(inner_layout)
        return w

    def _sync_spins_from_canvas(self):
        """Reflète la sélection actuelle du canvas (souris/flèches/ratio)
        dans les champs numériques, sans redéclencher de boucle."""
        if self._syncing:
            return
        self._syncing = True
        try:
            iw, ih = self.canvas.get_image_size()
            l, t, r, b = self.canvas.get_rect()
            self.spin_x.setMaximum(max(1, iw))
            self.spin_y.setMaximum(max(1, ih))
            self.spin_w.setMaximum(max(1, iw))
            self.spin_h.setMaximum(max(1, ih))
            self.spin_x.setValue(int(round(l * iw)))
            self.spin_y.setValue(int(round(t * ih)))
            self.spin_w.setValue(max(1, int(round((r - l) * iw))))
            self.spin_h.setValue(max(1, int(round((b - t) * ih))))
            self.lbl_image_size.setText(f"{iw} × {ih} px")
        finally:
            self._syncing = False

    def _sync_canvas_from_spins(self, *_):
        """Applique les valeurs numériques (px exacts) au canvas — le moyen
        le plus précis d'obtenir un cadrage exact, indépendant de la
        résolution d'affichage de l'aperçu."""
        if self._syncing:
            return
        self._syncing = True
        try:
            iw, ih = self.canvas.get_image_size()
            x = min(self.spin_x.value(), max(0, iw - 1))
            y = min(self.spin_y.value(), max(0, ih - 1))
            w = max(1, min(self.spin_w.value(), iw - x))
            h = max(1, min(self.spin_h.value(), ih - y))
            rect = (x / iw, y / ih, (x + w) / iw, (y + h) / ih)
            self.canvas.set_rect(rect)
        finally:
            self._syncing = False

    def _on_angle_changed(self, value: int):
        self._angle = value / 10.0
        self.angle_label.setText(f"{self._angle:.1f}°")
        self._refresh_rotated_image()

    def _refresh_rotated_image(self):
        if self._angle:
            rotated = self._base_image.rotate(-self._angle, expand=True,
                                               resample=Image.Resampling.BICUBIC,
                                               fillcolor=(255, 255, 255))
        else:
            rotated = self._base_image
        self.canvas.set_image(rotated)
        self._sync_spins_from_canvas()

    def get_edits(self) -> ImageEdits:
        l, t, r, b = self.canvas.get_rect()
        crop_rect = None if (l <= 0.001 and t <= 0.001 and r >= 0.999 and b >= 0.999) else (l, t, r, b)
        return ImageEdits(straighten_angle=self._angle, crop_rect=crop_rect)


class PositionScaleDialog(QDialog):
    """Repositionne / redimensionne le produit sur le canevas final, APRÈS
    suppression du fond. C'est le seul réglage qui a un effet visible sur le
    cadrage final une fois « Supprimer le fond (IA) » activé : le recadrage
    classique (CropStraightenDialog) n'agit que sur la photo SOURCE, qui est
    ensuite automatiquement re-recentrée sur la silhouette détectée du
    produit — d'où l'impression que le recadrage « ne sert à rien »."""

    def __init__(self, source_image: Image.Image, config: ProcessingConfig,
                 existing: Optional[ImageEdits], parent=None):
        super().__init__(parent)
        self.setWindowTitle("🎯 Position & taille sur le canevas")
        self.resize(600, 700)
        self._source_image = source_image.convert("RGB")
        self._config = config
        self._offset_x = existing.canvas_offset_x if existing else 0.0
        self._offset_y = existing.canvas_offset_y if existing else 0.0
        self._scale = existing.canvas_scale if existing else 1.0
        self._build_ui()
        self._refresh_preview()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        note = QLabel(
            "ℹ️ Après suppression du fond, le produit est automatiquement recentré sur sa "
            "silhouette : le recadrage classique n'a alors plus d'effet visible sur le résultat "
            "final. Utilisez les curseurs ci-dessous pour ajuster précisément sa position et sa "
            "taille sur le canevas — c'est l'outil à utiliser si une image traitée paraît mal cadrée."
        )
        note.setWordWrap(True)
        layout.addWidget(note)

        self.preview_label = QLabel("Génération de l'aperçu…")
        self.preview_label.setAlignment(Qt.AlignCenter)
        self.preview_label.setMinimumHeight(360)
        self.preview_label.setStyleSheet("background-color: #141518; border: 1px solid #3a3b42;")
        layout.addWidget(self.preview_label, stretch=1)

        form = QFormLayout()
        self.offset_x_slider = QSlider(Qt.Horizontal, minimum=-45, maximum=45, value=int(self._offset_x * 100))
        self.offset_x_slider.valueChanged.connect(self._on_slider_changed)
        form.addRow("Position horizontale", self.offset_x_slider)
        self.offset_y_slider = QSlider(Qt.Horizontal, minimum=-45, maximum=45, value=int(self._offset_y * 100))
        self.offset_y_slider.valueChanged.connect(self._on_slider_changed)
        form.addRow("Position verticale", self.offset_y_slider)
        self.scale_slider = QSlider(Qt.Horizontal, minimum=30, maximum=200, value=int(self._scale * 100))
        self.scale_slider.valueChanged.connect(self._on_slider_changed)
        form.addRow("Taille du produit (%)", self.scale_slider)
        layout.addLayout(form)

        btn_row = QHBoxLayout()
        self.btn_refresh = QPushButton("🔄 Actualiser l'aperçu")
        self.btn_refresh.clicked.connect(self._refresh_preview)
        self.btn_reset = QPushButton("↺ Réinitialiser")
        self.btn_reset.clicked.connect(self._reset)
        btn_row.addWidget(self.btn_refresh)
        btn_row.addWidget(self.btn_reset)
        layout.addLayout(btn_row)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _on_slider_changed(self, *_):
        self._offset_x = self.offset_x_slider.value() / 100.0
        self._offset_y = self.offset_y_slider.value() / 100.0
        self._scale = self.scale_slider.value() / 100.0

    def _reset(self):
        self.offset_x_slider.setValue(0)
        self.offset_y_slider.setValue(0)
        self.scale_slider.setValue(100)
        self._refresh_preview()

    def _refresh_preview(self):
        self._on_slider_changed()
        self.preview_label.setText("Génération de l'aperçu…")
        QApplication.processEvents()
        try:
            preview_cfg = ProcessingConfig.from_dict(asdict(self._config))
            # Canevas réduit pour un aperçu rapide même avec suppression de fond IA active.
            max_side = 480
            w, h = preview_cfg.canvas_size
            ratio = max_side / max(w, h) if max(w, h) else 1.0
            preview_cfg.canvas_size = (max(50, int(w * ratio)), max(50, int(h * ratio)))
            pipeline = EcommercePipeline(preview_cfg)
            result = pipeline.process_image(
                self._source_image, position=(self._offset_x, self._offset_y, self._scale)
            )
            self.preview_label.setPixmap(pil_to_pixmap(result, max_size=460))
        except Exception as exc:  # noqa: BLE001
            self.preview_label.setText(f"Aperçu indisponible :\n{exc}")

    def get_edits_update(self, existing: Optional[ImageEdits]) -> ImageEdits:
        """Fusionne le nouveau réglage position/taille avec les autres
        retouches déjà enregistrées pour cette image (les préserve)."""
        base = existing or ImageEdits()
        return ImageEdits(
            straighten_angle=base.straighten_angle, crop_rect=base.crop_rect,
            heal_spots=list(base.heal_spots), clone_ops=[dict(o) for o in base.clone_ops],
            redeye_points=list(base.redeye_points),
            canvas_offset_x=self._offset_x, canvas_offset_y=self._offset_y, canvas_scale=self._scale,
        )


class RetouchCanvas(QWidget):
    """Zone interactive de retouche localisée : anti-tache, tampon de
    duplication et réduction des yeux rouges, avec aperçu en direct
    (travaille sur une copie réduite de l'image pour rester fluide)."""

    changed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(420, 420)
        self.setMouseTracking(True)
        self._pixmap: Optional[QPixmap] = None
        self._working: Optional[Image.Image] = None
        self.tool: str = "Anti-tache"
        self.brush_radius_norm: float = 0.02
        self.heal_spots: list[tuple[float, float, float]] = []
        self.clone_ops: list[dict] = []
        self.redeye_points: list[tuple[float, float, float]] = []
        self._clone_source_norm: Optional[tuple[float, float]] = None
        self._dragging = False
        self._current_stroke: list[tuple[float, float]] = []
        self._undo_stack: list[tuple] = []

    def set_base_image(self, img: Image.Image, existing: Optional[ImageEdits]):
        base = img.convert("RGB").copy()
        base.thumbnail((900, 900), Image.Resampling.LANCZOS)
        self._working = base
        self.heal_spots = list(existing.heal_spots) if existing else []
        self.clone_ops = [dict(op) for op in existing.clone_ops] if existing else []
        self.redeye_points = list(existing.redeye_points) if existing else []
        diag = self._diag()
        for (nx, ny, nr) in self.heal_spots:
            self._working = apply_heal_spot(self._working, int(nx * self._working.width),
                                             int(ny * self._working.height), max(2, int(nr * diag)))
        for op in self.clone_ops:
            src = op.get("src")
            points = op.get("points") or []
            nr = op.get("radius", 0.02)
            if src and points:
                src_xy = (int(src[0] * self._working.width), int(src[1] * self._working.height))
                dest_points = [(int(px * self._working.width), int(py * self._working.height)) for px, py in points]
                self._working = apply_clone_stroke(self._working, src_xy, dest_points, max(2, int(nr * diag)))
        for (nx, ny, nr) in self.redeye_points:
            self._working = apply_redeye_reduction(self._working, int(nx * self._working.width),
                                                     int(ny * self._working.height), max(2, int(nr * diag)))
        self._undo_stack = []
        self._update_pixmap()

    def _diag(self) -> float:
        if self._working is None:
            return 1.0
        return math.hypot(self._working.width, self._working.height)

    def _update_pixmap(self):
        if self._working is not None:
            self._pixmap = pil_to_pixmap(self._working, max_size=900)
        self.update()

    def _image_rect(self) -> QRect:
        if self._pixmap is None:
            return self.rect()
        scaled = self._pixmap.size().scaled(self.size(), Qt.KeepAspectRatio)
        x = (self.width() - scaled.width()) // 2
        y = (self.height() - scaled.height()) // 2
        return QRect(x, y, scaled.width(), scaled.height())

    def _pos_to_norm(self, pos) -> Optional[tuple[float, float]]:
        ir = self._image_rect()
        if ir.width() <= 0 or ir.height() <= 0 or not ir.contains(pos):
            return None
        nx = (pos.x() - ir.left()) / ir.width()
        ny = (pos.y() - ir.top()) / ir.height()
        return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))

    def _push_undo(self):
        if self._working is None:
            return
        self._undo_stack.append((self._working.copy(), list(self.heal_spots),
                                  [dict(o) for o in self.clone_ops], list(self.redeye_points)))
        if len(self._undo_stack) > 20:
            self._undo_stack.pop(0)

    def undo(self):
        if not self._undo_stack:
            return
        self._working, self.heal_spots, self.clone_ops, self.redeye_points = self._undo_stack.pop()
        self._update_pixmap()
        self.changed.emit()

    def mousePressEvent(self, event):
        norm = self._pos_to_norm(event.pos())
        if norm is None or self._working is None:
            return
        if self.tool == "Tampon" and (event.modifiers() & Qt.ControlModifier):
            self._clone_source_norm = norm
            self.update()
            return
        if self.tool == "Anti-tache":
            self._push_undo()
            nx, ny = norm
            r = max(2, int(self.brush_radius_norm * self._diag()))
            self._working = apply_heal_spot(self._working, int(nx * self._working.width),
                                             int(ny * self._working.height), r)
            self.heal_spots.append((nx, ny, self.brush_radius_norm))
            self._update_pixmap()
            self.changed.emit()
        elif self.tool == "Yeux rouges":
            self._push_undo()
            nx, ny = norm
            r = max(2, int(self.brush_radius_norm * self._diag()))
            self._working = apply_redeye_reduction(self._working, int(nx * self._working.width),
                                                     int(ny * self._working.height), r)
            self.redeye_points.append((nx, ny, self.brush_radius_norm))
            self._update_pixmap()
            self.changed.emit()
        elif self.tool == "Tampon" and self._clone_source_norm is not None:
            self._dragging = True
            self._current_stroke = [norm]

    def mouseMoveEvent(self, event):
        if self.tool == "Tampon" and self._dragging:
            norm = self._pos_to_norm(event.pos())
            if norm is not None:
                self._current_stroke.append(norm)
        self.update()

    def mouseReleaseEvent(self, event):
        if self.tool == "Tampon" and self._dragging:
            self._dragging = False
            if self._current_stroke and self._clone_source_norm is not None and self._working is not None:
                self._push_undo()
                r_norm = self.brush_radius_norm
                r = max(2, int(r_norm * self._diag()))
                src_xy = (int(self._clone_source_norm[0] * self._working.width),
                          int(self._clone_source_norm[1] * self._working.height))
                dest_points = [(int(px * self._working.width), int(py * self._working.height))
                               for (px, py) in self._current_stroke]
                self._working = apply_clone_stroke(self._working, src_xy, dest_points, r)
                self.clone_ops.append({"src": self._clone_source_norm, "points": list(self._current_stroke),
                                        "radius": r_norm})
                self._update_pixmap()
                self.changed.emit()
            self._current_stroke = []

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)
        painter.fillRect(self.rect(), QColor("#141518"))
        if self._pixmap is None:
            painter.setPen(QColor("#888a94"))
            painter.drawText(self.rect(), Qt.AlignCenter, "Aucune image")
            painter.end()
            return
        ir = self._image_rect()
        painter.drawPixmap(ir, self._pixmap)
        if self.tool == "Tampon" and self._clone_source_norm is not None:
            sx = ir.left() + self._clone_source_norm[0] * ir.width()
            sy = ir.top() + self._clone_source_norm[1] * ir.height()
            painter.setPen(QPen(QColor("#f2c94c"), 2))
            painter.drawLine(int(sx - 8), int(sy), int(sx + 8), int(sy))
            painter.drawLine(int(sx), int(sy - 8), int(sx), int(sy + 8))
        painter.end()


class SpotRetouchDialog(QDialog):
    """Retouche localisée : anti-tache, tampon de duplication, yeux rouges —
    avec aperçu en direct et annulation de la dernière opération."""

    def __init__(self, base_image: Image.Image, existing: Optional[ImageEdits], parent=None):
        super().__init__(parent)
        self.setWindowTitle("🩹 Retouche localisée")
        self.resize(780, 660)
        self._build_ui()
        self.canvas.set_base_image(base_image, existing)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        self.canvas = RetouchCanvas()
        layout.addWidget(self.canvas, stretch=1)

        tool_row = QHBoxLayout()
        tool_row.addWidget(QLabel("Outil :"))
        self.tool_combo = QComboBox()
        self.tool_combo.addItems(["Anti-tache", "Tampon", "Yeux rouges"])
        self.tool_combo.currentTextChanged.connect(self._on_tool_changed)
        tool_row.addWidget(self.tool_combo)

        tool_row.addWidget(QLabel("Taille du pinceau :"))
        self.brush_slider = QSlider(Qt.Horizontal, minimum=1, maximum=100, value=20)
        self.brush_slider.valueChanged.connect(self._on_brush_changed)
        tool_row.addWidget(self.brush_slider)

        self.btn_undo = QPushButton("↩️ Annuler la dernière retouche")
        self.btn_undo.clicked.connect(self.canvas.undo)
        tool_row.addWidget(self.btn_undo)
        layout.addLayout(tool_row)

        note = QLabel(
            "ℹ️ Anti-tache : cliquez sur une imperfection à effacer. Tampon : Ctrl+clic pour "
            "définir la source à dupliquer, puis cliquez-glissez pour peindre. "
            "Yeux rouges : cliquez sur la pupille rouge."
        )
        note.setWordWrap(True)
        layout.addWidget(note)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self._on_tool_changed(self.tool_combo.currentText())
        self._on_brush_changed(self.brush_slider.value())

    def _on_tool_changed(self, name: str):
        self.canvas.tool = name

    def _on_brush_changed(self, value: int):
        self.canvas.brush_radius_norm = value / 1000.0

    def get_edits(self) -> ImageEdits:
        return ImageEdits(
            heal_spots=list(self.canvas.heal_spots),
            clone_ops=[dict(op) for op in self.canvas.clone_ops],
            redeye_points=list(self.canvas.redeye_points),
        )


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Studio E-commerce Pro+ AI — NEXUS Market")
        self.resize(1400, 860)

        self.settings = QSettings("EcommerceStudio", "ProPlusAI")
        self.image_queue: list[Path] = []
        self.results: dict[str, BatchResult] = {}
        self.list_items_by_path: dict[str, QListWidgetItem] = {}
        self.manager: Optional[BatchManager] = None

        # Rotation rapide par image (angle en degrés, sens horaire), appliquée avant traitement
        self.rotations: dict[str, int] = {}

        # Retouches manuelles par image : recadrage, redressement fin, anti-tache,
        # tampon de duplication, yeux rouges — appliquées avant le pipeline principal.
        self.image_edits: dict[str, ImageEdits] = {}

        # Historique global annuler/rétablir (rotation + retouches manuelles),
        # pas seulement dans les dialogues de retouche — chaque entrée est
        # (path_str, ancienne_rotation, ancien_ImageEdits_ou_None).
        self._undo_stack: list[tuple[str, int, Optional[ImageEdits]]] = []
        self._redo_stack: list[tuple[str, int, Optional[ImageEdits]]] = []
        self._max_history = 50

        # État de l'export multi-plateformes (traite plusieurs presets en une seule action)
        self._multi_export_queue: list[tuple[str, ProcessingConfig]] = []
        self._multi_export_dir: Optional[Path] = None
        self._multi_export_mode: bool = False
        self._multi_export_report: list[str] = []
        self._current_multi_name: Optional[str] = None

        # Uploads manuels vers NEXUS Market (indépendants du traitement par lot)
        self._upload_signals = UploadSignals()
        self._upload_signals.done.connect(self._on_upload_done)
        self._upload_signals.error.connect(self._on_upload_error)
        self._bulk_upload_pending: Optional[int] = None
        self._bulk_upload_success = 0
        self._bulk_upload_failed = 0

        # Régénération manuelle de fiche IA (retry indépendant de l'upload)
        self._aitag_signals = AITagSignals()
        self._aitag_signals.done.connect(self._on_aitag_done)
        self._aitag_signals.error.connect(self._on_aitag_error)

        # Nouvelle tentative groupée (fiches IA + uploads en échec)
        self._retry_pending: Optional[int] = None
        self._retry_success = 0
        self._retry_failed = 0

        self._build_ui()
        self._apply_dark_theme()
        self._build_shortcuts()
        self._load_window_settings()

    # ------------------------------------------------------------------
    def _build_ui(self):
        central = QWidget()
        root_layout = QHBoxLayout(central)

        # La fenêtre entière (3 colonnes : file / aperçu / réglages) est
        # enveloppée dans une zone de défilement : quand la fenêtre n'est
        # pas plein écran et devient plus étroite que le contenu (chaque
        # colonne a une taille minimale), des barres de défilement
        # apparaissent automatiquement au lieu de pousser la colonne de
        # droite (réglages) hors de la zone visible et inaccessible.
        central_scroll = QScrollArea()
        central_scroll.setWidgetResizable(True)
        central_scroll.setWidget(central)
        central_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        central_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.setCentralWidget(central_scroll)

        splitter = QSplitter(Qt.Horizontal)
        root_layout.addWidget(splitter)

        # --- Colonne gauche : file d'images ---
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.addWidget(QLabel("<b>File de traitement</b>"))

        self.list_widget = QListWidget()
        self.list_widget.setIconSize(QSize(64, 64))
        self.list_widget.setSelectionMode(QAbstractItemView.ExtendedSelection)
        self.list_widget.currentItemChanged.connect(self._on_selection_changed)
        self.list_widget.setContextMenuPolicy(Qt.CustomContextMenu)
        self.list_widget.customContextMenuRequested.connect(self._show_context_menu)
        left_layout.addWidget(self.list_widget)

        btn_row = QHBoxLayout()
        self.btn_add_files = QPushButton("➕ Images")
        self.btn_add_files.setToolTip("Ajouter des images")
        self.btn_add_files.clicked.connect(self.add_files_dialog)
        self.btn_add_folder = QPushButton("📁 Dossier")
        self.btn_add_folder.setToolTip("Ajouter un dossier")
        self.btn_add_folder.clicked.connect(self.add_folder_dialog)
        btn_row.addWidget(self.btn_add_files)
        btn_row.addWidget(self.btn_add_folder)
        left_layout.addLayout(btn_row)
        self.btn_clear = QPushButton("🗑 Vider la file")
        self.btn_clear.clicked.connect(self.clear_queue)
        left_layout.addWidget(self.btn_clear)

        splitter.addWidget(left_panel)

        # --- Colonne centrale : aperçu ---
        center_panel = QWidget()
        center_layout = QVBoxLayout(center_panel)

        side_by_side_widget = QWidget()
        images_layout = QHBoxLayout(side_by_side_widget)
        self.drop_zone = DropZoneLabel(
            "Glissez-déposez des images\nou un dossier ici\n\n(avant traitement)"
        )
        self.drop_zone.files_dropped.connect(self._on_files_dropped)
        self.lbl_result = ScaledPreviewLabel("Résultat")
        self.lbl_result.setAlignment(Qt.AlignCenter)
        self.lbl_result.setObjectName("resultZone")
        self.lbl_result.setMinimumSize(240, 240)
        images_layout.addWidget(self.drop_zone)
        images_layout.addWidget(self.lbl_result)

        self.compare_widget = CompareSliderWidget()

        self.preview_tabs = QTabWidget()
        self.preview_tabs.addTab(side_by_side_widget, "🖼 Côte à côte")
        self.preview_tabs.addTab(self.compare_widget, "🔍 Comparateur (glisser)")

        # Le Studio Collage & Étiquettes Pro est maintenant un onglet de la
        # fenêtre principale (instance unique et persistante) plutôt qu'une
        # fenêtre/dialogue séparée ouverte via exec_().
        self.collage_studio = CollageStudioWidget(parent=self)
        self.preview_tabs.addTab(self.collage_studio, "🎨 Studio Collage & Étiquettes Pro")
        self.preview_tabs.currentChanged.connect(self._on_preview_tab_changed)

        center_layout.addWidget(self.preview_tabs)

        rotate_row = QHBoxLayout()
        rotate_row.addWidget(QLabel("Rotation rapide :"))
        self.btn_rotate_left = QPushButton("↺ -90°")
        self.btn_rotate_left.clicked.connect(lambda: self._rotate_selected(-90))
        self.btn_rotate_right = QPushButton("↻ +90°")
        self.btn_rotate_right.clicked.connect(lambda: self._rotate_selected(90))
        self.lbl_rotation_status = QLabel("0°")
        self.lbl_rotation_status.setMinimumWidth(40)
        rotate_row.addWidget(self.btn_rotate_left)
        rotate_row.addWidget(self.btn_rotate_right)
        rotate_row.addWidget(self.lbl_rotation_status)
        rotate_row.addStretch()
        center_layout.addLayout(rotate_row)

        edit_row1 = QHBoxLayout()
        self.btn_crop_straighten = QPushButton("✂️ Recadrer / redresser…")
        self.btn_crop_straighten.clicked.connect(self._open_crop_straighten_dialog)
        self.btn_position_scale = QPushButton("🎯 Position & taille…")
        self.btn_position_scale.setToolTip(
            "Corrige le cadrage du résultat final (après suppression du fond) — "
            "à utiliser si l'image traitée paraît mal cadrée malgré le recadrage."
        )
        self.btn_position_scale.clicked.connect(self._open_position_scale_dialog)
        edit_row1.addWidget(self.btn_crop_straighten)
        edit_row1.addWidget(self.btn_position_scale)
        edit_row1.addStretch()
        center_layout.addLayout(edit_row1)

        edit_row2 = QHBoxLayout()
        self.btn_spot_retouch = QPushButton("🩹 Retouche localisée…")
        self.btn_spot_retouch.clicked.connect(self._open_spot_retouch_dialog)
        self.btn_quick_diagnostic = QPushButton("🩺 Diagnostic qualité")
        self.btn_quick_diagnostic.setToolTip(
            "Analyse l'image sélectionnée (flou, exposition) et propose "
            "d'activer la retouche automatique IA si un problème est détecté."
        )
        self.btn_quick_diagnostic.clicked.connect(self._run_quick_diagnostic)
        edit_row2.addWidget(self.btn_spot_retouch)
        edit_row2.addWidget(self.btn_quick_diagnostic)
        edit_row2.addStretch()
        center_layout.addLayout(edit_row2)

        # --- Fiche produit IA + lien NEXUS Market ---
        ai_panel_group = QGroupBox("🤖 Fiche produit IA & lien NEXUS Market")
        ai_panel_layout = QFormLayout(ai_panel_group)

        self.ai_title_edit = QLineEdit()
        self.ai_title_edit.setReadOnly(True)
        ai_panel_layout.addRow("Titre suggéré", self.ai_title_edit)

        self.ai_desc_edit = QTextEdit()
        self.ai_desc_edit.setReadOnly(True)
        self.ai_desc_edit.setMaximumHeight(55)
        ai_panel_layout.addRow("Description", self.ai_desc_edit)

        self.ai_meta_label = QLabel("—")
        self.ai_meta_label.setWordWrap(True)
        ai_panel_layout.addRow("Catégorie / Tags", self.ai_meta_label)

        link_row = QHBoxLayout()
        self.supabase_link_edit = QLineEdit()
        self.supabase_link_edit.setReadOnly(True)
        self.btn_copy_link = QPushButton("📋 Copier")
        self.btn_copy_link.clicked.connect(self._copy_supabase_link)
        link_row.addWidget(self.supabase_link_edit)
        link_row.addWidget(self.btn_copy_link)
        ai_panel_layout.addRow("Lien NEXUS Market", link_row)

        self.btn_upload_selected = QPushButton("📤 Uploader la sélection")
        self.btn_upload_selected.setToolTip("Uploader la sélection vers NEXUS Market")
        self.btn_upload_selected.clicked.connect(self.upload_selected_to_nexus)
        ai_panel_layout.addRow(self.btn_upload_selected)

        center_layout.addWidget(ai_panel_group)

        action_row1 = QHBoxLayout()
        self.btn_process_selected = QPushButton("✨ Traiter la sélection")
        self.btn_process_selected.clicked.connect(self.process_selected)
        self.btn_process_all = QPushButton("⚡ Traiter tout le lot")
        self.btn_process_all.clicked.connect(self.process_all)
        action_row1.addWidget(self.btn_process_selected)
        action_row1.addWidget(self.btn_process_all)
        action_row1.addStretch()
        center_layout.addLayout(action_row1)

        action_row2 = QHBoxLayout()
        self.btn_retry_failed = QPushButton("🔁 Réessayer les échecs")
        self.btn_retry_failed.clicked.connect(self.retry_failed)
        self.btn_cancel = QPushButton("⏹ Annuler")
        self.btn_cancel.setEnabled(False)
        self.btn_cancel.clicked.connect(self.cancel_processing)
        action_row2.addWidget(self.btn_retry_failed)
        action_row2.addWidget(self.btn_cancel)
        action_row2.addStretch()
        center_layout.addLayout(action_row2)

        # Envoie la/les photo(s) sélectionnée(s) déjà traitée(s) avec succès
        # vers l'onglet Studio Collage (erreur si aucune n'est traitée).
        self.btn_send_to_collage = QPushButton("🎨 Envoyer vers le Studio Collage")
        self.btn_send_to_collage.setToolTip("Envoyer le résultat sélectionné vers le Studio Collage")
        self.btn_send_to_collage.clicked.connect(self._send_selected_result_to_collage)
        center_layout.addWidget(self.btn_send_to_collage)

        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        center_layout.addWidget(self.progress_bar)

        export_row1 = QHBoxLayout()
        self.btn_export = QPushButton("💾 Exporter les résultats…")
        self.btn_export.clicked.connect(self.export_results)
        self.btn_multi_export = QPushButton("🚀 Export multi-plateformes…")
        self.btn_multi_export.clicked.connect(self.multi_platform_export)
        export_row1.addWidget(self.btn_export)
        export_row1.addWidget(self.btn_multi_export)
        export_row1.addStretch()
        center_layout.addLayout(export_row1)

        export_row2 = QHBoxLayout()
        self.btn_contact_sheet = QPushButton("🖼 Planche de contact…")
        self.btn_contact_sheet.setToolTip(
            "Génère une image récapitulative avant/après de tout le lot traité."
        )
        self.btn_contact_sheet.clicked.connect(self.export_contact_sheet)
        self.btn_carousel = QPushButton("🎠 Créer un carrousel…")
        self.btn_carousel.setToolTip(
            "Assemble une sélection ordonnée d'images traitées en carrousel\n"
            "numéroté, prêt à publier (Instagram, Facebook…)."
        )
        self.btn_carousel.clicked.connect(self.open_carousel_dialog)
        export_row2.addWidget(self.btn_contact_sheet)
        export_row2.addWidget(self.btn_carousel)
        export_row2.addStretch()
        center_layout.addLayout(export_row2)

        nexus_row1 = QHBoxLayout()
        self.btn_upload_all = QPushButton("🚀 Uploader tout le lot")
        self.btn_upload_all.setToolTip("Uploader tout le lot vers NEXUS Market")
        self.btn_upload_all.clicked.connect(self.upload_all_to_nexus)
        self.btn_retry_ai_upload = QPushButton("🔁 Réessayer IA / upload")
        self.btn_retry_ai_upload.setToolTip("Réessayer les fiches IA / uploads en échec")
        self.btn_retry_ai_upload.clicked.connect(self.retry_failed_ai_and_uploads)
        nexus_row1.addWidget(self.btn_upload_all)
        nexus_row1.addWidget(self.btn_retry_ai_upload)
        nexus_row1.addStretch()
        center_layout.addLayout(nexus_row1)

        self.btn_export_manifest = QPushButton("🧾 Exporter le manifeste JSON")
        self.btn_export_manifest.clicked.connect(self.export_ai_manifest)
        center_layout.addWidget(self.btn_export_manifest)

        self.log_view = QTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setMaximumHeight(140)
        center_layout.addWidget(QLabel("Journal d'activité"))
        center_layout.addWidget(self.log_view)

        splitter.addWidget(center_panel)

        # --- Colonne droite : réglages (avec défilement si l'espace manque) ---
        self.settings_panel = SettingsPanel()
        self.settings_panel.setMinimumWidth(260)
        settings_scroll = QScrollArea()
        settings_scroll.setWidgetResizable(True)
        settings_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        settings_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        settings_scroll.setWidget(self.settings_panel)
        splitter.addWidget(settings_scroll)

        splitter.setSizes([260, 640, 340])

        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("Prêt.")

        self._build_toolbar()

    def _build_toolbar(self):
        toolbar = QToolBar("Actions")
        self.addToolBar(toolbar)

        # Gestion de projet (v9.0) : reprendre un lot (file + réglages) plus
        # tard exactement où on l'a laissé, sans tout ressaisir.
        save_project_action = QAction("💾 Enregistrer le projet…", self)
        save_project_action.triggered.connect(self._save_project_dialog)
        toolbar.addAction(save_project_action)

        open_project_action = QAction("📂 Ouvrir un projet…", self)
        open_project_action.triggered.connect(self._open_project_dialog)
        toolbar.addAction(open_project_action)

        toolbar.addSeparator()

        # Bascule directement vers l'onglet Studio Collage depuis la toolbar,
        # sans passer par les onglets du panneau central.
        collage_action = QAction("🎨 Studio Collage & Étiquettes Pro", self)
        collage_action.triggered.connect(self._open_collage_studio)
        toolbar.addAction(collage_action)

        about_action = QAction("À propos", self)
        about_action.triggered.connect(self._show_about)
        toolbar.addAction(about_action)

    def _save_project_dialog(self):
        """Enregistre la file d'images en cours + les réglages complets dans
        un fichier .nexusproj.json, pour reprendre le lot plus tard (v9.0)."""
        if not self.image_queue:
            QMessageBox.information(self, "File vide", "Ajoutez d'abord des images avant d'enregistrer un projet.")
            return
        save_path, _ = QFileDialog.getSaveFileName(
            self, "Enregistrer le projet", "mon_projet.nexusproj.json", PROJECT_FILE_FILTER
        )
        if not save_path:
            return
        if not save_path.endswith(".json"):
            save_path += ".nexusproj.json"
        try:
            config = self.settings_panel.get_config()
            save_project_file(Path(save_path), self.image_queue, config)
            self._log(f"💾 Projet enregistré : {save_path}")
            QMessageBox.information(self, "Projet enregistré", f"Projet enregistré :\n{save_path}")
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Erreur", f"Impossible d'enregistrer le projet :\n{exc}")

    def _open_project_dialog(self):
        """Ouvre un projet .nexusproj.json : recharge la file d'images (celles
        encore présentes sur le disque) et les réglages complets (v9.0)."""
        open_path, _ = QFileDialog.getOpenFileName(
            self, "Ouvrir un projet", "", PROJECT_FILE_FILTER
        )
        if not open_path:
            return
        try:
            image_paths, config, _notes = load_project_file(Path(open_path))
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Erreur", f"Impossible d'ouvrir ce projet :\n{exc}")
            return

        existing = [p for p in image_paths if p.exists()]
        missing = [p for p in image_paths if not p.exists()]

        if self.image_queue:
            reply = QMessageBox.question(
                self, "Ouvrir un projet",
                "Vider la file actuelle avant de charger ce projet ?",
                QMessageBox.Yes | QMessageBox.No, QMessageBox.Yes,
            )
            if reply == QMessageBox.Yes:
                self.clear_queue()

        if existing:
            self._enqueue_paths(existing)
        self.settings_panel.apply_config(config)
        self._log(f"📂 Projet ouvert : {open_path} ({len(existing)} image(s) retrouvée(s)).")
        if missing:
            QMessageBox.warning(
                self, "Certaines images sont introuvables",
                f"{len(missing)} image(s) de ce projet n'ont pas été retrouvées sur le disque "
                "et ont été ignorées."
            )

    def _collage_available_results(self) -> list[tuple[str, str, Image.Image]]:
        """Liste des photos déjà traitées du lot en cours, proposables dans
        le Studio Collage (bouton « Depuis les photos déjà traitées… »).
        Chaque entrée (chemin d'origine, libellé, image) : le chemin sert de
        clé pour reconnaître « c'est la même photo » d'un sync à l'autre."""
        return [
            (path_str, Path(path_str).name, result.image)
            for path_str, result in self.results.items()
            if result.image is not None
        ]

    def _on_preview_tab_changed(self, index: int):
        """Dès qu'on arrive sur l'onglet Studio Collage (clic direct sur
        l'onglet ou via le bouton toolbar), synchronise automatiquement
        l'image actuellement sélectionnée dans le panneau principal — en
        utilisant sa version déjà traitée si elle existe. Comme le sync se
        fait par clé (le chemin), on continue à retravailler la même image
        (recadrage, retouche, traitement IA...) au lieu d'avoir à la charger
        séparément dans le collage."""
        if self.preview_tabs.widget(index) is not self.collage_studio:
            return
        self.collage_studio.set_available_results(self._collage_available_results())
        selected_paths = [item.data(Qt.UserRole) for item in self.list_widget.selectedItems()]
        if not selected_paths:
            current = self.list_widget.currentItem()
            if current:
                selected_paths = [current.data(Qt.UserRole)]
        for p in selected_paths:
            if p in self.results and self.results[p].image is not None:
                self.collage_studio.sync_image(p, f"✓ {Path(p).name}", self.results[p].image)
            else:
                self.collage_studio.sync_image(p, Path(p).name, Path(p))
        if selected_paths:
            noms = ", ".join(Path(p).name for p in selected_paths[:3])
            suffixe = "…" if len(selected_paths) > 3 else ""
            self.status_bar.showMessage(f"Studio Collage synchronisé avec : {noms}{suffixe}", 3000)

    def _open_collage_studio(self):
        """Bascule vers l'onglet Studio Collage & Étiquettes Pro. La première
        fois (onglet encore vide) et si rien n'est sélectionné, pré-remplit
        avec tout le lot en cours ; sinon la synchronisation automatique de
        l'onglet (_on_preview_tab_changed) prend le relais dès l'affichage."""
        if not self.collage_studio.image_sources and not self.list_widget.selectedItems():
            self.collage_studio.load_paths(list(self.image_queue))
        self.preview_tabs.setCurrentWidget(self.collage_studio)

    def _send_selected_result_to_collage(self):
        """Envoie directement la/les photo(s) déjà traitée(s) et sélectionnée(s)
        vers l'onglet Studio Collage & Étiquettes Pro (sans effacer le travail
        déjà en cours) et les tient synchronisées avec la même image (clé =
        chemin d'origine) : la retraiter puis la renvoyer met juste à jour
        l'entrée existante au lieu d'en créer une copie."""
        selected_paths = [item.data(Qt.UserRole) for item in self.list_widget.selectedItems()]
        if not selected_paths:
            current = self.list_widget.currentItem()
            if current:
                selected_paths = [current.data(Qt.UserRole)]
        processed = [
            (p, Path(p).name, self.results[p].image)
            for p in selected_paths
            if p in self.results and self.results[p].image is not None
        ]
        if not processed:
            QMessageBox.information(
                self, "Aucun résultat disponible",
                "Sélectionnez au moins une image déjà traitée avec succès (bouton "
                "« ✨ Traiter la sélection » ou « ⚡ Traiter tout le lot » d'abord)."
            )
            return
        self.collage_studio.set_available_results(self._collage_available_results())
        for key, label, img in processed:
            self.collage_studio.sync_image(key, f"✓ {label}", img)
        self.preview_tabs.setCurrentWidget(self.collage_studio)

    def _build_shortcuts(self):
        QShortcut(QKeySequence("Ctrl+O"), self, activated=self.add_files_dialog)
        QShortcut(QKeySequence("Ctrl+S"), self, activated=self.export_results)
        QShortcut(QKeySequence("Delete"), self, activated=self._remove_selected_item)
        QShortcut(QKeySequence("Ctrl+Return"), self, activated=self.process_all)
        QShortcut(QKeySequence("Ctrl+Z"), self, activated=self._undo_edit)
        QShortcut(QKeySequence("Ctrl+Shift+Z"), self, activated=self._redo_edit)
        QShortcut(QKeySequence("Ctrl+Y"), self, activated=self._redo_edit)

    def _apply_dark_theme(self):
        self.setStyleSheet("""
            QMainWindow, QWidget { background-color: #1e1f24; color: #e8e8e8; }
            QGroupBox {
                border: 1px solid #3a3b42; border-radius: 6px; margin-top: 10px;
                padding-top: 10px; font-weight: bold;
            }
            QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; }
            QPushButton {
                background-color: #2f80ed; color: white; border: none;
                border-radius: 5px; padding: 8px 14px; font-weight: 600;
            }
            QPushButton:hover { background-color: #3b8ef0; }
            QPushButton:disabled { background-color: #444752; color: #888; }
            QListWidget, QTextEdit, QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox {
                background-color: #2a2b31; border: 1px solid #3a3b42; border-radius: 4px;
                padding: 4px; color: #e8e8e8;
            }
            #dropZone {
                border: 2px dashed #555; border-radius: 8px; background-color: #26272d;
            }
            #resultZone {
                border: 2px solid #3a3b42; border-radius: 8px; background-color: #ffffff;
            }
            #compareWidget {
                border: 2px solid #3a3b42; border-radius: 8px;
            }
            QTabWidget::pane { border: 1px solid #3a3b42; border-radius: 6px; }
            QTabBar::tab {
                background-color: #2a2b31; color: #e8e8e8; padding: 6px 12px;
                border-top-left-radius: 4px; border-top-right-radius: 4px;
            }
            QTabBar::tab:selected { background-color: #2f80ed; color: white; }
            QProgressBar {
                border: 1px solid #3a3b42; border-radius: 4px; text-align: center;
                background-color: #2a2b31;
            }
            QProgressBar::chunk { background-color: #2f80ed; border-radius: 4px; }
        """)

    # ------------------------------------------------------------------
    # Persistance de la fenêtre / réglages
    # ------------------------------------------------------------------
    def _load_window_settings(self):
        self.settings_panel.load_from_qsettings(self.settings)
        geometry = self.settings.value("window_geometry", None)
        if geometry:
            self.restoreGeometry(geometry)

    def closeEvent(self, event):
        self.settings_panel.save_to_qsettings(self.settings)
        self.settings.setValue("window_geometry", self.saveGeometry())
        if self.manager is not None:
            self.manager.cancel()
        super().closeEvent(event)

    # ------------------------------------------------------------------
    # Gestion de la file d'images
    # ------------------------------------------------------------------
    def add_files_dialog(self):
        files, _ = QFileDialog.getOpenFileNames(
            self, "Choisir des images", "", "Images (*.png *.jpg *.jpeg *.webp *.bmp *.tiff)"
        )
        if files:
            self._enqueue_paths([Path(f) for f in files])

    def add_folder_dialog(self):
        folder = QFileDialog.getExistingDirectory(self, "Choisir un dossier d'images")
        if folder:
            self._enqueue_paths([Path(folder)])

    def _on_files_dropped(self, paths: list[Path]):
        self._enqueue_paths(paths)

    def _enqueue_paths(self, paths: list[Path]):
        new_images = collect_image_paths(paths)
        if not new_images:
            QMessageBox.warning(self, "Aucune image", "Aucun fichier image valide n'a été trouvé.")
            return
        for path in new_images:
            if path in self.image_queue:
                continue
            self.image_queue.append(path)
            item = QListWidgetItem(path.name)
            item.setData(Qt.UserRole, str(path))
            item.setIcon(get_status_icon("pending"))
            try:
                with Image.open(path) as im:
                    im.thumbnail((64, 64))
            except Exception:
                pass
            self.list_widget.addItem(item)
            self.list_items_by_path[str(path)] = item
        self._log(f"{len(new_images)} image(s) ajoutée(s) à la file.")
        self.status_bar.showMessage(f"{len(self.image_queue)} image(s) en file d'attente.")
        self._refresh_dashboard()

    def _refresh_dashboard(self):
        """Met à jour le tableau de bord de l'onglet Accueil (v9.0) : nombre
        d'images en attente / réussies / en échec, à partir de l'état actuel
        de la file. Centralise ce qui était auparavant dispersé entre la
        barre de statut et le journal d'activité."""
        total = len(self.image_queue)
        success = sum(1 for r in self.results.values() if r.error is None)
        failed = sum(1 for r in self.results.values() if r.error is not None)
        pending = max(0, total - success - failed)
        self.settings_panel.update_dashboard_stats(pending, success, failed)

    def clear_queue(self):
        if self.collage_studio.image_sources:
            reply = QMessageBox.question(
                self, "Nouveau lot",
                "Vider aussi le Studio Collage pour repartir sur un collage neuf "
                "avec ce nouveau lot ?\n\n"
                "Choisissez « Non » pour garder le collage en cours tel quel "
                "(par exemple s'il mélange des photos de plusieurs lots).",
                QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
            )
            if reply == QMessageBox.Yes:
                self.collage_studio.reset_collage()
        self.image_queue.clear()
        self.results.clear()
        self.rotations.clear()
        self.image_edits.clear()
        self.list_items_by_path.clear()
        self.list_widget.clear()
        self.drop_zone.clear()
        self.drop_zone.setText("Glissez-déposez des images\nou un dossier ici\n\n(avant traitement)")
        self.lbl_result.clear()
        self.lbl_result.setText("Résultat")
        self.lbl_rotation_status.setText("0°")
        self._clear_compare_widget()
        self._update_ai_panel(None)
        # Le lot vient d'être vidé : plus aucun résultat traité disponible.
        self.collage_studio.set_available_results([])
        self._log("File d'attente vidée.")
        self._refresh_dashboard()

    def _remove_selected_item(self):
        item = self.list_widget.currentItem()
        if item is None:
            return
        path_str = item.data(Qt.UserRole)
        path = Path(path_str)
        if path in self.image_queue:
            self.image_queue.remove(path)
        self.results.pop(path_str, None)
        self.rotations.pop(path_str, None)
        self.image_edits.pop(path_str, None)
        self.list_items_by_path.pop(path_str, None)
        self.list_widget.takeItem(self.list_widget.row(item))
        self._log(f"{path.name} retiré de la file.")
        self._refresh_dashboard()

    def _snapshot_state(self, path_str: str) -> tuple:
        """Capture l'état actuel (rotation + retouches) d'une image, pour la
        pile annuler/rétablir globale."""
        edits = self.image_edits.get(path_str)
        edits_copy = ImageEdits(
            straighten_angle=edits.straighten_angle, crop_rect=edits.crop_rect,
            heal_spots=list(edits.heal_spots), clone_ops=[dict(o) for o in edits.clone_ops],
            redeye_points=list(edits.redeye_points),
        ) if edits is not None else None
        return (path_str, self.rotations.get(path_str, 0), edits_copy)

    def _push_undo(self, path_str: str):
        """À appeler AVANT toute modification de rotation/retouche pour une
        image, afin de mémoriser l'état précédent dans l'historique global."""
        self._undo_stack.append(self._snapshot_state(path_str))
        if len(self._undo_stack) > self._max_history:
            self._undo_stack.pop(0)
        self._redo_stack.clear()

    def _apply_snapshot(self, snapshot: tuple):
        path_str, rotation, edits = snapshot
        if rotation:
            self.rotations[path_str] = rotation
        else:
            self.rotations.pop(path_str, None)
        if edits is not None and not edits.is_empty():
            self.image_edits[path_str] = edits
        else:
            self.image_edits.pop(path_str, None)
        item = self.list_items_by_path.get(path_str)
        if item:
            self._mark_needs_reprocessing(item, path_str)
            self.list_widget.setCurrentItem(item)
        self._refresh_preview_for_path(Path(path_str))

    def _undo_edit(self):
        """Ctrl+Z — annule la dernière rotation/retouche, quel que soit le
        dialogue dans lequel elle a été faite (historique global)."""
        if not self._undo_stack:
            self._log("Rien à annuler.")
            return
        snapshot = self._undo_stack.pop()
        self._redo_stack.append(self._snapshot_state(snapshot[0]))
        self._apply_snapshot(snapshot)
        self._log(f"↩️ Annulé : {Path(snapshot[0]).name}.")

    def _redo_edit(self):
        """Ctrl+Shift+Z / Ctrl+Y — rétablit la dernière action annulée."""
        if not self._redo_stack:
            self._log("Rien à rétablir.")
            return
        snapshot = self._redo_stack.pop()
        self._undo_stack.append(self._snapshot_state(snapshot[0]))
        self._apply_snapshot(snapshot)
        self._log(f"↪️ Rétabli : {Path(snapshot[0]).name}.")

    def _show_context_menu(self, position):
        item = self.list_widget.itemAt(position)
        if item is None:
            return
        menu = QMenu(self)
        crop_action = menu.addAction("✂️ Recadrer / redresser…")
        position_action = menu.addAction("🎯 Position & taille sur le canevas…")
        retouch_action = menu.addAction("🩹 Retouche localisée…")
        reprocess_action = menu.addAction("♻️ Retraiter cette image")
        copy_edits_action = menu.addAction("📋 Copier les réglages de retouche vers la sélection")
        collage_action = menu.addAction("🎨 Envoyer vers le Studio Collage")
        upload_action = menu.addAction("📤 Uploader vers NEXUS Market")
        remove_action = menu.addAction("🗑 Retirer de la file")
        chosen = menu.exec_(self.list_widget.mapToGlobal(position))
        if chosen == crop_action:
            self.list_widget.setCurrentItem(item)
            self._open_crop_straighten_dialog()
        elif chosen == position_action:
            self.list_widget.setCurrentItem(item)
            self._open_position_scale_dialog()
        elif chosen == retouch_action:
            self.list_widget.setCurrentItem(item)
            self._open_spot_retouch_dialog()
        elif chosen == reprocess_action:
            path = Path(item.data(Qt.UserRole))
            self._start_batch([path])
        elif chosen == copy_edits_action:
            self.list_widget.setCurrentItem(item)
            self._copy_edits_to_selection(item)
        elif chosen == collage_action:
            self._send_item_to_collage(item)
        elif chosen == upload_action:
            self._upload_item(item)
        elif chosen == remove_action:
            self.list_widget.setCurrentItem(item)
            self._remove_selected_item()

    def _send_item_to_collage(self, item: QListWidgetItem):
        """Envoie une image précise (n'importe laquelle de la file, traitée ou
        non) vers le Studio Collage, sans changer la sélection courante ni
        exiger un traitement préalable — utilise la version traitée si elle
        existe, sinon l'original."""
        key = item.data(Qt.UserRole)
        self.collage_studio.set_available_results(self._collage_available_results())
        if key in self.results and self.results[key].image is not None:
            self.collage_studio.sync_image(key, f"✓ {Path(key).name}", self.results[key].image)
        else:
            self.collage_studio.sync_image(key, Path(key).name, Path(key))
        self.preview_tabs.setCurrentWidget(self.collage_studio)
        self.status_bar.showMessage(f"Studio Collage synchronisé avec : {Path(key).name}", 3000)

    def _copy_edits_to_selection(self, source_item: QListWidgetItem):
        """Copie le recadrage/redressement + la retouche localisée (anti-tache,
        tampon, yeux rouges) de l'image `source_item` vers toutes les autres
        images actuellement sélectionnées dans la file — pratique pour
        appliquer d'un coup la même retouche à une série de photos."""
        source_path_str = source_item.data(Qt.UserRole)
        source_edits = self.image_edits.get(source_path_str)
        targets = [it for it in self.list_widget.selectedItems()
                   if it.data(Qt.UserRole) != source_path_str]
        if not targets:
            QMessageBox.information(
                self, "Sélection requise",
                "Sélectionnez aussi les images de destination (Ctrl/Shift + clic) "
                "avant de copier les réglages."
            )
            return
        if source_edits is None or source_edits.is_empty():
            QMessageBox.information(
                self, "Rien à copier",
                f"« {Path(source_path_str).name} » n'a aucune retouche localisée enregistrée."
            )
            return
        for it in targets:
            path_str = it.data(Qt.UserRole)
            self._push_undo(path_str)
            self.image_edits[path_str] = ImageEdits(
                straighten_angle=source_edits.straighten_angle,
                crop_rect=source_edits.crop_rect,
                heal_spots=list(source_edits.heal_spots),
                clone_ops=[dict(o) for o in source_edits.clone_ops],
                redeye_points=list(source_edits.redeye_points),
            )
            self._mark_needs_reprocessing(it, path_str)
        self._refresh_preview_for_path(Path(self.list_widget.currentItem().data(Qt.UserRole)))
        self._log(f"Réglages de « {Path(source_path_str).name} » copiés vers {len(targets)} image(s).")

    def _on_selection_changed(self, current: QListWidgetItem, _previous):
        if current is None:
            return
        path = Path(current.data(Qt.UserRole))
        self._refresh_preview_for_path(path)

    def _refresh_preview_for_path(self, path: Path):
        """Recharge l'aperçu (avant + après + comparateur) pour un chemin donné."""
        self.lbl_rotation_status.setText(f"{self.rotations.get(str(path), 0)}°")

        before_im: Optional[Image.Image] = None
        try:
            before_im = self._load_rotated_image(path)
            before_im = apply_image_edits(before_im, self.image_edits.get(str(path)))
            self.drop_zone.setPixmap(pil_to_pixmap(before_im, max_size=1000))
        except Exception as exc:
            self.drop_zone.setText(f"Impossible de charger l'aperçu :\n{exc}")

        result = self.results.get(str(path))
        if result and result.image is not None:
            self.lbl_result.setPixmap(pil_to_pixmap(result.image, max_size=1000))
            self._update_compare_widget(before_im, result.image)
        elif result and result.error:
            self.lbl_result.setText(f"Erreur :\n{result.error}")
            self._clear_compare_widget()
        else:
            self.lbl_result.clear()
            self.lbl_result.setText("Pas encore traité")
            self._clear_compare_widget()

        self._update_ai_panel(result)

    def _load_rotated_image(self, path: Path) -> Image.Image:
        """Ouvre l'image source et applique la rotation rapide enregistrée, le cas échéant."""
        im = Image.open(path)
        im.load()
        angle = self.rotations.get(str(path), 0)
        if angle:
            im = rotate_clockwise(im, angle)
        return im

    def _rotate_selected(self, delta: int):
        item = self.list_widget.currentItem()
        if item is None:
            QMessageBox.information(self, "Sélection requise", "Sélectionnez d'abord une image à faire pivoter.")
            return
        path_str = item.data(Qt.UserRole)
        self._push_undo(path_str)
        new_angle = (self.rotations.get(path_str, 0) + delta) % 360
        self.rotations[path_str] = new_angle

        # La source a changé : un éventuel résultat précédent n'est plus à jour.
        if path_str in self.results:
            self.results.pop(path_str, None)
            item.setIcon(get_status_icon("pending"))

        self._refresh_preview_for_path(Path(path_str))
        self._log(f"{Path(path_str).name} pivoté à {new_angle}° — retraitement nécessaire.")

    def _mark_needs_reprocessing(self, item: QListWidgetItem, path_str: str):
        if path_str in self.results:
            self.results.pop(path_str, None)
            item.setIcon(get_status_icon("pending"))

    def _open_crop_straighten_dialog(self):
        item = self.list_widget.currentItem()
        if item is None:
            QMessageBox.information(self, "Sélection requise", "Sélectionnez d'abord une image.")
            return
        path_str = item.data(Qt.UserRole)
        path = Path(path_str)
        try:
            base_img = self._load_rotated_image(path)
        except Exception as exc:  # noqa: BLE001
            QMessageBox.warning(self, "Erreur", f"Impossible de charger l'image :\n{exc}")
            return
        existing = self.image_edits.get(path_str)
        dlg = CropStraightenDialog(base_img, existing, parent=self)
        if dlg.exec_() != QDialog.Accepted:
            return
        new_edits = dlg.get_edits()
        if existing:
            new_edits.heal_spots = list(existing.heal_spots)
            new_edits.clone_ops = [dict(o) for o in existing.clone_ops]
            new_edits.redeye_points = list(existing.redeye_points)
            new_edits.canvas_offset_x = existing.canvas_offset_x
            new_edits.canvas_offset_y = existing.canvas_offset_y
            new_edits.canvas_scale = existing.canvas_scale
        self._push_undo(path_str)
        if new_edits.is_empty():
            self.image_edits.pop(path_str, None)
        else:
            self.image_edits[path_str] = new_edits
        self._mark_needs_reprocessing(item, path_str)
        self._refresh_preview_for_path(path)
        self._log(f"{path.name} : recadrage/redressement mis à jour — retraitement nécessaire.")

    def _open_position_scale_dialog(self):
        """Corrige le cadrage du résultat FINAL (après suppression du fond) —
        l'outil à utiliser quand une image traitée paraît mal cadrée alors
        que le recadrage classique n'y change rien."""
        item = self.list_widget.currentItem()
        if item is None:
            QMessageBox.information(self, "Sélection requise", "Sélectionnez d'abord une image.")
            return
        path_str = item.data(Qt.UserRole)
        path = Path(path_str)
        try:
            base_img = self._load_rotated_image(path)
        except Exception as exc:  # noqa: BLE001
            QMessageBox.warning(self, "Erreur", f"Impossible de charger l'image :\n{exc}")
            return
        existing = self.image_edits.get(path_str)
        source_edits = ImageEdits(
            straighten_angle=existing.straighten_angle if existing else 0.0,
            crop_rect=existing.crop_rect if existing else None,
        )
        base_img = apply_image_edits(base_img, source_edits)

        config = self.settings_panel.get_config()
        if config.remove_background and rembg_remove is None:
            QMessageBox.critical(
                self, "Dépendance manquante",
                "Le module 'rembg' est introuvable, l'aperçu ne pourra pas afficher la "
                "suppression du fond.\nInstallez-le avec : pip install rembg"
            )
        dlg = PositionScaleDialog(base_img, config, existing, parent=self)
        if dlg.exec_() != QDialog.Accepted:
            return
        self._push_undo(path_str)
        new_edits = dlg.get_edits_update(existing)
        if new_edits.is_empty():
            self.image_edits.pop(path_str, None)
        else:
            self.image_edits[path_str] = new_edits
        self._mark_needs_reprocessing(item, path_str)
        self._refresh_preview_for_path(path)
        self._log(f"{path.name} : position/taille sur le canevas mise à jour — retraitement nécessaire.")

    def _open_spot_retouch_dialog(self):
        item = self.list_widget.currentItem()
        if item is None:
            QMessageBox.information(self, "Sélection requise", "Sélectionnez d'abord une image.")
            return
        path_str = item.data(Qt.UserRole)
        path = Path(path_str)
        try:
            base_img = self._load_rotated_image(path)
        except Exception as exc:  # noqa: BLE001
            QMessageBox.warning(self, "Erreur", f"Impossible de charger l'image :\n{exc}")
            return
        existing = self.image_edits.get(path_str)
        if existing and (existing.straighten_angle or existing.crop_rect):
            base_img = apply_image_edits(base_img, ImageEdits(
                straighten_angle=existing.straighten_angle, crop_rect=existing.crop_rect))
        dlg = SpotRetouchDialog(base_img, existing, parent=self)
        if dlg.exec_() != QDialog.Accepted:
            return
        new_edits = dlg.get_edits()
        new_edits.straighten_angle = existing.straighten_angle if existing else 0.0
        new_edits.crop_rect = existing.crop_rect if existing else None
        if existing:
            new_edits.canvas_offset_x = existing.canvas_offset_x
            new_edits.canvas_offset_y = existing.canvas_offset_y
            new_edits.canvas_scale = existing.canvas_scale
        self._push_undo(path_str)
        if new_edits.is_empty():
            self.image_edits.pop(path_str, None)
        else:
            self.image_edits[path_str] = new_edits
        self._mark_needs_reprocessing(item, path_str)
        self._refresh_preview_for_path(path)
        self._log(f"{path.name} : retouche localisée mise à jour — retraitement nécessaire.")

    def _run_quick_diagnostic(self):
        """Diagnostic qualité à la demande (v9.0) : réutilise
        detect_blur_and_exposure sur l'image sélectionnée pour avertir
        immédiatement d'un flou/exposition problématique, sans attendre le
        dialogue de contrôle qualité pré-lot. Propose d'activer la retouche
        IA en un clic si un souci est détecté."""
        item = self.list_widget.currentItem()
        if item is None:
            QMessageBox.information(self, "Diagnostic qualité", "Sélectionnez d'abord une image dans la file.")
            return
        path = Path(item.data(Qt.UserRole))
        try:
            with Image.open(path) as im:
                im.load()
                diag = detect_blur_and_exposure(im.convert("RGB"))
        except Exception as exc:  # noqa: BLE001
            QMessageBox.warning(self, "Diagnostic qualité", f"Impossible d'analyser l'image :\n{exc}")
            return

        issues = []
        if diag["blurry"]:
            issues.append("• Photo probablement floue")
        if diag["under_exposed"]:
            issues.append("• Sous-exposée (trop sombre)")
        if diag["over_exposed"]:
            issues.append("• Surexposée (trop claire)")

        if not issues:
            QMessageBox.information(self, "Diagnostic qualité", f"✅ {path.name} — aucun problème détecté.")
            return

        message = f"⚠️ {path.name} :\n\n" + "\n".join(issues)
        message += "\n\nActiver la retouche automatique IA pour ce lot (exposition/contraste/netteté) ?"
        reply = QMessageBox.question(
            self, "Diagnostic qualité", message, QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.settings_panel.auto_enhance_checkbox.setChecked(True)
            if diag["under_exposed"] or diag["over_exposed"]:
                self.settings_panel.auto_wb_checkbox.setChecked(True)
            self._log(f"🩺 Retouche automatique IA activée suite au diagnostic de {path.name}.")

    def _update_compare_widget(self, before_img: Optional[Image.Image], after_img: Optional[Image.Image]):
        self.compare_widget.set_images(before_img, after_img)

    def _clear_compare_widget(self):
        self.compare_widget.clear()

    # ------------------------------------------------------------------
    # Fiche produit IA & upload NEXUS Market
    # ------------------------------------------------------------------
    def _update_ai_panel(self, result: Optional[BatchResult]):
        """Rafraîchit le panneau « Fiche produit IA & lien NEXUS Market »
        pour l'image actuellement sélectionnée."""
        if result is None:
            self.ai_title_edit.clear()
            self.ai_desc_edit.clear()
            self.ai_meta_label.setText("—")
            self.supabase_link_edit.clear()
            return

        self.ai_title_edit.setText(result.ai_title or "")
        self.ai_desc_edit.setPlainText(result.ai_description or "")
        cat = result.ai_category or "—"
        tags = ", ".join(result.ai_tags) if result.ai_tags else "—"
        meta_text = f"Catégorie : {cat}    •    Tags : {tags}"
        if result.ai_error:
            meta_text += f"\n⚠️ Fiche IA indisponible : {result.ai_error}"
        self.ai_meta_label.setText(meta_text)

        if result.supabase_url:
            self.supabase_link_edit.setText(result.supabase_url)
        elif result.upload_error:
            self.supabase_link_edit.setText(f"⚠️ {result.upload_error}")
        else:
            self.supabase_link_edit.clear()

    def _copy_supabase_link(self):
        text = self.supabase_link_edit.text()
        if text and not text.startswith("⚠️"):
            QApplication.clipboard().setText(text)
            self.status_bar.showMessage("Lien NEXUS Market copié dans le presse-papiers.", 3000)

    def upload_selected_to_nexus(self):
        item = self.list_widget.currentItem()
        if item is None:
            QMessageBox.information(self, "Sélection requise", "Sélectionnez d'abord une image déjà traitée.")
            return
        self._upload_item(item)

    def _upload_item(self, item: QListWidgetItem):
        path_str = item.data(Qt.UserRole)
        result = self.results.get(path_str)
        if result is None or result.image is None:
            QMessageBox.information(self, "Pas encore traité",
                                     "Traitez d'abord cette image avant de l'uploader vers NEXUS Market.")
            return

        integrations = self.settings_panel.get_integrations()
        if not integrations.supabase_url or not integrations.supabase_key:
            QMessageBox.warning(
                self, "Configuration Supabase manquante",
                "Renseignez l'URL et la clé Supabase dans le panneau de réglages\n"
                "(section « NEXUS Market — Upload »)."
            )
            return
        if requests is None:
            QMessageBox.critical(self, "Module manquant", "Installez 'requests' avec : pip install requests")
            return

        config = self.settings_panel.get_config()
        self._log(f"📤 Upload en cours vers NEXUS Market : {Path(path_str).name}…")
        self.status_bar.showMessage(f"Upload vers NEXUS Market : {Path(path_str).name}…")
        task = UploadTask(path_str, result.image, config, integrations, self._upload_signals)
        QThreadPool.globalInstance().start(task)

    def _on_upload_done(self, path_str: str, url: str):
        result = self.results.get(path_str)
        if result:
            result.supabase_url = url
            result.upload_error = None
        self._log(f"✅ Uploadé vers NEXUS Market : {url}")
        self.status_bar.showMessage("Upload NEXUS Market terminé.", 4000)
        self._refresh_item_badge(path_str)
        current = self.list_widget.currentItem()
        if current and current.data(Qt.UserRole) == path_str:
            self._update_ai_panel(result)
        self._advance_bulk_upload(success=True)
        self._advance_retry(success=True)

    def _on_upload_error(self, path_str: str, message: str):
        result = self.results.get(path_str)
        if result:
            result.upload_error = message
        self._log(f"❌ Échec upload NEXUS Market ({Path(path_str).name}) : {message}")
        self._refresh_item_badge(path_str)
        current = self.list_widget.currentItem()
        if current and current.data(Qt.UserRole) == path_str:
            self._update_ai_panel(result)
        if self._bulk_upload_pending is None and self._retry_pending is None:
            QMessageBox.warning(self, "Échec de l'upload", message)
        self._advance_bulk_upload(success=False)
        self._advance_retry(success=False)

    def _advance_bulk_upload(self, success: bool):
        """Fait progresser le compteur d'un upload en masse et affiche le
        résumé final une fois toutes les images traitées. Ne fait rien si
        aucun upload en masse n'est en cours (upload individuel classique)."""
        if self._bulk_upload_pending is None:
            return
        if success:
            self._bulk_upload_success += 1
        else:
            self._bulk_upload_failed += 1
        done = self._bulk_upload_success + self._bulk_upload_failed
        self.status_bar.showMessage(f"Upload en masse NEXUS Market : {done} / {self._bulk_upload_pending}")
        if done >= self._bulk_upload_pending:
            self._log(
                f"🚀 Upload en masse terminé : {self._bulk_upload_success} succès, "
                f"{self._bulk_upload_failed} échec(s)."
            )
            self.status_bar.showMessage(
                f"Upload en masse terminé — {self._bulk_upload_success} succès, "
                f"{self._bulk_upload_failed} échec(s).", 6000
            )
            if self._bulk_upload_failed:
                QMessageBox.warning(
                    self, "Upload en masse terminé",
                    f"{self._bulk_upload_success} image(s) uploadée(s) avec succès,\n"
                    f"{self._bulk_upload_failed} échec(s) — voir le journal pour le détail."
                )
            else:
                QMessageBox.information(
                    self, "Upload en masse terminé",
                    f"{self._bulk_upload_success} image(s) uploadée(s) avec succès vers NEXUS Market."
                )
            self._bulk_upload_pending = None

    def upload_all_to_nexus(self):
        """Uploade en une fois toutes les images déjà traitées qui n'ont pas
        encore de lien NEXUS Market."""
        integrations = self.settings_panel.get_integrations()
        if not integrations.supabase_url or not integrations.supabase_key:
            QMessageBox.warning(
                self, "Configuration Supabase manquante",
                "Renseignez l'URL et la clé Supabase dans le panneau de réglages\n"
                "(section « NEXUS Market — Upload ») avant d'uploader le lot."
            )
            return
        if requests is None:
            QMessageBox.critical(self, "Module manquant", "Installez 'requests' avec : pip install requests")
            return
        if self._bulk_upload_pending is not None:
            QMessageBox.information(self, "Upload déjà en cours",
                                     "Un upload en masse est déjà en cours, merci de patienter.")
            return

        candidates = [(p, r) for p, r in self.results.items() if r.image is not None and not r.supabase_url]
        if not candidates:
            QMessageBox.information(
                self, "Rien à uploader",
                "Toutes les images traitées ont déjà un lien NEXUS Market,\n"
                "ou aucune image n'a encore été traitée."
            )
            return

        reply = QMessageBox.question(
            self, "Confirmer l'upload en masse",
            f"Uploader {len(candidates)} image(s) traitée(s) vers NEXUS Market ?",
            QMessageBox.Yes | QMessageBox.No,
        )
        if reply != QMessageBox.Yes:
            return

        config = self.settings_panel.get_config()
        self._bulk_upload_pending = len(candidates)
        self._bulk_upload_success = 0
        self._bulk_upload_failed = 0
        self._log(f"📤 Upload en masse démarré pour {len(candidates)} image(s)…")
        self.status_bar.showMessage(f"Upload en masse NEXUS Market : 0 / {len(candidates)}")
        for path_str, result in candidates:
            task = UploadTask(path_str, result.image, config, integrations, self._upload_signals)
            QThreadPool.globalInstance().start(task)

    def export_ai_manifest(self):
        """Exporte un manifeste JSON (fiches produit IA + liens NEXUS Market)
        prêt à être importé dans la base produits de NEXUS Market."""
        candidates = {p: r for p, r in self.results.items() if r.image is not None}
        if not candidates:
            QMessageBox.information(self, "Rien à exporter", "Aucune image traitée pour le moment.")
            return

        out_path, _ = QFileDialog.getSaveFileName(
            self, "Exporter le manifeste NEXUS Market", "nexus_market_manifest.json", "JSON (*.json)"
        )
        if not out_path:
            return

        manifest = []
        for path_str, result in candidates.items():
            manifest.append({
                "source_file": Path(path_str).name,
                "title": result.ai_title or "",
                "description": result.ai_description or "",
                "category": result.ai_category or "",
                "tags": result.ai_tags or [],
                "image_url": result.supabase_url or "",
                "ai_error": result.ai_error,
                "upload_error": result.upload_error,
            })

        try:
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, indent=2)
            self._log(f"🧾 Manifeste NEXUS Market exporté : {out_path}")
            QMessageBox.information(self, "Export réussi", f"Manifeste enregistré :\n{out_path}")
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Erreur d'export", str(exc))

    def _refresh_item_badge(self, key: str):
        """Met à jour le texte/l'infobulle de l'item de la liste avec de
        petits badges reflétant l'état de la fiche IA et de l'upload NEXUS
        Market, sans toucher à l'icône de statut de traitement (pastille)."""
        item = self.list_items_by_path.get(key)
        result = self.results.get(key)
        if item is None or result is None:
            return

        base_name = Path(key).name
        if result.error:
            item.setText(base_name)
            item.setToolTip(f"Erreur : {result.error}")
            return

        badges = []
        tooltip_lines = []
        if result.ai_title:
            badges.append("🤖")
            tooltip_lines.append(f"IA : {result.ai_title}")
        elif result.ai_error:
            badges.append("🤖⚠")
            tooltip_lines.append(f"Fiche IA indisponible : {result.ai_error}")
        if result.supabase_url:
            badges.append("🚀")
            tooltip_lines.append(f"NEXUS Market : {result.supabase_url}")
        elif result.upload_error:
            badges.append("🚀⚠")
            tooltip_lines.append(f"Upload NEXUS Market échoué : {result.upload_error}")

        item.setText(f"{base_name}  {' '.join(badges)}" if badges else base_name)
        item.setToolTip("\n".join(tooltip_lines) if tooltip_lines else base_name)

    def _on_aitag_done(self, path_str: str, meta: dict):
        result = self.results.get(path_str)
        title = meta.get("title", "")
        if result:
            result.ai_title = title
            result.ai_description = meta.get("description")
            result.ai_category = meta.get("category")
            result.ai_tags = meta.get("tags", [])
            result.ai_error = None
        self._log(f"✅ Fiche IA régénérée pour {Path(path_str).name} : « {title} »")
        self._refresh_item_badge(path_str)
        current = self.list_widget.currentItem()
        if current and current.data(Qt.UserRole) == path_str:
            self._update_ai_panel(result)
        self._advance_retry(success=True)

    def _on_aitag_error(self, path_str: str, message: str):
        result = self.results.get(path_str)
        if result:
            result.ai_error = message
        self._log(f"❌ Fiche IA toujours indisponible pour {Path(path_str).name} : {message}")
        self._refresh_item_badge(path_str)
        current = self.list_widget.currentItem()
        if current and current.data(Qt.UserRole) == path_str:
            self._update_ai_panel(result)
        self._advance_retry(success=False)

    def _advance_retry(self, success: bool):
        """Fait progresser le compteur d'une nouvelle tentative groupée
        (fiches IA + uploads en échec) et affiche le résumé final."""
        if self._retry_pending is None:
            return
        if success:
            self._retry_success += 1
        else:
            self._retry_failed += 1
        done = self._retry_success + self._retry_failed
        self.status_bar.showMessage(f"Nouvelle tentative : {done} / {self._retry_pending}")
        if done >= self._retry_pending:
            self._log(
                f"🔁 Nouvelle tentative terminée : {self._retry_success} succès, "
                f"{self._retry_failed} toujours en échec."
            )
            QMessageBox.information(
                self, "Nouvelle tentative terminée",
                f"{self._retry_success} résolue(s) avec succès,\n"
                f"{self._retry_failed} toujours en échec — voir le journal pour le détail."
            )
            self._retry_pending = None

    def retry_failed_ai_and_uploads(self):
        """Relance uniquement la génération de fiche IA et/ou l'upload NEXUS
        Market pour les images déjà traitées où l'une de ces étapes a échoué
        — sans retraiter l'image elle-même."""
        integrations = self.settings_panel.get_integrations()
        ai_candidates = [(p, r) for p, r in self.results.items() if r.image is not None and r.ai_error]
        upload_candidates = [(p, r) for p, r in self.results.items() if r.image is not None and r.upload_error]

        if not ai_candidates and not upload_candidates:
            QMessageBox.information(self, "Rien à réessayer",
                                     "Aucune fiche IA ni aucun upload en échec pour le moment.")
            return
        if self._retry_pending is not None:
            QMessageBox.information(self, "Nouvelle tentative en cours",
                                     "Une nouvelle tentative est déjà en cours, merci de patienter.")
            return

        if ai_candidates and not integrations.anthropic_api_key:
            QMessageBox.warning(self, "Clé API manquante",
                                 "Impossible de réessayer les fiches IA sans clé API Anthropic.")
            ai_candidates = []
        if upload_candidates and (not integrations.supabase_url or not integrations.supabase_key):
            QMessageBox.warning(self, "Configuration Supabase manquante",
                                 "Impossible de réessayer les uploads sans URL/clé Supabase.")
            upload_candidates = []
        if not ai_candidates and not upload_candidates:
            return

        config = self.settings_panel.get_config()
        total = len(ai_candidates) + len(upload_candidates)
        self._retry_pending = total
        self._retry_success = 0
        self._retry_failed = 0
        self._log(f"🔁 Nouvelle tentative : {len(ai_candidates)} fiche(s) IA et {len(upload_candidates)} upload(s)…")
        self.status_bar.showMessage(f"Nouvelle tentative : 0 / {total}")

        for path_str, result in ai_candidates:
            task = AITagTask(path_str, result.image, integrations, self._aitag_signals)
            QThreadPool.globalInstance().start(task)
        for path_str, result in upload_candidates:
            task = UploadTask(path_str, result.image, config, integrations, self._upload_signals)
            QThreadPool.globalInstance().start(task)

    # ------------------------------------------------------------------
    # Traitement
    # ------------------------------------------------------------------
    def process_selected(self):
        item = self.list_widget.currentItem()
        if item is None:
            QMessageBox.information(self, "Sélection requise", "Sélectionnez d'abord une image dans la liste.")
            return
        path = Path(item.data(Qt.UserRole))
        self._start_batch([path])

    def process_all(self):
        if not self.image_queue:
            QMessageBox.information(self, "File vide", "Ajoutez d'abord des images à traiter.")
            return
        self._start_batch(list(self.image_queue))

    def retry_failed(self):
        failed_paths = [Path(k) for k, r in self.results.items() if r.error]
        if not failed_paths:
            QMessageBox.information(self, "Rien à réessayer", "Aucun échec à retraiter pour le moment.")
            return
        self._start_batch(failed_paths)

    def _run_quality_check(self, paths: list[Path]) -> Optional[list[Path]]:
        """Analyse rapidement chaque photo (flou / exposition) avant de lancer
        un traitement potentiellement long. Affiche un dialogue permettant
        d'exclure individuellement les photos à problème plutôt que
        d'accepter ou d'annuler tout le lot d'un bloc. Retourne la liste des
        chemins à traiter (photos exclues retirées), ou None si l'utilisateur
        annule complètement."""
        flagged = []
        for path in paths:
            try:
                with Image.open(path) as im:
                    im.load()
                    diag = detect_blur_and_exposure(im)
            except Exception:  # noqa: BLE001
                continue
            if diag["blurry"] or diag["under_exposed"] or diag["over_exposed"]:
                flagged.append((path, diag))
            if len(flagged) >= 60:  # évite un dialogue interminable sur un très gros lot
                break
        if not flagged:
            return paths
        dialog = QualityCheckDialog(flagged, self)
        if dialog.exec_() != QDialog.Accepted:
            return None
        excluded = dialog.excluded_paths()
        return [p for p in paths if str(p) not in excluded]

    def _start_batch(self, paths: list[Path], override_config: Optional[ProcessingConfig] = None):
        config = override_config if override_config is not None else self.settings_panel.get_config()
        if config.remove_background and rembg_remove is None:
            QMessageBox.critical(
                self, "Dépendance manquante",
                "Le module 'rembg' est introuvable.\nInstallez-le avec : pip install rembg"
            )
            return

        integrations = self.settings_panel.get_integrations()
        if config.ai_tagging_enabled and not integrations.anthropic_api_key:
            QMessageBox.warning(
                self, "Clé API manquante",
                "La génération de fiche produit IA est activée mais aucune clé API Anthropic\n"
                "n'est renseignée (réglages « IA avancée »). Cette étape sera ignorée."
            )
        if config.supabase_upload_enabled and (not integrations.supabase_url or not integrations.supabase_key):
            QMessageBox.warning(
                self, "Configuration Supabase incomplète",
                "L'upload automatique vers NEXUS Market est activé mais l'URL ou la clé\n"
                "Supabase n'est pas renseignée (réglages « NEXUS Market — Upload »)."
            )

        if config.blur_exposure_check_enabled:
            filtered_paths = self._run_quality_check(paths)
            if filtered_paths is None:
                return
            if not filtered_paths:
                QMessageBox.information(
                    self, "Aucune photo à traiter",
                    "Toutes les photos du lot ont été exclues lors de la vérification qualité."
                )
                return
            paths = filtered_paths

        for path in paths:
            item = self.list_items_by_path.get(str(path))
            if item:
                item.setIcon(get_status_icon("processing"))

        self.progress_bar.setValue(0)
        self.progress_bar.setMaximum(len(paths))
        self._set_processing_state(True)

        max_workers = self.settings_panel.get_max_workers()
        self.manager = BatchManager(paths, config, rotations=self.rotations, max_workers=max_workers,
                                     integrations=integrations, edits=self.image_edits)
        self.manager.progress_signal.connect(self._on_progress)
        self.manager.item_done_signal.connect(self._on_item_done)
        self.manager.finished_signal.connect(self._on_batch_finished)
        self.manager.start()

    def cancel_processing(self):
        if self.manager is not None:
            self.manager.cancel()
            self._log("Annulation demandée…")
        if self._multi_export_mode or self._multi_export_queue:
            self._multi_export_mode = False
            self._multi_export_queue = []
            self._log("Export multi-plateformes annulé.")

    def _on_progress(self, completed: int, total: int, filename: str):
        self.progress_bar.setMaximum(total)
        self.progress_bar.setValue(completed)
        self.status_bar.showMessage(f"Traitement {completed}/{total} : {filename}")

    def _on_item_done(self, result: BatchResult):
        key = str(result.source_path)
        self.results[key] = result
        item = self.list_items_by_path.get(key)
        if item:
            item.setIcon(get_status_icon("error") if result.error else get_status_icon("success"))
        self._refresh_item_badge(key)
        self._refresh_dashboard()

        if result.error:
            self._log(f"❌ {result.source_path.name} : {result.error}")
        else:
            self._log(f"✅ {result.source_path.name} traité avec succès.")
            if result.ai_title:
                self._log(f"   ✍️ Fiche IA générée : « {result.ai_title} »")
            if result.ai_error:
                self._log(f"   ⚠️ Fiche IA indisponible : {result.ai_error}")
            if result.supabase_url:
                self._log(f"   🚀 Uploadé vers NEXUS Market : {result.supabase_url}")
            if result.upload_error:
                self._log(f"   ⚠️ Upload NEXUS Market échoué : {result.upload_error}")

        if result.image is not None:
            # Rend la nouvelle version disponible pour « Depuis les photos déjà
            # traitées… », et si cette photo est déjà dans le Studio Collage
            # (même sans changer d'onglet), la met à jour tout de suite —
            # continuité totale entre retraitement et collage.
            self.collage_studio.set_available_results(self._collage_available_results())
            if self.collage_studio.has_synced_image(key):
                self.collage_studio.sync_image(key, f"✓ {Path(key).name}", result.image)

        current = self.list_widget.currentItem()
        if current and current.data(Qt.UserRole) == key:
            if result.image is not None:
                self.lbl_result.setPixmap(pil_to_pixmap(result.image, max_size=1000))
                try:
                    before_im = self._load_rotated_image(result.source_path)
                except Exception:
                    before_im = None
                self._update_compare_widget(before_im, result.image)
            elif result.error:
                self.lbl_result.setText(f"Erreur :\n{result.error}")
                self._clear_compare_widget()
            self._update_ai_panel(result)

    def _on_batch_finished(self, success: int, failed: int):
        self._set_processing_state(False)
        self._log(f"Lot terminé : {success} succès, {failed} échec(s).")
        self.status_bar.showMessage(f"Terminé — {success} succès, {failed} échec(s).")

        if self._multi_export_mode:
            self._export_current_multi_preset(success, failed)
            return

        if failed:
            QMessageBox.warning(
                self, "Traitement terminé avec des erreurs",
                f"{success} image(s) traitée(s) avec succès.\n{failed} échec(s) — voir le journal."
            )

    def _set_processing_state(self, running: bool):
        self.btn_process_all.setEnabled(not running)
        self.btn_process_selected.setEnabled(not running)
        self.btn_retry_failed.setEnabled(not running)
        self.btn_add_files.setEnabled(not running)
        self.btn_add_folder.setEnabled(not running)
        self.btn_multi_export.setEnabled(not running)
        self.btn_cancel.setEnabled(running)

    # ------------------------------------------------------------------
    # Export
    # ------------------------------------------------------------------
    def _write_results(self, results: dict[str, BatchResult], config: ProcessingConfig,
                        out_dir_path: Path, pattern: str) -> tuple[int, int, Path]:
        """Enregistre un ensemble de résultats sur disque + rapport CSV. Réutilisé par
        l'export simple et l'export multi-plateformes."""
        out_dir_path.mkdir(parents=True, exist_ok=True)
        ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[config.output_format]

        report_rows = []
        saved, errors = 0, 0
        for path_str, result in results.items():
            src = Path(path_str)
            out_name = pattern.format(name=src.stem) + f".{ext}"
            out_path = out_dir_path / out_name
            ai_row = (
                result.ai_title or "",
                result.ai_description or "",
                result.ai_category or "",
                ", ".join(result.ai_tags) if result.ai_tags else "",
                result.supabase_url or "",
            )
            try:
                data, _ext, _ct = serialize_image(result.image, config)
                out_path.write_bytes(data)
                saved += 1
                report_rows.append((src.name, "Succès", str(out_path), *ai_row))
            except Exception as exc:  # noqa: BLE001
                logger.error("Erreur export %s : %s", out_path, exc)
                errors += 1
                report_rows.append((src.name, f"Erreur : {exc}", "", *ai_row))

            for hue, variant_img in (result.color_variants or {}).items():
                variant_name = pattern.format(name=src.stem) + f"_h{hue}.{ext}"
                variant_path = out_dir_path / variant_name
                try:
                    vdata, _ve, _vc = serialize_image(variant_img, config)
                    variant_path.write_bytes(vdata)
                    saved += 1
                    report_rows.append((f"{src.name} (variante {hue}°)", "Succès", str(variant_path), *ai_row))
                except Exception as exc:  # noqa: BLE001
                    logger.error("Erreur export variante couleur (%s°) pour %s : %s", hue, src, exc)
                    errors += 1

        report_path = out_dir_path / "export_report.csv"
        try:
            with open(report_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "Fichier source", "Statut", "Fichier exporté",
                    "Titre IA", "Description IA", "Catégorie IA", "Tags IA", "Lien NEXUS Market",
                ])
                writer.writerows(report_rows)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Impossible d'écrire le rapport CSV : %s", exc)

        return saved, errors, report_path

    def open_carousel_dialog(self):
        """Ouvre le studio de carrousel : sélection + ordre des images déjà
        traitées, puis génère une séquence de slides numérotées prête à
        publier (Instagram, Facebook…)."""
        successes = [(k, r.image) for k, r in self.results.items() if r.image is not None]
        if len(successes) < 2:
            QMessageBox.information(
                self, "Pas assez d'images",
                "Traitez au moins 2 images avec succès avant de créer un carrousel."
            )
            return

        dialog = CarouselDialog(successes, self)
        if dialog.exec_() != QDialog.Accepted:
            return
        selection = dialog.get_ordered_selection()
        if len(selection) < 2:
            QMessageBox.warning(
                self, "Sélection insuffisante",
                "Sélectionnez au moins 2 images pour créer un carrousel."
            )
            return

        current_cfg = self.settings_panel.get_config()
        size = dialog.get_format_size(current_cfg.canvas_size)
        show_badge = dialog.badge_enabled()
        badge_pos = dialog.badge_position()
        bg_color = current_cfg.bg_color[:3] if current_cfg.bg_color else (255, 255, 255)

        out_dir = QFileDialog.getExistingDirectory(self, "Dossier de destination du carrousel")
        if not out_dir:
            return
        out_dir_path = Path(out_dir)
        total = len(selection)
        saved = 0
        for idx, (path_str, img) in enumerate(selection, start=1):
            try:
                slide = build_carousel_slide(
                    img, size, bg_color=bg_color,
                    index=idx if show_badge else None,
                    total=total if show_badge else None,
                    badge_position=badge_pos,
                )
                out_path = out_dir_path / f"carrousel_{idx:02d}.jpg"
                slide.save(out_path, "JPEG", quality=92)
                saved += 1
            except Exception as exc:  # noqa: BLE001
                logger.error("Erreur génération slide carrousel pour %s : %s", path_str, exc)

        self._log(f"🎠 Carrousel généré : {saved}/{total} slide(s) dans {out_dir}")
        if saved:
            QMessageBox.information(
                self, "Carrousel généré",
                f"{saved}/{total} slide(s) enregistrée(s) dans :\n{out_dir}"
            )
        else:
            QMessageBox.critical(self, "Échec", "Aucune slide n'a pu être générée.")

    def export_contact_sheet(self):
        """Génère une planche de contact récapitulative (avant/après) pour
        toutes les images déjà traitées avec succès, et l'enregistre en PNG
        à l'emplacement choisi par l'utilisateur."""
        successes = [(k, r) for k, r in self.results.items() if r.image is not None]
        if not successes:
            QMessageBox.information(
                self, "Rien à exporter",
                "Traitez au moins une image avant de générer une planche de contact."
            )
            return

        entries = []
        for path_str, result in successes:
            before = None
            try:
                with Image.open(path_str) as im:
                    im.load()
                    before = im.convert("RGB").copy()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Aperçu 'avant' introuvable pour %s : %s", path_str, exc)
            entries.append((Path(path_str).name, before, result.image))

        try:
            sheet = build_contact_sheet(entries)
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Erreur", str(exc))
            return

        save_path, _ = QFileDialog.getSaveFileName(
            self, "Enregistrer la planche de contact", "planche_contact.png", "PNG (*.png)"
        )
        if not save_path:
            return
        try:
            sheet.save(save_path, "PNG")
            self._log(f"🖼 Planche de contact enregistrée : {save_path}")
            QMessageBox.information(self, "Terminé", f"Planche de contact enregistrée :\n{save_path}")
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Erreur", str(exc))

    def export_results(self):
        successful = {k: r for k, r in self.results.items() if r.image is not None}
        if not successful:
            QMessageBox.information(self, "Rien à exporter", "Aucune image traitée avec succès pour le moment.")
            return

        out_dir = QFileDialog.getExistingDirectory(self, "Choisir le dossier d'export")
        if not out_dir:
            return
        out_dir_path = Path(out_dir)

        config = self.settings_panel.get_config()
        pattern = self.settings_panel.get_filename_pattern()

        saved, errors, report_path = self._write_results(successful, config, out_dir_path, pattern)

        self._log(f"Export terminé : {saved} fichier(s) enregistré(s), {errors} erreur(s).")
        self.settings_panel.notify_batch_finished(
            total=len(successful), success=saved, failed=errors, output_dir=str(out_dir_path)
        )
        QMessageBox.information(
            self, "Export terminé",
            f"{saved} image(s) exportée(s) vers :\n{out_dir_path}\n\n"
            f"Rapport : {report_path.name}" + (f"\n{errors} erreur(s)." if errors else "")
        )

    # ------------------------------------------------------------------
    # Export multi-plateformes (plusieurs presets traités et exportés
    # séquentiellement en une seule action utilisateur)
    # ------------------------------------------------------------------
    def multi_platform_export(self):
        if not self.image_queue:
            QMessageBox.information(self, "File vide", "Ajoutez d'abord des images à traiter.")
            return

        preset_names = [n for n in self.settings_panel.all_presets if n != "Personnalisé"]
        if not preset_names:
            QMessageBox.information(self, "Aucun preset", "Aucun preset disponible pour l'export multi-plateformes.")
            return

        dialog = MultiExportDialog(preset_names, self)
        if dialog.exec_() != QDialog.Accepted:
            return
        selected = dialog.get_selected()
        if not selected:
            QMessageBox.information(self, "Aucune sélection", "Sélectionnez au moins une plateforme.")
            return

        out_dir = QFileDialog.getExistingDirectory(self, "Dossier de sortie — export multi-plateformes")
        if not out_dir:
            return

        self._multi_export_dir = Path(out_dir)
        self._multi_export_queue = [(name, self.settings_panel.all_presets[name]) for name in selected]
        self._multi_export_report = []
        self._log(f"🚀 Export multi-plateformes démarré pour {len(selected)} plateforme(s) : {', '.join(selected)}.")
        self._run_next_multi_export()

    def _run_next_multi_export(self):
        if not self._multi_export_queue:
            self._multi_export_mode = False
            summary = "\n".join(self._multi_export_report) if self._multi_export_report else "Aucun résultat."
            self._log("🎉 Export multi-plateformes terminé pour toutes les plateformes sélectionnées.")
            QMessageBox.information(
                self, "Export multi-plateformes terminé",
                f"Toutes les plateformes ont été traitées et exportées dans :\n{self._multi_export_dir}\n\n{summary}"
            )
            return

        self._current_multi_name, config = self._multi_export_queue.pop(0)
        self._multi_export_mode = True
        self._log(f"➡️ Traitement en cours pour la plateforme « {self._current_multi_name} »…")
        self.status_bar.showMessage(f"Export multi-plateformes — traitement pour {self._current_multi_name}…")
        self._start_batch(list(self.image_queue), override_config=config)

    def _export_current_multi_preset(self, success: int, failed: int):
        name = self._current_multi_name
        config = self.settings_panel.all_presets.get(name, self.settings_panel.get_config())
        pattern = self.settings_panel.get_filename_pattern()
        subdir = self._multi_export_dir / sanitize_preset_name(name)

        successful = {k: r for k, r in self.results.items() if r.image is not None}
        saved, errors, _report_path = self._write_results(successful, config, subdir, pattern)

        self._multi_export_report.append(f"• {name} → {saved} image(s) exportée(s) dans « {subdir.name} »"
                                          + (f", {errors} erreur(s)" if errors else ""))
        self._log(f"✅ Plateforme « {name} » exportée : {saved} succès, {errors} erreur(s) → {subdir}")

        self._run_next_multi_export()

    # ------------------------------------------------------------------
    def _log(self, message: str):
        logger.info(message)
        self.log_view.append(message)

    def _show_about(self):
        QMessageBox.information(
            self, "À propos",
            "Studio E-commerce Pro+ AI — NEXUS Market\n\n"
            "Pipeline avancé de préparation d'images produit :\n"
            "suppression de fond IA, mise en page automatique, fond uni,\n"
            "dégradé (4 directions + bibliothèque de presets) ou image/texture\n"
            "importée, ombre portée,\n"
            "filigrane, presets marketplace, rotation rapide, traitement par\n"
            "lot parallèle, comparateur avant/après à curseur glissant,\n"
            "export multi-plateformes en un clic avec rapport.\n\n"
            "Nouveautés IA : retouche automatique, agrandissement IA (upscale),\n"
            "génération de fiche produit (titre / description / tags) via Claude,\n"
            "upload direct vers NEXUS Market (Supabase Storage) — à l'unité ou en\n"
            "masse — et export d'un manifeste JSON prêt à importer.\n\n"
            "Retouche photo pro : saturation, balance des blancs, niveaux,\n"
            "hautes lumières/ombres, styles N&B/Sépia, vignette, flou d'arrière-plan,\n"
            "recadrage libre ou par ratio avec redressement fin, et retouche localisée\n"
            "(anti-tache, tampon de duplication, yeux rouges)."
        )


# ==========================================================================
# 8. POINT D'ENTRÉE
# ==========================================================================

def main():
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setApplicationName("Studio E-commerce Pro+ AI")

    window = MainWindow()
    window.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
