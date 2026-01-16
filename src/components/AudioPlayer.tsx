import { useState, useRef, useEffect, forwardRef } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  src: string;
  className?: string;
  variant?: 'sent' | 'received';
}

export const AudioPlayer = forwardRef<HTMLDivElement, AudioPlayerProps>(
  function AudioPlayer({ src, className, variant = 'received' }, ref) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const handleLoadedMetadata = () => {
        setDuration(audio.duration);
        setIsLoaded(true);
      };

      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };

      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
      };
    }, []);

    const togglePlay = () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * duration;
      
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    };

    const formatTime = (time: number) => {
      if (!isFinite(time) || isNaN(time)) return '0:00';
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // Styles based on variant - both use white for good contrast on colored backgrounds
    const buttonStyles = 'bg-white/25 hover:bg-white/35';
    const iconStyles = 'text-white';
    const progressBgStyles = 'bg-white/30';
    const progressFillStyles = 'bg-white';
    const thumbStyles = 'bg-white';
    const timeStyles = 'text-white/80';
    const micStyles = 'text-white/60';

    return (
      <div ref={ref} className={cn('flex items-center gap-3 min-w-[200px]', className)}>
        <audio ref={audioRef} src={src} preload="metadata" />
        
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className={cn(
            'flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-colors',
            buttonStyles
          )}
        >
          {isPlaying ? (
            <Pause className={cn('h-5 w-5', iconStyles)} />
          ) : (
            <Play className={cn('h-5 w-5 ml-0.5', iconStyles)} />
          )}
        </button>

        {/* Progress Bar and Time */}
        <div className="flex-1 flex flex-col gap-1">
          <div 
            onClick={handleProgressClick}
            className={cn('relative h-1.5 rounded-full cursor-pointer group', progressBgStyles)}
          >
            {/* Progress Fill */}
            <div 
              className={cn('absolute left-0 top-0 h-full rounded-full transition-all', progressFillStyles)}
              style={{ width: `${progress}%` }}
            />
            
            {/* Thumb */}
            <div 
              className={cn('absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity', thumbStyles)}
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
          
          {/* Time */}
          <div className={cn('flex justify-between text-xs', timeStyles)}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Mic Icon */}
        <Mic className={cn('h-4 w-4 flex-shrink-0', micStyles)} />
      </div>
    );
  }
);
