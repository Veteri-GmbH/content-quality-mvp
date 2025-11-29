# Code Review: URL-Limit und verbesserte Progress-Anzeige

## Zusammenfassung

Bei der Implementierung wurden **kritische Bugs** gefunden, die das System blockieren:

---

## 🔴 Kritisches Problem 1: Race Condition im Job-Queue

### Symptom
Alle 3 Worker greifen auf denselben Job zu:
```
📦 [Worker 1] Processing job e13ceddd-7c25-41f9-9558-851f17b3c5df (crawl_page)
📦 [Worker 2] Processing job e13ceddd-7c25-41f9-9558-851f17b3c5df (crawl_page)
📦 [Worker 3] Processing job e13ceddd-7c25-41f9-9558-851f17b3c5df (crawl_page)
```

### Ursache
In `server/src/services/job-queue.ts` in der `getNextJob()` Funktion:
- Der SELECT und UPDATE sind **nicht atomar**
- Zwischen dem `SELECT` (Zeile 43-55) und dem `UPDATE` (Zeile 64-72) kann ein anderer Worker denselben Job holen
- PostgreSQL's `LIMIT 1` garantiert nicht, dass verschiedene Connections unterschiedliche Rows zurückbekommen

### Lösung
Verwende `FOR UPDATE SKIP LOCKED` für atomares Locking:

```typescript
// In getNextJob() - verwende eine Transaktion mit Row-Level Locking
const jobs = await db
  .select()
  .from(jobQueue)
  .where(
    and(
      eq(jobQueue.status, 'pending'),
      or(
        isNull(jobQueue.locked_until),
        lte(jobQueue.locked_until, now)
      )
    )
  )
  .for('update', { skipLocked: true }) // <- WICHTIG: Skip bereits gelockte Rows
  .limit(1);
```

Alternativ mit Raw SQL für bessere Kontrolle:
```sql
UPDATE job_queue 
SET status = 'processing', locked_until = $1, attempts = attempts + 1
WHERE id = (
  SELECT id FROM job_queue 
  WHERE status = 'pending' 
  AND (locked_until IS NULL OR locked_until <= NOW())
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

---

## 🔴 Kritisches Problem 2: Migration nicht ausgeführt

### Symptom
```
PostgresError: column "url_limit" of relation "audits" does not exist
```

### Ursache
Die Migration `0003_url_limit.sql` wurde erstellt, aber nicht ausgeführt. Die Auto-Migration in `api.ts` schlägt fehl, weil der Server startet, bevor die Datenbank bereit ist:

```
❌ [Worker 1] Job processor error: AggregateError [ECONNREFUSED]
❌ Migration check/execution failed:
⚠️  Server will start, but the url_limit feature may not work until migration is run manually
```

### Lösung
1. Die Migration manuell ausführen:
```bash
cd server && pnpm drizzle-kit push
```

2. Oder den Server so modifizieren, dass er auf die DB wartet, bevor er startet.

---

## 🟡 Problem 3: TimeoutNegativeWarning

### Symptom
```
TimeoutNegativeWarning: -4916.978269999836 is a negative number.
Timeout duration was set to 1.
```

### Ursache
In `audit-service.ts` wird `rate_limit_ms` als negative Zahl berechnet:
```typescript
if (payload.rate_limit_ms > 0) {
  await new Promise((resolve) => setTimeout(resolve, payload.rate_limit_ms));
}
```

Wenn irgendwo ein negativer Wert übergeben wird (z.B. durch Berechnungsfehler), führt das zu diesem Warning.

### Lösung
```typescript
const delay = Math.max(0, payload.rate_limit_ms || 0);
if (delay > 0) {
  await new Promise((resolve) => setTimeout(resolve, delay));
}
```

---

## 🟢 Korrekt implementiert

1. **UI Components**: `audit-progress.tsx` und `audit-table.tsx` sind korrekt implementiert
2. **Status-Badges**: Farbcodierung und Sortierung funktionieren
3. **Auto-Refresh**: 5-Sekunden-Intervall mit Countdown funktioniert
4. **URL-Limit UI**: Das Dropdown wurde korrekt zu `NewAudit.tsx` hinzugefügt
5. **API-Endpunkte**: Die API akzeptiert `url_limit` korrekt

---

## Empfohlene Reihenfolge der Fixes

1. **SOFORT**: Migration ausführen (oder `url_limit` Feld aus dem Insert entfernen bis Migration läuft)
2. **WICHTIG**: Job-Queue Race Condition fixen
3. **OPTIONAL**: TimeoutNegativeWarning fixen

---

## Test-Checkliste nach Fixes

- [ ] Nur ein Worker verarbeitet jeden Job
- [ ] Seiten werden gecrawlt UND analysiert
- [ ] Fortschrittsanzeige aktualisiert sich
- [ ] Ergebnisse erscheinen in der Tabelle
- [ ] URL-Limit funktioniert bei neuen Audits

