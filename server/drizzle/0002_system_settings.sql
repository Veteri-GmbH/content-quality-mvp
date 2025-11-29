-- System Settings Table for key-value storage
CREATE TABLE IF NOT EXISTS app.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Insert default analysis prompt
INSERT INTO app.system_settings (key, value, updated_at) VALUES (
  'analysis_prompt',
  'Analysiere den folgenden Website-Content auf Textqualitätsprobleme.

Titel: {title}
Content:
{content}

Prüfe auf:
1. Grammatik/Rechtschreibung - Fehler in Sprache
2. Redundanz - Wiederholte Phrasen oder Absätze
3. Widersprüche - Inkonsistente Informationen (z.B. verschiedene Material-Angaben)
4. Platzhalter - Lorem Ipsum, TODO, "[hier einfügen]", etc.
5. Leere Inhalte - Fehlende Beschreibungen

Antworte NUR mit einem gültigen JSON-Array im folgenden Format (kein zusätzlicher Text):
[{ "type": "grammar|redundancy|contradiction|placeholder|empty", 
   "severity": "low|medium|high",
   "description": "...",
   "snippet": "betroffener Text",
   "suggestion": "Verbesserungsvorschlag" }]

Berechne zusätzlich einen Quality Score (0-100) basierend auf der Anzahl und Schwere der gefundenen Probleme.',
  NOW()
) ON CONFLICT (key) DO NOTHING;

