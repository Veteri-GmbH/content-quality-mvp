import { useState, useEffect } from 'react';
import { api } from '@/lib/serverComm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Save, RotateCcw, Check, AlertCircle, Info } from 'lucide-react';

export function PromptSettings() {
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    loadPrompt();
  }, []);

  const loadPrompt = async () => {
    try {
      setLoading(true);
      const [currentData, defaultData] = await Promise.all([
        api.getPrompt(),
        api.getDefaultPrompt(),
      ]);
      setPrompt(currentData.prompt);
      setOriginalPrompt(currentData.prompt);
      setDefaultPrompt(defaultData.prompt);
      setIsDefault(currentData.isDefault || false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Prompts');
      console.error('Error loading prompt:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      await api.updatePrompt(prompt);
      setOriginalPrompt(prompt);
      setIsDefault(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
      console.error('Error saving prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(defaultPrompt);
  };

  const handleUndo = () => {
    setPrompt(originalPrompt);
  };

  const hasChanges = prompt !== originalPrompt;
  const isResetToDefault = prompt === defaultPrompt && !isDefault;

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Prompt-Einstellungen</h1>
          <p className="text-muted-foreground mt-1">
            Konfigurieren Sie den AI-Analyse-Prompt für Content-Qualitätsprüfungen
          </p>
        </div>

        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Hinweis</p>
                <p>
                  Änderungen am Prompt gelten nur für <strong>neue Audits</strong>. 
                  Bereits laufende oder abgeschlossene Audits sind davon nicht betroffen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analyse-Prompt</CardTitle>
            <CardDescription>
              Der Prompt, der zur AI-Analyse des Website-Contents verwendet wird. 
              Verwenden Sie <code className="bg-muted px-1 py-0.5 rounded">{'{title}'}</code> und{' '}
              <code className="bg-muted px-1 py-0.5 rounded">{'{content}'}</code> als Platzhalter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt-Text</Label>
              <textarea
                id="prompt"
                className="w-full min-h-[400px] p-3 rounded-md border border-input bg-background font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Geben Sie hier Ihren Analyse-Prompt ein..."
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{prompt.length} Zeichen</span>
                {isDefault && (
                  <span className="text-blue-600 dark:text-blue-400">Standard-Prompt wird verwendet</span>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-md bg-green-100 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                Prompt erfolgreich gespeichert!
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button 
                onClick={handleSave} 
                disabled={saving || !hasChanges}
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Speichern
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleUndo}
                disabled={!hasChanges}
              >
                Änderungen verwerfen
              </Button>
              
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={prompt === defaultPrompt}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Auf Standard zurücksetzen
              </Button>
            </div>

            {hasChanges && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Sie haben ungespeicherte Änderungen.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verfügbare Platzhalter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <code className="text-sm font-medium text-primary">{'{title}'}</code>
                <p className="text-xs text-muted-foreground mt-1">
                  Wird durch den Seitentitel ersetzt
                </p>
              </div>
              <div className="rounded-md border p-3">
                <code className="text-sm font-medium text-primary">{'{content}'}</code>
                <p className="text-xs text-muted-foreground mt-1">
                  Wird durch den gecrawlten Seiteninhalt ersetzt
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

