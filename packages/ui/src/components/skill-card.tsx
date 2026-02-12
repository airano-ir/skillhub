import { Star, Download, Shield, CheckCircle } from 'lucide-react';

import { cn } from '../lib/utils.js';
import { Card, CardContent, CardFooter, CardHeader } from './card.js';
import { Badge } from './badge.js';

export interface SkillCardProps {
  id: string;
  name: string;
  description: string;
  githubStars?: number;
  downloadCount?: number;
  securityScore?: number;
  isVerified?: boolean;
  platforms?: string[];
  className?: string;
  onClick?: () => void;
}

export function SkillCard({
  name,
  description,
  githubStars = 0,
  downloadCount = 0,
  securityScore,
  isVerified = false,
  platforms = [],
  className,
  onClick,
}: SkillCardProps) {
  const getSecurityColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{name}</h3>
            {isVerified && <CheckCircle className="h-4 w-4 text-green-500" />}
          </div>
          {securityScore !== undefined && (
            <div className={cn('flex items-center gap-1', getSecurityColor(securityScore))}>
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">{securityScore}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pb-2">
        <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>

        {platforms.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {platforms.map((platform) => (
              <Badge key={platform} variant="secondary" className="text-xs">
                {platform}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4" />
            <span>{formatNumber(githubStars)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Download className="h-4 w-4" />
            <span>{formatNumber(downloadCount)}</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
