import { cn } from '@/lib/utils';

interface ScoreIndicatorProps {
  score: number | null;
  className?: string;
}

export function ScoreIndicator({ score, className }: ScoreIndicatorProps) {
  if (score === null) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        N/A
      </span>
    );
  }

  const getColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-2 py-1',
        getBgColor(score),
        className
      )}
    >
      <span className={cn('text-sm font-semibold', getColor(score))}>
        {score}
      </span>
      <span className="text-xs text-muted-foreground">/ 100</span>
    </div>
  );
}

