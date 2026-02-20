import { Loader2, ArrowDown } from 'lucide-react';

export default function PullToRefresh({ pulling, pullDistance, refreshing, triggered }) {
  if (!pulling) return null;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-opacity"
      style={{
        height: `${pullDistance}px`,
        opacity: Math.min(pullDistance / 50, 1),
      }}
    >
      <div
        className={`rounded-full p-2 transition-colors ${
          triggered || refreshing
            ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
            : 'bg-gray-100 dark:bg-navy-800 text-gray-400 dark:text-gray-500'
        }`}
      >
        {refreshing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ArrowDown
            className="h-5 w-5 transition-transform duration-150"
            style={{ transform: triggered ? 'rotate(180deg)' : 'none' }}
          />
        )}
      </div>
    </div>
  );
}
