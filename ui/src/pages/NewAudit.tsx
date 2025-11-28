import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/serverComm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';

export function NewAudit() {
  const navigate = useNavigate();
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [rateLimit, setRateLimit] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === 'http:' ||
        parsed.protocol === 'https:'
      );
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sitemapUrl.trim()) {
      setError('Bitte geben Sie eine Sitemap-URL ein');
      return;
    }

    if (!validateUrl(sitemapUrl)) {
      setError('Bitte geben Sie eine gültige URL ein');
      return;
    }

    // Check if URL looks like a sitemap
    if (
      !sitemapUrl.toLowerCase().includes('sitemap') &&
      !sitemapUrl.toLowerCase().endsWith('.xml')
    ) {
      if (
        !confirm(
          'Die URL scheint keine Sitemap zu sein. Möchten Sie trotzdem fortfahren?'
        )
      ) {
        return;
      }
    }

    try {
      setLoading(true);
      const result = await api.createAudit({
        sitemap_url: sitemapUrl.trim(),
        rate_limit_ms: rateLimit,
      });
      navigate(`/audits/${result.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Fehler beim Erstellen des Audits'
      );
      console.error('Error creating audit:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Button
        variant="ghost"
        onClick={() => navigate('/audits')}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Zurück
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Neuen Audit erstellen</CardTitle>
          <CardDescription>
            Geben Sie die URL einer Sitemap.xml ein, um einen neuen Content-Quality-Audit zu starten
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="sitemap-url">Sitemap URL</Label>
              <Input
                id="sitemap-url"
                type="url"
                placeholder="https://example.com/sitemap.xml"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                disabled={loading}
                required
              />
              <p className="text-xs text-muted-foreground">
                Die URL sollte auf eine XML-Sitemap oder einen Sitemap-Index zeigen
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-limit">
                Rate Limit: {rateLimit}ms
              </Label>
              <Input
                id="rate-limit"
                type="range"
                min="500"
                max="5000"
                step="100"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value))}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Verzögerung zwischen Crawling-Anfragen (empfohlen: 1000ms)
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Wird erstellt...' : 'Audit starten'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/audits')}
                disabled={loading}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

