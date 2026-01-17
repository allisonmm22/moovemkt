import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2, LogOut, Settings, CreditCard, Wallet, Activity, Archive } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: Building2, label: 'Contas', path: '/admin/contas' },
  { icon: CreditCard, label: 'Planos', path: '/admin/planos' },
  { icon: Wallet, label: 'Pagamentos', path: '/admin/pagamentos' },
  { icon: Activity, label: 'Performance', path: '/admin/performance' },
  { icon: Archive, label: 'Histórico Arquivado', path: '/admin/historico-arquivado' },
];

export default function AdminSidebar() {
  const { signOut } = useAuth();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Super Admin</h1>
        <p className="text-sm text-muted-foreground">Painel Administrativo</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/admin'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border space-y-1">
        <NavLink
          to="/dashboard"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings className="h-5 w-5" />
          <span>Ir para CRM</span>
        </NavLink>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
