#!/bin/bash
FILE="${1:-index.html}"
KEY="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"

if [ ! -f "$FILE" ]; then echo "❌ Fichier '$FILE' introuvable."; exit 1; fi
cp "$FILE" "${FILE}.bak"
sed -i "s|const GROQ_API_KEY = \"[^\"]*\"|const GROQ_API_KEY = \"$KEY\"|g" "$FILE"
grep -q "const GROQ_API_KEY = \"$KEY\"" "$FILE" \
  && echo "✅ Clé Groq mise à jour dans '$FILE'" \
  || { echo "❌ Échec."; cp "${FILE}.bak" "$FILE"; exit 1; }
