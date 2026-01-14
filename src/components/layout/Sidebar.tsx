import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Megaphone,
  CreditCard,
  LucideIcon,
} from 'lucide-react';
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

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, signOut } = useAuth();

  // Auto-expand config menu when on a config submenu route
  useEffect(() => {
    const configPaths = ['/configuracoes', '/usuarios', '/integracoes', '/relatorios/anuncios'];
    if (configPaths.some(path => location.pathname.startsWith(path))) {
      setConfigExpanded(true);
    }
  }, [location.pathname]);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen transition-all duration-300',
        'bg-sidebar border-r border-sidebar-border',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <MessageSquare className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">ZapCRM</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 text-sidebar-foreground" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-sidebar-foreground" />
          )}
        </button>
      </div>

      {/* Menu */}
      <nav className="flex flex-col gap-1 p-2">
        {menuItems.map((item) => {
          if (item.subItems) {
            const isAnySubActive = item.subItems.some(sub => location.pathname === sub.path);
            
            return (
              <div key={item.label} className="flex flex-col">
                <button
                  onClick={() => setConfigExpanded(!configExpanded)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 w-full',
                    'hover:bg-sidebar-accent',
                    isAnySubActive && 'bg-primary/10 text-primary',
                    !isAnySubActive && 'text-sidebar-foreground'
                  )}
                >
                  <item.icon className={cn('h-5 w-5 flex-shrink-0', isAnySubActive && 'text-primary')} />
                  {!collapsed && (
                    <>
                      <span className={cn('text-sm font-medium flex-1 text-left', isAnySubActive && 'text-primary')}>
                        {item.label}
                      </span>
                      <ChevronDown className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        configExpanded && 'rotate-180'
                      )} />
                    </>
                  )}
                </button>
                
                {configExpanded && !collapsed && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                    {item.subItems.map(sub => {
                      const isSubActive = location.pathname === sub.path;
                      return (
                        <NavLink
                          key={sub.path}
                          to={sub.path}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                            isSubActive ? 'text-primary bg-primary/5' : 'text-sidebar-foreground hover:bg-sidebar-accent'
                          )}
                        >
                          <sub.icon className={cn('h-4 w-4', isSubActive && 'text-primary')} />
                          <span>{sub.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path!}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200',
                'hover:bg-sidebar-accent',
                isActive && 'bg-primary/10 text-primary',
                !isActive && 'text-sidebar-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-primary')} />
              {!collapsed && (
                <span className={cn('text-sm font-medium', isActive && 'text-primary')}>
                  {item.label}
                </span>
              )}
              {isActive && !collapsed && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-sidebar-border p-2">
        {!collapsed && usuario && (
          <button
            onClick={() => navigate('/perfil')}
            className="mb-2 px-3 py-2 w-full text-left rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            <p className="text-sm font-medium text-foreground truncate">{usuario.nome}</p>
            <p className="text-xs text-muted-foreground truncate">{usuario.email}</p>
          </button>
        )}
        <button
          onClick={signOut}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
            'text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive'
          )}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
}
