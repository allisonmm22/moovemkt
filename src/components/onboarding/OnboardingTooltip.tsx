import React, { ReactNode } from 'react';
import { X, ChevronRight, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/contexts/OnboardingContext';

interface OnboardingTooltipProps {
  children: ReactNode;
  title: string;
  description: string;
  step: number;
  totalSteps: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
  showNextButton?: boolean;
  showSkipButton?: boolean;
  onNext?: () => void;
  isVisible: boolean;
}

export function OnboardingTooltip({
  children,
  title,
  description,
  step,
  totalSteps,
  position = 'bottom',
  showNextButton = true,
  showSkipButton = true,
  onNext,
  isVisible
}: OnboardingTooltipProps) {
  const { skipOnboarding, nextStep } = useOnboarding();

  if (!isVisible) {
    return <>{children}</>;
  }

  const positionClasses = {
    top: 'bottom-full mb-3 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-3 left-1/2 -translate-x-1/2',
    left: 'right-full mr-3 top-1/2 -translate-y-1/2',
    right: 'left-full ml-3 top-1/2 -translate-y-1/2'
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-primary',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-primary',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-primary',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-primary'
  };

  const handleNext = () => {
    if (onNext) {
      onNext();
    } else {
      nextStep();
    }
  };

  return (
    <div className="relative z-50">
      {/* Spotlight/Highlight effect */}
      <div className="relative ring-4 ring-primary/50 ring-offset-2 ring-offset-background rounded-xl animate-pulse">
        {children}
      </div>

      {/* Tooltip */}
      <div className={`absolute z-[100] w-80 ${positionClasses[position]}`}>
        {/* Arrow */}
        <div className={`absolute w-0 h-0 border-8 ${arrowClasses[position]}`} />
        
        {/* Content */}
        <div className="bg-primary text-primary-foreground rounded-xl shadow-2xl p-4 animate-in fade-in-0 zoom-in-95 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium opacity-80">
              Passo {step} de {totalSteps}
            </span>
            <button 
              onClick={skipOnboarding}
              className="p-1 hover:bg-primary-foreground/20 rounded-full transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-primary-foreground/30 rounded-full mb-3">
            <div 
              className="h-full bg-primary-foreground rounded-full transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>

          {/* Title & Description */}
          <h4 className="font-semibold text-base mb-1">{title}</h4>
          <p className="text-sm opacity-90 mb-4">{description}</p>

          {/* Actions */}
          <div className="flex items-center justify-between">
            {showSkipButton && (
              <button 
                onClick={skipOnboarding}
                className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
              >
                <SkipForward className="h-3 w-3" />
                Pular tutorial
              </button>
            )}
            
            {showNextButton && (
              <Button 
                size="sm" 
                variant="secondary"
                onClick={handleNext}
                className="ml-auto"
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
