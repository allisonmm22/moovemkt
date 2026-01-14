import { Menu, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificacoesDropdown } from '@/components/NotificacoesDropdown';

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-card border-b border-border flex items-center justify-between px-4 md:hidden">
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onMenuClick}
          className="h-10 w-10"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-lg text-foreground">ZapCRM</span>
      </div>
      
      <div className="flex items-center gap-2">
        <NotificacoesDropdown />
      </div>
    </header>
  );
}
