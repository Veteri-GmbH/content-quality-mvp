import { cn } from '@/lib/utils';

interface AuditProgressProps {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  crawling?: number;
  analyzing?: number;
  crawled?: number;
  percentage: number;
  className?: string;
}

export function AuditProgress({
  total,
  completed,
  failed,
  pending,
  crawling = 0,
  analyzing = 0,
  crawled = 0,
  percentage,
  className,
}: AuditProgressProps) {
  // Calculate crawl and analyze progress separately
  const crawlPercentage = total > 0 ? Math.round((crawled / total) * 100) : 0;
  const analyzePercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  const isProcessing = crawling > 0 || analyzing > 0 || pending > 0;
  
  return (
    <div className={cn('space-y-3', className)}>
      {/* Overall Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Gesamtfortschritt</span>
          <span className="font-medium">{percentage}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      
      {/* Detailed Progress (only when processing) */}
      {isProcessing && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          {/* Crawling Progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Crawling</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{crawlPercentage}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${crawlPercentage}%` }}
              />
            </div>
          </div>
          
          {/* Analyzing Progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Analyse</span>
              <span className="font-medium text-purple-600 dark:text-purple-400">{analyzePercentage}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${analyzePercentage}%` }}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Status counts */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
        <span>Gesamt: {total}</span>
        {crawled > 0 && crawled !== completed && (
          <span className="text-amber-600 dark:text-amber-400">
            Gecrawlt: {crawled}
          </span>
        )}
        {analyzing > 0 && (
          <span className="text-purple-600 dark:text-purple-400">
            Analysiert: {analyzing}
          </span>
        )}
        <span className="text-green-600 dark:text-green-400">
          Abgeschlossen: {completed}
        </span>
        {failed > 0 && (
          <span className="text-red-600 dark:text-red-400">
            Fehler: {failed}
          </span>
        )}
        {pending > 0 && (
          <span className="text-muted-foreground">
            Ausstehend: {pending}
          </span>
        )}
      </div>
    </div>
  );
}
