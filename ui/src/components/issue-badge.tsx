import { cn } from '@/lib/utils';

type IssueType = 'grammar' | 'redundancy' | 'contradiction' | 'placeholder' | 'empty';

interface IssueBadgeProps {
  type: IssueType;
  className?: string;
}

const issueTypeLabels: Record<IssueType, string> = {
  grammar: 'Grammatik',
  redundancy: 'Redundanz',
  contradiction: 'Widerspruch',
  placeholder: 'Platzhalter',
  empty: 'Leer',
};

const issueTypeColors: Record<IssueType, string> = {
  grammar: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  redundancy: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  contradiction: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  placeholder: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  empty: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export function IssueBadge({ type, className }: IssueBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        issueTypeColors[type],
        className
      )}
    >
      {issueTypeLabels[type]}
    </span>
  );
}

