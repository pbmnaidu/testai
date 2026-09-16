import React from 'react';

interface RiskBadgeProps {
  level?: string | null;
  score?: number;
  count?: number;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, score, count }) => {
  let normLevel = (level || '').toUpperCase().trim();
  
  // Guard against missing, unassessed, or mistakenly low severity when score is >= 35
  if (!normLevel || normLevel === 'UNASSESSED' || (normLevel === 'LOW' && score !== undefined && score >= 35)) {
    if (score !== undefined) {
      if (score >= 85) normLevel = 'CRITICAL';
      else if (score >= 65) normLevel = 'HIGH';
      else if (score >= 35) normLevel = 'MEDIUM';
      else normLevel = 'LOW';
    } else {
      normLevel = 'LOW';
    }
  }

  let badgeStyle = 'bg-lime-100 text-lime-800 border-lime-300/80 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-800/60';
  let dotStyle = 'bg-lime-600 dark:bg-lime-400';

  if (normLevel === 'MEDIUM') {
    badgeStyle = 'bg-amber-100 text-amber-800 border-amber-300/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
    dotStyle = 'bg-amber-600 dark:bg-amber-400';
  } else if (normLevel === 'HIGH') {
    badgeStyle = 'bg-orange-100 text-orange-800 border-orange-300/80 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60';
    dotStyle = 'bg-orange-600 dark:bg-orange-400';
  } else if (normLevel === 'CRITICAL') {
    badgeStyle = 'bg-red-100 text-red-800 border-red-300/80 font-bold dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/80';
    dotStyle = 'bg-red-600 dark:bg-red-400';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border shadow-xs ${badgeStyle}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
      {normLevel} {score !== undefined ? `(${score.toFixed(1)})` : count !== undefined ? `(${count})` : ''}
    </span>
  );
};
