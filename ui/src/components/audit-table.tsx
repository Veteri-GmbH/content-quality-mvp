import { useState } from 'react';
import { AuditPage, AuditIssue } from '@/lib/serverComm';
import { ScoreIndicator } from './score-indicator';
import { IssueBadge } from './issue-badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
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

  return (
    <div className={cn('space-y-4', className)}>
      {pages.map((page) => {
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
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className={cn('text-sm font-medium', getStatusColor(page.status))}>
                      {getStatusLabel(page.status)}
                    </div>
                  </div>
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

