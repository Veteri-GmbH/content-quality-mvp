# Content Quality Auditor

Ein Web-Tool zur automatischen Qualitätsprüfung von Website-Inhalten. Das System analysiert Sitemaps, crawlt Seiten und nutzt KI zur Erkennung von Textqualitätsproblemen.

## Features

- **Sitemap-basiertes Crawling**: Einfach eine Sitemap-URL eingeben
- **Automatische Content-Extraktion**: Via Jina Reader API
- **KI-gestützte Analyse**: Erkennt Grammatikfehler, Redundanz, Widersprüche, Platzhalter und leere Inhalte
- **Quality Scores**: Bewertung von 0-100 pro Seite
- **CSV-Export**: Ergebnisse zum Download
- **Echtzeit-Fortschritt**: Live-Updates während der Analyse

## Tech Stack

| Komponente | Technologie |
|------------|-------------|
| Frontend | React + TypeScript + Vite |
| UI | Tailwind CSS + ShadCN |
| Backend | Hono (Node.js) |
| Datenbank | PostgreSQL + Drizzle ORM |
| Auth | Firebase Authentication |
| Crawling | Jina Reader API |
| KI-Analyse | OpenAI GPT-4o-mini / Claude |

## Schnellstart

### Voraussetzungen

- Node.js >= 20
- pnpm >= 8

### Installation

```bash
# Repository klonen
git clone https://github.com/Veteri-GmbH/content-quality.git
cd content-quality

# Dependencies installieren
pnpm install

# Entwicklungsserver starten
pnpm dev
```

Die App ist verfügbar unter:
- **Frontend**: http://localhost:5601
- **Backend API**: http://localhost:5600
- **Firebase Emulator**: http://localhost:5604

### Datenbank-Migration

Bei der ersten Ausführung die Tabellen erstellen:

```bash
cd server
node -e "
const postgres = require('postgres');
const fs = require('fs');
const sql = postgres('postgresql://postgres:password@localhost:5602/postgres');
const migration = fs.readFileSync('./drizzle/0001_audits.sql', 'utf8');
sql.unsafe(migration).then(() => { console.log('Migration complete'); sql.end(); });
"
```

## Konfiguration

### Umgebungsvariablen (server/.env)

```env
# Für KI-Analyse (mindestens einer erforderlich)
OPENAI_API_KEY=sk-...
# oder
ANTHROPIC_API_KEY=sk-ant-...
AI_PROVIDER=openai  # oder "anthropic"

# Optional: Erhöht Jina Rate-Limits
JINA_API_KEY=jina_...
```

## Verwendung

1. **Neuen Audit starten**: Navigiere zu "Content Audits" → "Neuer Audit"
2. **Sitemap-URL eingeben**: z.B. `https://example.com/sitemap.xml`
3. **Rate-Limit anpassen**: Optional (Standard: 1000ms zwischen Requests)
4. **Audit starten**: Das System crawlt und analysiert automatisch
5. **Ergebnisse prüfen**: Quality Scores und Issues pro Seite
6. **CSV exportieren**: Für externe Weiterverarbeitung

## Architektur

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   React UI      │ ───▶ │   Hono API      │ ───▶ │   PostgreSQL    │
│   (Vite)        │      │   (Backend)     │      │   (Drizzle)     │
└─────────────────┘      └────────┬────────┘      └─────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
            ┌───────────────┐           ┌───────────────┐
            │ Jina Reader   │           │ OpenAI/Claude │
            │ (Crawling)    │           │ (Analyse)     │
            └───────────────┘           └───────────────┘
```

### Projektstruktur

```
├── ui/                     # React Frontend
│   ├── src/
│   │   ├── components/     # UI-Komponenten
│   │   ├── pages/          # Seiten (Audits, NewAudit, AuditDetail)
│   │   └── lib/            # API-Client, Auth, Utils
├── server/                 # Hono Backend
│   ├── src/
│   │   ├── services/       # Business Logic
│   │   │   ├── sitemap-parser.ts
│   │   │   ├── jina-crawler.ts
│   │   │   ├── ai-analyzer.ts
│   │   │   ├── job-queue.ts
│   │   │   └── audit-service.ts
│   │   ├── schema/         # Datenbank-Schema
│   │   └── api.ts          # API-Endpoints
│   └── drizzle/            # SQL-Migrationen
└── docs/                   # Dokumentation
```

## API-Endpoints

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/api/v1/audits` | Neuen Audit starten |
| GET | `/api/v1/audits` | Alle Audits auflisten |
| GET | `/api/v1/audits/:id` | Audit-Status & Fortschritt |
| GET | `/api/v1/audits/:id/pages` | Seiten mit Ergebnissen |
| GET | `/api/v1/audits/:id/export` | CSV-Download |
| DELETE | `/api/v1/audits/:id` | Audit löschen |

## Issue-Typen

| Typ | Beschreibung |
|-----|--------------|
| `grammar` | Grammatik- und Rechtschreibfehler |
| `redundancy` | Wiederholte Phrasen oder Absätze |
| `contradiction` | Widersprüchliche Informationen |
| `placeholder` | Lorem Ipsum, TODO, "[hier einfügen]" |
| `empty` | Fehlende oder leere Beschreibungen |

## Entwicklung

```bash
# Frontend entwickeln
cd ui && pnpm dev

# Backend entwickeln
cd server && pnpm dev

# Alle Services gleichzeitig
pnpm dev
```

## Deployment

### Cloudflare Workers (Backend)

```bash
cd server && pnpm run deploy
```

### Cloudflare Pages (Frontend)

1. Repository mit Cloudflare Pages verbinden
2. Build-Befehl: `pnpm run build`
3. Output-Verzeichnis: `ui/dist`

### Umgebungsvariablen (Produktion)

- `DATABASE_URL` - PostgreSQL Connection String
- `OPENAI_API_KEY` - OpenAI API Key
- `FIREBASE_PROJECT_ID` - Firebase Project ID

## Lizenz

MIT

---

Entwickelt von [Veteri GmbH](https://veteri.de)
