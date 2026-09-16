import React from 'react';

interface RiskBadgeProps {
  level: string | null | undefined;
  score?: number;
  count?: number;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, score, count }) => {
  const normLevel = (level || 'LOW').toUpperCase();
  
  let badgeStyle = 'bg-lime-100 text-lime-800 border-lime-300/80';
  let dotStyle = 'bg-lime-600';

  if (normLevel === 'MEDIUM') {
    badgeStyle = 'bg-amber-100 text-amber-800 border-amber-300/80';
    dotStyle = 'bg-amber-600';
  } else if (normLevel === 'HIGH') {
    badgeStyle = 'bg-orange-100 text-orange-800 border-orange-300/80';
    dotStyle = 'bg-orange-600';
  } else if (normLevel === 'CRITICAL') {
    badgeStyle = 'bg-red-100 text-red-800 border-red-300/80 font-bold';
    dotStyle = 'bg-red-600';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border shadow-xs ${badgeStyle}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
      {normLevel} {score !== undefined ? `(${score.toFixed(1)})` : count !== undefined ? `(${count})` : ''}
    </span>
  );
};
