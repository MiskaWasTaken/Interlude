import { clsx } from 'clsx';
import { useState } from 'react';

interface AlbumArtProps {
  src: string | null | undefined;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'w-8 h-8',
  sm: 'w-12 h-12',
  md: 'w-16 h-16',
  lg: 'w-32 h-32',
  xl: 'w-48 h-48',
};

export default function AlbumArt({ src, alt, size = 'md', className }: AlbumArtProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div 
        className={clsx(
          sizeClasses[size],
          'bg-amoled-card flex items-center justify-center rounded',
          className
        )}
      >
        <svg 
          className="w-1/2 h-1/2 text-text-muted" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={clsx(sizeClasses[size], 'object-cover', className)}
      onError={() => setError(true)}
    />
  );
}
