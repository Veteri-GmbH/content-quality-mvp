import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type AuditProgress, type AuditPagesResponse } from '@/lib/serverComm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditProgress as ProgressComponent } from '@/components/audit-progress';
import { AuditTable } from '@/components/audit-table';
import { ArrowLeft, Download, RefreshCw, CheckCircle2, XCircle, Loader2, Radio, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const REFRESH_INTERVAL = 5000; // 5 seconds

type AuditStatus = 'pending' | 'crawling' | 'analyzing' | 'completed' | 'failed';

interface StatusConfig {
  label: string;
  description: (progress: AuditProgress) => string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  borderColor: string;
  pulse?: boolean;
}

const statusConfigs: Record<AuditStatus, StatusConfig> = {
  pending: {
    label: 'Vorbereitung',
    description: () => 'Der Audit wird vorbereitet...',
    icon: <Clock className="h-5 w-5" />,
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800',
    pulse: true,
  },
  crawling: {
    label: 'Crawling',
    description: (p) => `Seiten werden gecrawlt (${p.progress.crawled} von ${p.progress.total})...`,
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-200 dark:border-amber-800',
    pulse: true,
  },
  analyzing: {
    label: 'Analyse',
    description: (p) => `Inhalte werden analysiert (${p.progress.completed} von ${p.progress.crawled} gecrawlt)...`,
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-200 dark:border-purple-800',
    pulse: true,
  },
  completed: {
    label: 'Abgeschlossen',
    description: (p) => `Alle ${p.progress.total} Seiten wurden analysiert.`,
    icon: <CheckCircle2 className="h-5 w-5" />,
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    textColor: 'text-green-700 dark:text-green-300',
    borderColor: 'border-green-200 dark:border-green-800',
    pulse: false,
  },
  failed: {
    label: 'Fehlgeschlagen',
    description: () => 'Der Audit ist fehlgeschlagen.',
    icon: <XCircle className="h-5 w-5" />,
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-200 dark:border-red-800',
    pulse: false,
  },
};

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
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(REFRESH_INTERVAL / 1000);
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState(false);

  const loadData = useCallback(async (silent = false) => {
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
      setSecondsUntilRefresh(REFRESH_INTERVAL / 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Daten');
      console.error('Error loading audit:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, page, issueTypeFilter, minScoreFilter]);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id, loadData]);

  // Auto-refresh for running audits
  useEffect(() => {
    if (!progress) return;
    
    const isRunning = progress.audit.status !== 'completed' && progress.audit.status !== 'failed';
    setIsAutoRefreshActive(isRunning);
    
    if (!isRunning) return;

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) return REFRESH_INTERVAL / 1000;
        return prev - 1;
      });
    }, 1000);

    // Refresh interval
    const refreshInterval = setInterval(() => {
      loadData(true);
    }, REFRESH_INTERVAL);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(refreshInterval);
    };
  }, [progress?.audit.status, loadData]);

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

  const statusConfig = statusConfigs[progress.audit.status as AuditStatus] || statusConfigs.pending;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Status Banner */}
      <Card className={cn('border-2', statusConfig.borderColor, statusConfig.bgColor)}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                'p-3 rounded-full',
                statusConfig.pulse && 'animate-pulse',
                statusConfig.textColor,
                'bg-white/50 dark:bg-black/20'
              )}>
                {statusConfig.icon}
              </div>
              <div>
                <h2 className={cn('text-lg font-semibold', statusConfig.textColor)}>
                  {statusConfig.label}
                </h2>
                <p className={cn('text-sm', statusConfig.textColor, 'opacity-80')}>
                  {statusConfig.description(progress)}
                </p>
              </div>
            </div>
            {isAutoRefreshActive && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 dark:bg-black/20">
                <Radio className="h-3 w-3 text-green-500 animate-pulse" />
                <span className="text-xs font-medium text-muted-foreground">
                  Live • Aktualisierung in {secondsUntilRefresh}s
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Aktualisieren
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Details</CardTitle>
          <CardDescription className="break-all">{progress.audit.sitemap_url}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressComponent
            total={progress.progress.total}
            completed={progress.progress.completed}
            failed={progress.progress.failed}
            pending={progress.progress.pending}
            crawling={progress.progress.crawling}
            analyzing={progress.progress.analyzing}
            crawled={progress.progress.crawled}
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
