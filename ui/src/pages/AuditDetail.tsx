import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type AuditProgress, type AuditPagesResponse } from '@/lib/serverComm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditProgress as ProgressComponent } from '@/components/audit-progress';
import { AuditTable } from '@/components/audit-table';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AuditDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [pages, setPages] = useState<AuditPagesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [issueTypeFilter, setIssueTypeFilter] = useState<string>('');
  const [minScoreFilter, setMinScoreFilter] = useState<string>('');

  useEffect(() => {
    if (id) {
      loadData();
      // Auto-refresh every 5 seconds if audit is not completed
      const interval = setInterval(() => {
        if (progress && progress.audit.status !== 'completed' && progress.audit.status !== 'failed') {
          loadData(true);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [id, page, issueTypeFilter, minScoreFilter]);

  const loadData = async (silent = false) => {
    if (!id) return;

    try {
      if (!silent) setLoading(true);
      setRefreshing(silent);

      const [progressData, pagesData] = await Promise.all([
        api.getAudit(id),
        api.getAuditPages(
          id,
          page,
          50,
          {
            issue_type: issueTypeFilter || undefined,
            min_score: minScoreFilter ? parseInt(minScoreFilter) : undefined,
          }
        ),
      ]);

      setProgress(progressData);
      setPages(pagesData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Daten');
      console.error('Error loading audit:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleExport = async () => {
    if (!id) return;

    try {
      const blob = await api.exportAuditCsv(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Fehler beim Exportieren des Audits');
      console.error('Error exporting audit:', err);
    }
  };

  if (loading && !progress) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error && !progress) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
            <Button onClick={() => navigate('/audits')} className="mt-4">
              Zurück zu Audits
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!progress) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => navigate('/audits')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={progress.audit.status !== 'completed'}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>
          <Button
            variant="outline"
            onClick={() => loadData()}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Aktualisieren
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Details</CardTitle>
          <CardDescription>{progress.audit.sitemap_url}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressComponent
            total={progress.progress.total}
            completed={progress.progress.completed}
            failed={progress.progress.failed}
            pending={progress.progress.pending}
            percentage={progress.progress.percentage}
          />
        </CardContent>
      </Card>

      {pages && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Seiten</CardTitle>
              <CardDescription>
                Gefundene Seiten mit Qualitätsbewertung
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label htmlFor="issue-type-filter">Issue-Typ filtern</Label>
                    <Input
                      id="issue-type-filter"
                      placeholder="z.B. grammar, redundancy..."
                      value={issueTypeFilter}
                      onChange={(e) => setIssueTypeFilter(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="min-score-filter">Mindest-Score</Label>
                    <Input
                      id="min-score-filter"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="z.B. 50"
                      value={minScoreFilter}
                      onChange={(e) => setMinScoreFilter(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              {pages.pages.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Keine Seiten gefunden
                </p>
              ) : (
                <AuditTable pages={pages.pages} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

