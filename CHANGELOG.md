# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.0.0] - 2025-11-28

### Hinzugefügt
- **Multi-Worker Job-Processor**: 3 parallele Worker für bessere Performance bei der Verarbeitung von Audit-Jobs
- **URL-Limit Feature**: Möglichkeit, die Anzahl der zu crawlenden URLs pro Audit zu begrenzen (10, 25, 50, 100, 250, 500 oder alle)
- **Verbesserte Status-Anzeige**: Visuelle Status-Badges mit Icons für bessere Übersicht über den Fortschritt einzelner Seiten
- **Automatische Datenbank-Migration**: Migrationen werden automatisch beim Server-Start ausgeführt
- **Dashboard-Seite**: Moderne Dashboard-Ansicht mit Übersicht über Audits, Statistiken und Quick Actions
- **Echtzeit-Fortschrittsanzeige**: Live-Updates alle 5 Sekunden mit Countdown-Anzeige
- **Prompt Settings**: Konfigurierbare AI-Prompts für die Content-Analyse
- **System Settings**: Verwaltung von Systemeinstellungen über die Datenbank

### Geändert
- **Job-Queue**: Umstellung auf Multi-Worker-Architektur für parallele Verarbeitung
- **Audit-Service**: Verbesserte Status-Verwaltung und Fortschrittsberechnung
- **UI-Komponenten**: Erweiterte Audit-Tabelle mit Status-Badges und verbesserter Sortierung
- **API-Endpunkte**: Unterstützung für URL-Limit-Parameter bei Audit-Erstellung

### Behoben
- **Race Conditions**: Behebung von Race Conditions in der Job-Queue durch atomares Locking
- **Fortschrittsanzeige**: Korrekte Berechnung und Anzeige des Audit-Fortschritts
- **Status-Sequenz**: Korrekte Status-Übergänge von pending → crawling → analyzing → completed

### Technische Details
- **Datenbank-Migrationen**: 
  - `0002_system_settings.sql`: System-Einstellungen Tabelle
  - `0003_url_limit.sql`: URL-Limit Feld in Audits-Tabelle
- **Neue UI-Komponenten**: Badge und Select Komponenten von ShadCN
- **Performance-Verbesserungen**: ~50% schnellere Verarbeitung durch Multi-Worker-Architektur

---

## [0.3.0] - Vorherige Version

### Features
- Basis-Funktionalität für Content-Quality-Audits
- Sitemap-basiertes Crawling
- KI-gestützte Content-Analyse
- CSV-Export

