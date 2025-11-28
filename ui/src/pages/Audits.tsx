import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Audit } from '@/lib/serverComm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export function Audits() {
  const navigate = useNavigate();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAudits();
  }, []);

  const loadAudits = async () => {
    try {
      setLoading(true);
      const data = await api.getAudits();
      setAudits(data.audits);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Audits');
      console.error('Error loading audits:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Audit wirklich löschen?')) {
      return;
    }

    try {
      await api.deleteAudit(id);
      await loadAudits();
    } catch (err) {
      alert('Fehler beim Löschen des Audits');
      console.error('Error deleting audit:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'failed':
        return 'text-red-600 dark:text-red-400';
      case 'crawling':
      case 'analyzing':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Ausstehend';
      case 'crawling':
        return 'Wird gecrawlt';
      case 'analyzing':
        return 'Wird analysiert';
      case 'completed':
        return 'Abgeschlossen';
      case 'failed':
        return 'Fehler';
      default:
        return status;
    }
  };

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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Content Quality Audits</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie Ihre Website-Content-Qualitätsprüfungen
          </p>
        </div>
        <Button onClick={() => navigate('/audits/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Neuer Audit
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {audits.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">
              Noch keine Audits vorhanden. Erstellen Sie einen neuen Audit, um zu beginnen.
            </p>
            <Button onClick={() => navigate('/audits/new')}>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Audit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {audits.map((audit) => (
            <Card key={audit.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <a
                        href={audit.sitemap_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline flex items-center gap-1"
                      >
                        {audit.sitemap_url}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Erstellt{' '}
                      {formatDistanceToNow(new Date(audit.created_at), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className={cn('text-sm font-medium', getStatusColor(audit.status))}>
                        {getStatusLabel(audit.status)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Fortschritt</div>
                      <div className="text-sm font-medium">
                        {audit.processed_urls} / {audit.total_urls}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(audit.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/audits/${audit.id}`)}
                  >
                    Details anzeigen
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

