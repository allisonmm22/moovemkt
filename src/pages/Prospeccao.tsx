import { MainLayout } from '@/components/layout/MainLayout';
import { Target, Zap, Users, MessageSquare } from 'lucide-react';

export default function Prospeccao() {
  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Prospecção</h1>
          <p className="text-muted-foreground mt-1">
            Automatize sua captação de leads e alcance mais clientes.
          </p>
        </div>

        {/* Coming Soon */}
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/20 mx-auto mb-6">
            <Target className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Em breve</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            O módulo de prospecção está sendo desenvolvido. Em breve você poderá captar leads
            automaticamente.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
            {[
              {
                icon: Zap,
                title: 'Automação',
                desc: 'Disparo automático de mensagens',
              },
              {
                icon: Users,
                title: 'Segmentação',
                desc: 'Importe e organize leads',
              },
              {
                icon: MessageSquare,
                title: 'Campanhas',
                desc: 'Crie campanhas de alcance',
              },
            ].map((feature, i) => (
              <div key={i} className="p-4 rounded-xl bg-muted/50">
                <feature.icon className="h-8 w-8 text-primary mb-3 mx-auto" />
                <h3 className="font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
