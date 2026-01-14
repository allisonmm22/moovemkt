import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileSidebar } from './MobileSidebar';
import { BottomNavigation } from './BottomNavigation';
import { useIsMobile } from '@/hooks/use-mobile';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile && (
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} />
      )}
      
      {/* Mobile Sidebar (Drawer) */}
      <MobileSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      
      {/* Desktop Sidebar */}
      {!isMobile && <Sidebar />}
      
      {/* Main Content */}
      <main className={
        isMobile 
          ? "pt-14 pb-16 min-h-screen transition-all duration-300" 
          : "ml-64 min-h-screen p-6 transition-all duration-300"
      }>
        {children}
      </main>
      
      {/* Mobile Bottom Navigation */}
      {isMobile && <BottomNavigation />}
    </div>
  );
}
