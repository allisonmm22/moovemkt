import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Bot, 
  Kanban, 
  Calendar,
  Users,
  UserCog,
  Plug,
  Puzzle,
  Settings,
  LogOut,
  ChevronDown,
  CreditCard,
  Megaphone,
  LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface SubItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

interface MenuItem {
  icon: LucideIcon;
  label: string;
  path?: string;
  subItems?: SubItem[];
}

const menuItems: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: MessageSquare, label: 'Conversas', path: '/conversas' },
  { icon: Bot, label: 'Agente IA', path: '/agente-ia' },
  { icon: Kanban, label: 'CRM', path: '/crm' },
  { icon: Calendar, label: 'Agendamentos', path: '/agendamentos' },
  { icon: Users, label: 'Contatos', path: '/contatos' },
  { icon: Plug, label: 'Conexão', path: '/conexao' },
  { icon: CreditCard, label: 'Minha Assinatura', path: '/minha-assinatura' },
  { 
    icon: Settings, 
    label: 'Configurações',
    subItems: [
      { icon: Settings, label: 'Geral', path: '/configuracoes' },
      { icon: UserCog, label: 'Usuários', path: '/usuarios' },
      { icon: Puzzle, label: 'Integrações', path: '/integracoes' },
      { icon: Megaphone, label: 'Anúncios Meta', path: '/relatorios/anuncios' },
    ]
  },
];

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  const { usuario, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [configExpanded, setConfigExpanded] = useState(false);

  // Auto-expand config menu when on a config submenu route
  useEffect(() => {
    const configPaths = ['/configuracoes', '/usuarios', '/integracoes', '/relatorios/anuncios'];
    if (configPaths.some(path => location.pathname.startsWith(path))) {
      setConfigExpanded(true);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0 bg-sidebar">
        <SheetHeader className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sidebar-foreground font-bold text-xl">
              ZapCRM
            </SheetTitle>
          </div>
        </SheetHeader>
        
        <div className="flex flex-col h-[calc(100%-65px)]">
          {/* Menu Items */}
          <nav className="flex-1 py-4 overflow-y-auto">
            {menuItems.map((item) => {
              if (item.subItems) {
                const isAnySubActive = item.subItems.some(sub => location.pathname === sub.path);
                
                return (
                  <Collapsible
                    key={item.label}
                    open={configExpanded}
                    onOpenChange={setConfigExpanded}
                    className="mx-2"
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-colors",
                          isAnySubActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="font-medium flex-1 text-left">{item.label}</span>
                        <ChevronDown className={cn(
                          'h-4 w-4 transition-transform duration-200',
                          configExpanded && 'rotate-180'
                        )} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                      {item.subItems.map(sub => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <NavLink
                            key={sub.path}
                            to={sub.path}
                            onClick={() => onOpenChange(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                              isSubActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                            )}
                          >
                            <sub.icon className="h-4 w-4" />
                            <span>{sub.label}</span>
                          </NavLink>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path!}
                  onClick={() => onOpenChange(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* User Info & Logout */}
          <div className="border-t border-sidebar-border p-4">
            <button
              onClick={() => {
                navigate('/perfil');
                onOpenChange(false);
              }}
              className="flex items-center gap-3 mb-4 w-full rounded-lg hover:bg-sidebar-accent/50 p-2 -m-2 transition-colors"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={usuario?.avatar_url || ''} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {usuario?.nome?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {usuario?.nome || 'Usuário'}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {usuario?.email || ''}
                </p>
              </div>
            </button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/50"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
              <span>Sair</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
