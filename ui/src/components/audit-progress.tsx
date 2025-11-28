import { cn } from '@/lib/utils';

interface AuditProgressProps {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  percentage: number;
  className?: string;
}

export function AuditProgress({
  total,
  completed,
  failed,
  pending,
  percentage,
  className,
}: AuditProgressProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Fortschritt</span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Gesamt: {total}</span>
        <span className="text-green-600 dark:text-green-400">
          Abgeschlossen: {completed}
        </span>
        {failed > 0 && (
          <span className="text-red-600 dark:text-red-400">
            Fehler: {failed}
          </span>
        )}
        {pending > 0 && (
          <span className="text-yellow-600 dark:text-yellow-400">
            Ausstehend: {pending}
          </span>
        )}
      </div>
    </div>
  );
}

