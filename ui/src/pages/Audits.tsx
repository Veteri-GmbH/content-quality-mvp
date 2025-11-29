import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Audit } from '@/lib/serverComm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, ExternalLink, CheckCircle2, XCircle, Loader2, Clock, Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type AuditStatus = 'pending' | 'crawling' | 'analyzing' | 'completed' | 'failed';

interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  borderColor: string;
  description: string;
}

const statusConfigs: Record<AuditStatus, StatusConfig> = {
  pending: {
    label: 'Ausstehend',
    icon: <Clock className="h-3.5 w-3.5" />,
    bgColor: 'bg-blue-100 dark:bg-blue-900/40',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800',
    description: 'Der Audit wird vorbereitet',
  },
  crawling: {
    label: 'Crawling',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    bgColor: 'bg-amber-100 dark:bg-amber-900/40',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-200 dark:border-amber-800',
    description: 'Seiten werden gecrawlt',
  },
  analyzing: {
    label: 'Analyse',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    bgColor: 'bg-purple-100 dark:bg-purple-900/40',
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-200 dark:border-purple-800',
    description: 'Inhalte werden analysiert',
  },
  completed: {
    label: 'Fertig',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    bgColor: 'bg-green-100 dark:bg-green-900/40',
    textColor: 'text-green-700 dark:text-green-300',
    borderColor: 'border-green-200 dark:border-green-800',
    description: 'Audit abgeschlossen',
  },
  failed: {
    label: 'Fehler',
    icon: <XCircle className="h-3.5 w-3.5" />,
    bgColor: 'bg-red-100 dark:bg-red-900/40',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-200 dark:border-red-800',
    description: 'Audit fehlgeschlagen',
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfigs[status as AuditStatus] || statusConfigs.pending;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
              config.bgColor,
              config.textColor,
              config.borderColor
            )}
          >
            {config.icon}
            <span>{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MiniProgress({ processed, total, status }: { processed: number; total: number; status: string }) {
  const isRunning = status === 'crawling' || status === 'analyzing' || status === 'pending';
  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
  
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">
          {processed} / {total} Seiten
        </span>
        <span className={cn(
          'font-medium',
          isRunning ? 'text-primary' : 'text-muted-foreground'
        )}>
          {percentage}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            'h-full transition-all duration-500',
            status === 'completed' ? 'bg-green-500' : 
            status === 'failed' ? 'bg-red-500' : 
            'bg-primary'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function Audits() {
  const navigate = useNavigate();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAudits();
    
    // Auto-refresh every 10 seconds to update running audits
    const interval = setInterval(() => {
      loadAudits(true);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const loadAudits = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.getAudits();
      
      // Sort: running audits first, then by date
      const sorted = data.audits.sort((a, b) => {
        const aRunning = a.status === 'crawling' || a.status === 'analyzing' || a.status === 'pending';
        const bRunning = b.status === 'crawling' || b.status === 'analyzing' || b.status === 'pending';
        
        if (aRunning && !bRunning) return -1;
        if (!aRunning && bRunning) return 1;
        
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      setAudits(sorted);
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

  const runningCount = audits.filter(a => 
    a.status === 'crawling' || a.status === 'analyzing' || a.status === 'pending'
  ).length;

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

      {runningCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Radio className="h-4 w-4 text-green-500 animate-pulse" />
              <span className="text-sm font-medium">
                {runningCount} {runningCount === 1 ? 'Audit läuft' : 'Audits laufen'} gerade
              </span>
              <span className="text-xs text-muted-foreground">
                • Automatische Aktualisierung aktiv
              </span>
            </div>
          </CardContent>
        </Card>
      )}

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
          {audits.map((audit) => {
            const isRunning = audit.status === 'crawling' || audit.status === 'analyzing' || audit.status === 'pending';
            
            return (
              <Card 
                key={audit.id} 
                className={cn(
                  'hover:shadow-md transition-shadow cursor-pointer',
                  isRunning && 'border-primary/30 ring-1 ring-primary/10'
                )}
                onClick={() => navigate(`/audits/${audit.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <StatusBadge status={audit.status} />
                        {isRunning && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Radio className="h-2.5 w-2.5 text-green-500 animate-pulse" />
                            Live
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-base">
                        <a
                          href={audit.sitemap_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-1 truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="truncate">{audit.sitemap_url}</span>
                          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                        </a>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Erstellt{' '}
                        {formatDistanceToNow(new Date(audit.created_at), {
                          addSuffix: true,
                          locale: de,
                        })}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(audit.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <MiniProgress 
                      processed={audit.processed_urls} 
                      total={audit.total_urls}
                      status={audit.status}
                    />
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/audits/${audit.id}`);
                        }}
                      >
                        Details anzeigen
                      </Button>
                      {audit.status === 'completed' && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          Bereit für Export
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
