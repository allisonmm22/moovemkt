import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Megaphone, TrendingUp, Users, Trophy, XCircle, 
  BarChart3, ArrowRight, ExternalLink, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ContatoComAnuncio {
  id: string;
  nome: string;
  telefone: string;
  created_at: string;
  metadata: {
    origem_anuncio?: {
      ad_id?: string;
      ad_title?: string;
      ad_body?: string;
      ad_source?: string;
      captured_at?: string;
    };
  } | null;
}

interface Negociacao {
  id: string;
  contato_id: string;
  status: 'aberto' | 'ganho' | 'perdido' | null;
  valor: number | null;
}

interface AnuncioStats {
  ad_id: string;
  ad_title: string;
  leads: number;
  negociacoes: number;
  ganhas: number;
  perdidas: number;
  abertas: number;
  valorTotal: number;
  valorGanho: number;
  taxaConversao: number;
  primeiroLead: string;
  ultimoLead: string;
}

export default function RelatorioAnuncios() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [contatos, setContatos] = useState<ContatoComAnuncio[]>([]);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchData();
    }
  }, [usuario?.conta_id, periodo]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Calcular data de início baseado no período
      let dataInicio: string | null = null;
      const hoje = new Date();
      
      if (periodo !== 'all') {
        const dias = periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90;
        const dataLimite = new Date(hoje);
        dataLimite.setDate(dataLimite.getDate() - dias);
        dataInicio = dataLimite.toISOString();
      }

      // Buscar contatos com origem de anúncio
      let contatosQuery = supabase
        .from('contatos')
        .select('id, nome, telefone, created_at, metadata')
        .eq('conta_id', usuario!.conta_id)
        .not('metadata->origem_anuncio', 'is', null);
      
      if (dataInicio) {
        contatosQuery = contatosQuery.gte('created_at', dataInicio);
      }

      const { data: contatosData, error: contatosError } = await contatosQuery;

      if (contatosError) throw contatosError;

      // Filtrar apenas contatos que realmente têm origem_anuncio
      const contatosComAnuncio = (contatosData || []).filter(
        (c: any) => c.metadata?.origem_anuncio
      ) as ContatoComAnuncio[];

      setContatos(contatosComAnuncio);

      // Buscar negociações desses contatos
      if (contatosComAnuncio.length > 0) {
        const contatoIds = contatosComAnuncio.map(c => c.id);
        
        const { data: negociacoesData, error: negociacoesError } = await supabase
          .from('negociacoes')
          .select('id, contato_id, status, valor')
          .in('contato_id', contatoIds);

        if (negociacoesError) throw negociacoesError;
        setNegociacoes(negociacoesData || []);
      } else {
        setNegociacoes([]);
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Agrupar por anúncio e calcular métricas
  const anuncioStats = useMemo(() => {
    const statsMap = new Map<string, AnuncioStats>();

    contatos.forEach(contato => {
      const adInfo = contato.metadata?.origem_anuncio;
      if (!adInfo) return;

      const adKey = adInfo.ad_id || adInfo.ad_title || 'unknown';
      const existing = statsMap.get(adKey);

      // Negociações deste contato
      const negociacoesContato = negociacoes.filter(n => n.contato_id === contato.id);
      const ganhas = negociacoesContato.filter(n => n.status === 'ganho');
      const perdidas = negociacoesContato.filter(n => n.status === 'perdido');
      const abertas = negociacoesContato.filter(n => n.status === 'aberto');
      const valorTotal = negociacoesContato.reduce((sum, n) => sum + (n.valor || 0), 0);
      const valorGanho = ganhas.reduce((sum, n) => sum + (n.valor || 0), 0);

      if (existing) {
        existing.leads += 1;
        existing.negociacoes += negociacoesContato.length;
        existing.ganhas += ganhas.length;
        existing.perdidas += perdidas.length;
        existing.abertas += abertas.length;
        existing.valorTotal += valorTotal;
        existing.valorGanho += valorGanho;
        
        const contatoDate = adInfo.captured_at || contato.created_at;
        if (contatoDate < existing.primeiroLead) existing.primeiroLead = contatoDate;
        if (contatoDate > existing.ultimoLead) existing.ultimoLead = contatoDate;
      } else {
        const contatoDate = adInfo.captured_at || contato.created_at;
        statsMap.set(adKey, {
          ad_id: adInfo.ad_id || '',
          ad_title: adInfo.ad_title || 'Anúncio sem título',
          leads: 1,
          negociacoes: negociacoesContato.length,
          ganhas: ganhas.length,
          perdidas: perdidas.length,
          abertas: abertas.length,
          valorTotal,
          valorGanho,
          taxaConversao: 0,
          primeiroLead: contatoDate,
          ultimoLead: contatoDate,
        });
      }
    });

    // Calcular taxa de conversão
    statsMap.forEach(stats => {
      if (stats.negociacoes > 0) {
        stats.taxaConversao = (stats.ganhas / stats.negociacoes) * 100;
      }
    });

    return Array.from(statsMap.values()).sort((a, b) => b.leads - a.leads);
  }, [contatos, negociacoes]);

  // Métricas globais
  const metricas = useMemo(() => {
    const totalLeads = contatos.length;
    const totalNegociacoes = negociacoes.length;
    const totalGanhas = negociacoes.filter(n => n.status === 'ganho').length;
    const totalPerdidas = negociacoes.filter(n => n.status === 'perdido').length;
    const valorTotal = negociacoes.reduce((sum, n) => sum + (n.valor || 0), 0);
    const valorGanho = negociacoes.filter(n => n.status === 'ganho').reduce((sum, n) => sum + (n.valor || 0), 0);
    const taxaConversao = totalNegociacoes > 0 ? (totalGanhas / totalNegociacoes) * 100 : 0;

    return {
      totalLeads,
      totalNegociacoes,
      totalGanhas,
      totalPerdidas,
      valorTotal,
      valorGanho,
      taxaConversao,
      anuncios: anuncioStats.length,
    };
  }, [contatos, negociacoes, anuncioStats]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
              <Megaphone className="h-7 w-7 text-purple-500" />
              Relatório de Anúncios Meta
            </h1>
            <p className="text-muted-foreground mt-1">
              Acompanhe o desempenho dos leads vindos de campanhas Meta Ads
            </p>
          </div>

          <Select value={periodo} onValueChange={(v: any) => setPeriodo(v)}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contatos.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-12 text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum lead de anúncio encontrado</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Quando leads entrarem através de anúncios "Click to WhatsApp" da Meta, 
              os dados aparecerão automaticamente aqui.
            </p>
          </div>
        ) : (
          <>
            {/* Cards de Métricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                  <Users className="h-4 w-4" />
                  Total de Leads
                </div>
                <p className="text-2xl font-bold text-foreground">{metricas.totalLeads}</p>
                <p className="text-xs text-purple-400 mt-1">
                  de {metricas.anuncios} anúncio{metricas.anuncios !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                  <BarChart3 className="h-4 w-4" />
                  Negociações
                </div>
                <p className="text-2xl font-bold text-foreground">{metricas.totalNegociacoes}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricas.totalGanhas} ganhas · {metricas.totalPerdidas} perdidas
                </p>
              </div>

              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                  <TrendingUp className="h-4 w-4" />
                  Taxa de Conversão
                </div>
                <p className="text-2xl font-bold text-emerald-500">{metricas.taxaConversao.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">negociações ganhas</p>
              </div>

              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                  <Trophy className="h-4 w-4" />
                  Valor Ganho
                </div>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(metricas.valorGanho)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  de {formatCurrency(metricas.valorTotal)} total
                </p>
              </div>
            </div>

            {/* Tabela de Anúncios */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Desempenho por Anúncio</h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 text-xs text-muted-foreground uppercase">
                      <th className="text-left px-4 py-3 font-medium">Anúncio</th>
                      <th className="text-center px-4 py-3 font-medium">Leads</th>
                      <th className="text-center px-4 py-3 font-medium">Negociações</th>
                      <th className="text-center px-4 py-3 font-medium">
                        <span className="flex items-center justify-center gap-1">
                          <Trophy className="h-3 w-3 text-emerald-500" />
                          Ganhas
                        </span>
                      </th>
                      <th className="text-center px-4 py-3 font-medium">
                        <span className="flex items-center justify-center gap-1">
                          <XCircle className="h-3 w-3 text-red-500" />
                          Perdidas
                        </span>
                      </th>
                      <th className="text-center px-4 py-3 font-medium">Conversão</th>
                      <th className="text-right px-4 py-3 font-medium">Valor Ganho</th>
                      <th className="text-center px-4 py-3 font-medium">Período</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {anuncioStats.map((stats, index) => (
                      <tr key={stats.ad_id || index} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/10 rounded-lg shrink-0">
                              <Megaphone className="h-4 w-4 text-purple-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                                {stats.ad_title}
                              </p>
                              {stats.ad_id && (
                                <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                                  {stats.ad_id}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-semibold text-foreground">{stats.leads}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-foreground">{stats.negociacoes}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-500">
                            {stats.ganhas}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/10 text-red-500">
                            {stats.perdidas}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-medium ${stats.taxaConversao >= 50 ? 'text-emerald-500' : stats.taxaConversao >= 25 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                            {stats.taxaConversao.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-medium text-foreground">
                            {formatCurrency(stats.valorGanho)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-xs text-muted-foreground">
                            <p>{format(new Date(stats.primeiroLead), 'dd/MM', { locale: ptBR })}</p>
                            <p className="flex items-center justify-center gap-1">
                              <ArrowRight className="h-3 w-3" />
                              {format(new Date(stats.ultimoLead), 'dd/MM', { locale: ptBR })}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lista de Leads Recentes */}
            <div className="bg-card rounded-2xl border border-border">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Leads Recentes de Anúncios</h2>
                <span className="text-xs text-muted-foreground">Últimos 10</span>
              </div>
              
              <div className="divide-y divide-border">
                {contatos.slice(0, 10).map(contato => {
                  const adInfo = contato.metadata?.origem_anuncio;
                  const contatoNegociacoes = negociacoes.filter(n => n.contato_id === contato.id);
                  
                  return (
                    <div 
                      key={contato.id}
                      className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/conversas?contato=${contato.id}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                            {contato.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{contato.nome}</p>
                            <p className="text-xs text-muted-foreground">{contato.telefone}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-purple-400 truncate max-w-[150px]">
                              {adInfo?.ad_title || 'Anúncio Meta'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(adInfo?.captured_at || contato.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                          
                          {contatoNegociacoes.length > 0 && (
                            <div className="flex items-center gap-1">
                              {contatoNegociacoes.some(n => n.status === 'ganho') && (
                                <span className="p-1 bg-emerald-500/10 rounded">
                                  <Trophy className="h-3 w-3 text-emerald-500" />
                                </span>
                              )}
                              {contatoNegociacoes.some(n => n.status === 'aberto') && (
                                <span className="p-1 bg-blue-500/10 rounded">
                                  <BarChart3 className="h-3 w-3 text-blue-500" />
                                </span>
                              )}
                            </div>
                          )}
                          
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
