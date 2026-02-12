import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

import { cn } from '../lib/utils.js';
import { Badge } from './badge.js';

export interface SecurityBadgeProps {
  score: number;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SecurityBadge({
  score,
  showScore = true,
  size = 'md',
  className,
}: SecurityBadgeProps) {
  const { Icon, color, label, variant } = getSecurityInfo(score);

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <Badge variant={variant as 'default' | 'success' | 'warning' | 'destructive'} className={cn('gap-1', className)}>
      <Icon className={cn(sizeClasses[size], color)} />
      {showScore ? (
        <span>{score}/100</span>
      ) : (
        <span>{label}</span>
      )}
    </Badge>
  );
}

function getSecurityInfo(score: number): {
  Icon: typeof Shield;
  color: string;
  label: string;
  variant: string;
} {
  if (score >= 90) {
    return {
      Icon: ShieldCheck,
      color: 'text-green-600',
      label: 'Excellent',
      variant: 'success',
    };
  }
  if (score >= 70) {
    return {
      Icon: Shield,
      color: 'text-yellow-600',
      label: 'Good',
      variant: 'warning',
    };
  }
  if (score >= 50) {
    return {
      Icon: ShieldAlert,
      color: 'text-orange-600',
      label: 'Fair',
      variant: 'warning',
    };
  }
  return {
    Icon: ShieldX,
    color: 'text-red-600',
    label: 'Poor',
    variant: 'destructive',
  };
}

export function SecurityScoreBar({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">Security Score</span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all', getColor())}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
