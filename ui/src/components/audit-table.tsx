import { useState } from 'react';
import { AuditPage, AuditIssue } from '@/lib/serverComm';
import { ScoreIndicator } from './score-indicator';
import { IssueBadge } from './issue-badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ChevronDown, ChevronRight, ExternalLink, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditTableProps {
  pages: AuditPage[];
  className?: string;
}

export function AuditTable({ pages, className }: AuditTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (pageId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(pageId)) {
      newExpanded.delete(pageId);
    } else {
      newExpanded.add(pageId);
    }
    setExpandedRows(newExpanded);
  };

  // Sort pages: completed/failed first, then analyzing, then crawling, then pending
  const sortedPages = [...pages].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      completed: 0,
      failed: 1,
      analyzing: 2,
      crawling: 3,
      pending: 4,
    };
    return (statusOrder[a.status] || 999) - (statusOrder[b.status] || 999);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Abgeschlossen
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
            <XCircle className="h-3 w-3 mr-1" />
            Fehler
          </Badge>
        );
      case 'analyzing':
        return (
          <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Analysiert
          </Badge>
        );
      case 'crawling':
        return (
          <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Crawling
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300">
            <Clock className="h-3 w-3 mr-1" />
            Ausstehend
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {sortedPages.map((page) => {
        const isExpanded = expandedRows.has(page.id);
        const hasIssues = page.issues && page.issues.length > 0;

        return (
          <Card key={page.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleRow(page.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <CardTitle className="text-base">
                      {page.title || 'Ohne Titel'}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:underline"
                    >
                      {page.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(page.status)}
                    {page.status === 'completed' && (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Score</div>
                          <ScoreIndicator score={page.quality_score} />
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Issues</div>
                          <div className="text-sm font-medium">
                            {page.issue_count || 0}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent className="pt-0">
                {page.error_message ? (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <strong>Fehler:</strong> {page.error_message}
                  </div>
                ) : hasIssues ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Gefundene Probleme:</h4>
                    {page.issues!.map((issue: AuditIssue) => (
                      <div
                        key={issue.id}
                        className="rounded-md border p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <IssueBadge type={issue.issue_type} />
                          <span
                            className={cn(
                              'text-xs font-medium',
                              issue.severity === 'high'
                                ? 'text-red-600 dark:text-red-400'
                                : issue.severity === 'medium'
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-muted-foreground'
                            )}
                          >
                            {issue.severity === 'high'
                              ? 'Hoch'
                              : issue.severity === 'medium'
                              ? 'Mittel'
                              : 'Niedrig'}
                          </span>
                        </div>
                        <p className="text-sm">{issue.description}</p>
                        <div className="rounded bg-muted p-2 text-xs">
                          <strong>Snippet:</strong> {issue.snippet}
                        </div>
                        {issue.suggestion && (
                          <div className="rounded bg-green-50 dark:bg-green-900/20 p-2 text-xs">
                            <strong>Vorschlag:</strong> {issue.suggestion}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Keine Probleme gefunden. ✅
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

