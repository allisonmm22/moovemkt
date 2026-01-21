export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          concluido: boolean | null
          conta_id: string
          contato_id: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string
          descricao: string | null
          google_event_id: string | null
          google_meet_link: string | null
          id: string
          titulo: string
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          concluido?: boolean | null
          conta_id: string
          contato_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio: string
          descricao?: string | null
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          titulo: string
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          concluido?: boolean | null
          conta_id?: string
          contato_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          titulo?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "agendamentos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_ia: {
        Row: {
          atender_24h: boolean | null
          ativo: boolean | null
          conta_id: string
          created_at: string
          delay_entre_fracoes: number | null
          descricao: string | null
          dias_ativos: number[] | null
          fracionar_mensagens: boolean | null
          gatilho: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          max_tokens: number | null
          mensagem_fora_horario: string | null
          modelo: string | null
          nome: string | null
          prompt_sistema: string | null
          quantidade_mensagens_contexto: number | null
          simular_digitacao: boolean | null
          tamanho_max_fracao: number | null
          temperatura: number | null
          tempo_espera_segundos: number | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          atender_24h?: boolean | null
          ativo?: boolean | null
          conta_id: string
          created_at?: string
          delay_entre_fracoes?: number | null
          descricao?: string | null
          dias_ativos?: number[] | null
          fracionar_mensagens?: boolean | null
          gatilho?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          max_tokens?: number | null
          mensagem_fora_horario?: string | null
          modelo?: string | null
          nome?: string | null
          prompt_sistema?: string | null
          quantidade_mensagens_contexto?: number | null
          simular_digitacao?: boolean | null
          tamanho_max_fracao?: number | null
          temperatura?: number | null
          tempo_espera_segundos?: number | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          atender_24h?: boolean | null
          ativo?: boolean | null
          conta_id?: string
          created_at?: string
          delay_entre_fracoes?: number | null
          descricao?: string | null
          dias_ativos?: number[] | null
          fracionar_mensagens?: boolean | null
          gatilho?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          max_tokens?: number | null
          mensagem_fora_horario?: string | null
          modelo?: string | null
          nome?: string | null
          prompt_sistema?: string | null
          quantidade_mensagens_contexto?: number | null
          simular_digitacao?: boolean | null
          tamanho_max_fracao?: number | null
          temperatura?: number | null
          tempo_espera_segundos?: number | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_ia_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_ia_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      agent_ia_agendamento_config: {
        Row: {
          agent_ia_id: string
          antecedencia_maxima_dias: number | null
          antecedencia_minima_horas: number | null
          ativo: boolean | null
          created_at: string | null
          descricao_agendamento: string | null
          duracao_padrao: number | null
          gerar_meet: boolean | null
          google_calendar_id: string | null
          horario_fim_dia: string | null
          horario_inicio_dia: string | null
          id: string
          intervalo_entre_agendamentos: number | null
          limite_por_horario: number | null
          nome_agendamento: string | null
          prompt_consulta_horarios: string | null
          prompt_marcacao_horario: string | null
          tipo_agenda: string | null
          updated_at: string | null
        }
        Insert: {
          agent_ia_id: string
          antecedencia_maxima_dias?: number | null
          antecedencia_minima_horas?: number | null
          ativo?: boolean | null
          created_at?: string | null
          descricao_agendamento?: string | null
          duracao_padrao?: number | null
          gerar_meet?: boolean | null
          google_calendar_id?: string | null
          horario_fim_dia?: string | null
          horario_inicio_dia?: string | null
          id?: string
          intervalo_entre_agendamentos?: number | null
          limite_por_horario?: number | null
          nome_agendamento?: string | null
          prompt_consulta_horarios?: string | null
          prompt_marcacao_horario?: string | null
          tipo_agenda?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_ia_id?: string
          antecedencia_maxima_dias?: number | null
          antecedencia_minima_horas?: number | null
          ativo?: boolean | null
          created_at?: string | null
          descricao_agendamento?: string | null
          duracao_padrao?: number | null
          gerar_meet?: boolean | null
          google_calendar_id?: string | null
          horario_fim_dia?: string | null
          horario_inicio_dia?: string | null
          id?: string
          intervalo_entre_agendamentos?: number | null
          limite_por_horario?: number | null
          nome_agendamento?: string | null
          prompt_consulta_horarios?: string | null
          prompt_marcacao_horario?: string | null
          tipo_agenda?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_ia_agendamento_config_agent_ia_id_fkey"
            columns: ["agent_ia_id"]
            isOneToOne: true
            referencedRelation: "agent_ia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_ia_agendamento_config_google_calendar_id_fkey"
            columns: ["google_calendar_id"]
            isOneToOne: false
            referencedRelation: "calendarios_google"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_ia_agendamento_horarios: {
        Row: {
          ativo: boolean | null
          config_id: string
          created_at: string | null
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
        }
        Insert: {
          ativo?: boolean | null
          config_id: string
          created_at?: string | null
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
        }
        Update: {
          ativo?: boolean | null
          config_id?: string
          created_at?: string | null
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_ia_agendamento_horarios_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "agent_ia_agendamento_config"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_ia_etapas: {
        Row: {
          agent_ia_id: string
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          numero: number
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          agent_ia_id: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          numero: number
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_ia_id?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          numero?: number
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_ia_etapas_agent_ia_id_fkey"
            columns: ["agent_ia_id"]
            isOneToOne: false
            referencedRelation: "agent_ia"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_ia_perguntas: {
        Row: {
          agent_ia_id: string
          created_at: string | null
          id: string
          ordem: number | null
          pergunta: string
          resposta: string
          updated_at: string | null
        }
        Insert: {
          agent_ia_id: string
          created_at?: string | null
          id?: string
          ordem?: number | null
          pergunta: string
          resposta: string
          updated_at?: string | null
        }
        Update: {
          agent_ia_id?: string
          created_at?: string | null
          id?: string
          ordem?: number | null
          pergunta?: string
          resposta?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_ia_perguntas_agent_ia_id_fkey"
            columns: ["agent_ia_id"]
            isOneToOne: false
            referencedRelation: "agent_ia"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          ativo: boolean | null
          conta_id: string
          created_at: string | null
          id: string
          key: string
          nome: string
          ultimo_uso: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          conta_id: string
          created_at?: string | null
          id?: string
          key: string
          nome?: string
          ultimo_uso?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          conta_id?: string
          created_at?: string | null
          id?: string
          key?: string
          nome?: string
          ultimo_uso?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      atendente_config: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          usuario_id: string
          ver_todas_conversas: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          usuario_id: string
          ver_todas_conversas?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          usuario_id?: string
          ver_todas_conversas?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "atendente_config_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      calendarios_google: {
        Row: {
          access_token: string | null
          ativo: boolean | null
          calendar_id: string | null
          conta_id: string
          cor: string | null
          created_at: string | null
          email_google: string
          id: string
          nome: string
          refresh_token: string | null
          token_expiry: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          ativo?: boolean | null
          calendar_id?: string | null
          conta_id: string
          cor?: string | null
          created_at?: string | null
          email_google: string
          id?: string
          nome: string
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          ativo?: boolean | null
          calendar_id?: string | null
          conta_id?: string
          cor?: string | null
          created_at?: string | null
          email_google?: string
          id?: string
          nome?: string
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      campos_personalizados: {
        Row: {
          conta_id: string
          created_at: string
          grupo_id: string | null
          id: string
          nome: string
          obrigatorio: boolean | null
          opcoes: Json | null
          ordem: number | null
          tipo: string
          updated_at: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          grupo_id?: string | null
          id?: string
          nome: string
          obrigatorio?: boolean | null
          opcoes?: Json | null
          ordem?: number | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          grupo_id?: string | null
          id?: string
          nome?: string
          obrigatorio?: boolean | null
          opcoes?: Json | null
          ordem?: number | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campos_personalizados_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campos_personalizados_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "campos_personalizados_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "campos_personalizados_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      campos_personalizados_grupos: {
        Row: {
          conta_id: string
          created_at: string
          id: string
          nome: string
          ordem: number | null
          updated_at: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number | null
          updated_at?: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campos_personalizados_grupos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campos_personalizados_grupos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      conexoes_whatsapp: {
        Row: {
          conta_id: string
          created_at: string
          id: string
          instance_name: string
          meta_access_token: string | null
          meta_business_account_id: string | null
          meta_phone_number_id: string | null
          meta_webhook_verify_token: string | null
          nome: string
          numero: string | null
          qrcode: string | null
          status: Database["public"]["Enums"]["status_conexao"] | null
          tipo_canal: string | null
          tipo_provedor: string | null
          token: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          conta_id: string
          created_at?: string
          id?: string
          instance_name: string
          meta_access_token?: string | null
          meta_business_account_id?: string | null
          meta_phone_number_id?: string | null
          meta_webhook_verify_token?: string | null
          nome?: string
          numero?: string | null
          qrcode?: string | null
          status?: Database["public"]["Enums"]["status_conexao"] | null
          tipo_canal?: string | null
          tipo_provedor?: string | null
          token: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          conta_id?: string
          created_at?: string
          id?: string
          instance_name?: string
          meta_access_token?: string | null
          meta_business_account_id?: string | null
          meta_phone_number_id?: string | null
          meta_webhook_verify_token?: string | null
          nome?: string
          numero?: string | null
          qrcode?: string | null
          status?: Database["public"]["Enums"]["status_conexao"] | null
          tipo_canal?: string | null
          tipo_provedor?: string | null
          token?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conexoes_whatsapp_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conexoes_whatsapp_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      configuracoes_plataforma: {
        Row: {
          chave: string
          created_at: string | null
          descricao: string | null
          id: string
          updated_at: string | null
          valor: string | null
        }
        Insert: {
          chave: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          updated_at?: string | null
          valor?: string | null
        }
        Update: {
          chave?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          updated_at?: string | null
          valor?: string | null
        }
        Relationships: []
      }
      contas: {
        Row: {
          ativo: boolean | null
          cpf: string | null
          created_at: string
          id: string
          nome: string
          openai_api_key: string | null
          permitir_multiplas_negociacoes: boolean | null
          plano_id: string | null
          reabrir_com_ia: boolean | null
          stripe_cancel_at_period_end: boolean | null
          stripe_current_period_end: string | null
          stripe_current_period_start: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean | null
          cpf?: string | null
          created_at?: string
          id?: string
          nome: string
          openai_api_key?: string | null
          permitir_multiplas_negociacoes?: boolean | null
          plano_id?: string | null
          reabrir_com_ia?: boolean | null
          stripe_cancel_at_period_end?: boolean | null
          stripe_current_period_end?: string | null
          stripe_current_period_start?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean | null
          cpf?: string | null
          created_at?: string
          id?: string
          nome?: string
          openai_api_key?: string | null
          permitir_multiplas_negociacoes?: boolean | null
          plano_id?: string | null
          reabrir_com_ia?: boolean | null
          stripe_cancel_at_period_end?: boolean | null
          stripe_current_period_end?: string | null
          stripe_current_period_start?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      contato_campos_valores: {
        Row: {
          campo_id: string
          contato_id: string
          created_at: string | null
          id: string
          updated_at: string | null
          valor: string | null
        }
        Insert: {
          campo_id: string
          contato_id: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          valor?: string | null
        }
        Update: {
          campo_id?: string
          contato_id?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contato_campos_valores_campo_id_fkey"
            columns: ["campo_id"]
            isOneToOne: false
            referencedRelation: "campos_personalizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contato_campos_valores_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          avatar_url: string | null
          canal: string | null
          conta_id: string
          created_at: string
          email: string | null
          grupo_jid: string | null
          id: string
          is_grupo: boolean | null
          metadata: Json | null
          nome: string
          tags: string[] | null
          telefone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          canal?: string | null
          conta_id: string
          created_at?: string
          email?: string | null
          grupo_jid?: string | null
          id?: string
          is_grupo?: boolean | null
          metadata?: Json | null
          nome: string
          tags?: string[] | null
          telefone: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          canal?: string | null
          conta_id?: string
          created_at?: string
          email?: string | null
          grupo_jid?: string | null
          id?: string
          is_grupo?: boolean | null
          metadata?: Json | null
          nome?: string
          tags?: string[] | null
          telefone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contatos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      conversas: {
        Row: {
          agente_ia_ativo: boolean | null
          agente_ia_id: string | null
          arquivada: boolean | null
          atendente_id: string | null
          canal: string | null
          conexao_id: string | null
          conta_id: string
          contato_id: string
          created_at: string
          etapa_ia_atual: string | null
          id: string
          memoria_limpa_em: string | null
          nao_lidas: number | null
          status: Database["public"]["Enums"]["status_conversa"] | null
          ultima_mensagem: string | null
          ultima_mensagem_at: string | null
          updated_at: string
        }
        Insert: {
          agente_ia_ativo?: boolean | null
          agente_ia_id?: string | null
          arquivada?: boolean | null
          atendente_id?: string | null
          canal?: string | null
          conexao_id?: string | null
          conta_id: string
          contato_id: string
          created_at?: string
          etapa_ia_atual?: string | null
          id?: string
          memoria_limpa_em?: string | null
          nao_lidas?: number | null
          status?: Database["public"]["Enums"]["status_conversa"] | null
          ultima_mensagem?: string | null
          ultima_mensagem_at?: string | null
          updated_at?: string
        }
        Update: {
          agente_ia_ativo?: boolean | null
          agente_ia_id?: string | null
          arquivada?: boolean | null
          atendente_id?: string | null
          canal?: string | null
          conexao_id?: string | null
          conta_id?: string
          contato_id?: string
          created_at?: string
          etapa_ia_atual?: string | null
          id?: string
          memoria_limpa_em?: string | null
          nao_lidas?: number | null
          status?: Database["public"]["Enums"]["status_conversa"] | null
          ultima_mensagem?: string | null
          ultima_mensagem_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_agente_ia_id_fkey"
            columns: ["agente_ia_id"]
            isOneToOne: false
            referencedRelation: "agent_ia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_conexao_id_fkey"
            columns: ["conexao_id"]
            isOneToOne: false
            referencedRelation: "conexoes_whatsapp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "conversas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_etapa_ia_atual_fkey"
            columns: ["etapa_ia_atual"]
            isOneToOne: false
            referencedRelation: "agent_ia_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      estagios: {
        Row: {
          cor: string | null
          created_at: string
          followup_ativo: boolean | null
          funil_id: string
          id: string
          nome: string
          ordem: number | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          followup_ativo?: boolean | null
          funil_id: string
          id?: string
          nome: string
          ordem?: number | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          followup_ativo?: boolean | null
          funil_id?: string
          id?: string
          nome?: string
          ordem?: number | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estagios_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_enviados: {
        Row: {
          conversa_id: string
          enviado_em: string | null
          id: string
          mensagem_enviada: string | null
          regra_id: string
          respondido: boolean | null
          respondido_em: string | null
          tentativa: number
        }
        Insert: {
          conversa_id: string
          enviado_em?: string | null
          id?: string
          mensagem_enviada?: string | null
          regra_id: string
          respondido?: boolean | null
          respondido_em?: string | null
          tentativa?: number
        }
        Update: {
          conversa_id?: string
          enviado_em?: string | null
          id?: string
          mensagem_enviada?: string | null
          regra_id?: string
          respondido?: boolean | null
          respondido_em?: string | null
          tentativa?: number
        }
        Relationships: [
          {
            foreignKeyName: "followup_enviados_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_enviados_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "followup_regras"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_regras: {
        Row: {
          agent_ia_id: string | null
          aplicar_ia_ativa: boolean | null
          aplicar_ia_pausada: boolean | null
          ativo: boolean | null
          conta_id: string
          created_at: string | null
          estagio_ids: string[] | null
          horas_sem_resposta: number
          id: string
          intervalo_entre_tentativas: number | null
          max_tentativas: number | null
          mensagem_fixa: string | null
          nome: string
          prompt_followup: string | null
          quantidade_mensagens_contexto: number | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          agent_ia_id?: string | null
          aplicar_ia_ativa?: boolean | null
          aplicar_ia_pausada?: boolean | null
          ativo?: boolean | null
          conta_id: string
          created_at?: string | null
          estagio_ids?: string[] | null
          horas_sem_resposta?: number
          id?: string
          intervalo_entre_tentativas?: number | null
          max_tentativas?: number | null
          mensagem_fixa?: string | null
          nome: string
          prompt_followup?: string | null
          quantidade_mensagens_contexto?: number | null
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          agent_ia_id?: string | null
          aplicar_ia_ativa?: boolean | null
          aplicar_ia_pausada?: boolean | null
          ativo?: boolean | null
          conta_id?: string
          created_at?: string | null
          estagio_ids?: string[] | null
          horas_sem_resposta?: number
          id?: string
          intervalo_entre_tentativas?: number | null
          max_tentativas?: number | null
          mensagem_fixa?: string | null
          nome?: string
          prompt_followup?: string | null
          quantidade_mensagens_contexto?: number | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_regras_agent_ia_id_fkey"
            columns: ["agent_ia_id"]
            isOneToOne: false
            referencedRelation: "agent_ia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_regras_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_regras_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      followups_agendados: {
        Row: {
          agente_ia_id: string | null
          conta_id: string
          contato_id: string
          contexto: string | null
          conversa_id: string
          created_at: string | null
          criado_por: string | null
          data_agendada: string
          enviado_em: string | null
          id: string
          mensagem_enviada: string | null
          motivo: string | null
          status: string
        }
        Insert: {
          agente_ia_id?: string | null
          conta_id: string
          contato_id: string
          contexto?: string | null
          conversa_id: string
          created_at?: string | null
          criado_por?: string | null
          data_agendada: string
          enviado_em?: string | null
          id?: string
          mensagem_enviada?: string | null
          motivo?: string | null
          status?: string
        }
        Update: {
          agente_ia_id?: string | null
          conta_id?: string
          contato_id?: string
          contexto?: string | null
          conversa_id?: string
          created_at?: string | null
          criado_por?: string | null
          data_agendada?: string
          enviado_em?: string | null
          id?: string
          mensagem_enviada?: string | null
          motivo?: string | null
          status?: string
        }
        Relationships: []
      }
      funis: {
        Row: {
          conta_id: string
          cor: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number | null
          updated_at: string
        }
        Insert: {
          conta_id: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number | null
          updated_at?: string
        }
        Update: {
          conta_id?: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funis_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funis_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      lembrete_enviados: {
        Row: {
          agendamento_id: string
          contato_id: string | null
          enviado_em: string | null
          id: string
          mensagem_enviada: string | null
          regra_id: string
        }
        Insert: {
          agendamento_id: string
          contato_id?: string | null
          enviado_em?: string | null
          id?: string
          mensagem_enviada?: string | null
          regra_id: string
        }
        Update: {
          agendamento_id?: string
          contato_id?: string | null
          enviado_em?: string | null
          id?: string
          mensagem_enviada?: string | null
          regra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lembrete_enviados_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lembrete_enviados_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lembrete_enviados_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "lembrete_regras"
            referencedColumns: ["id"]
          },
        ]
      }
      lembrete_regras: {
        Row: {
          ativo: boolean | null
          conta_id: string
          created_at: string | null
          id: string
          incluir_detalhes: boolean | null
          incluir_link_meet: boolean | null
          mensagem_fixa: string | null
          minutos_antes: number
          nome: string
          prompt_lembrete: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          conta_id: string
          created_at?: string | null
          id?: string
          incluir_detalhes?: boolean | null
          incluir_link_meet?: boolean | null
          mensagem_fixa?: string | null
          minutos_antes?: number
          nome: string
          prompt_lembrete?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          conta_id?: string
          created_at?: string | null
          id?: string
          incluir_detalhes?: boolean | null
          incluir_link_meet?: boolean | null
          mensagem_fixa?: string | null
          minutos_antes?: number
          nome?: string
          prompt_lembrete?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lembrete_regras_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lembrete_regras_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      logs_atividade: {
        Row: {
          conta_id: string
          created_at: string | null
          descricao: string | null
          id: string
          metadata: Json | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          conta_id: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          metadata?: Json | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          conta_id?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          metadata?: Json | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_atividade_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_atividade_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "logs_atividade_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          conta_id: string | null
          contato_id: string | null
          conteudo: string
          conversa_id: string
          created_at: string
          deletada: boolean | null
          deletada_em: string | null
          deletada_por: string | null
          direcao: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_por_dispositivo: boolean | null
          enviada_por_ia: boolean | null
          id: string
          lida: boolean | null
          media_url: string | null
          metadata: Json | null
          tipo: Database["public"]["Enums"]["tipo_mensagem"] | null
          usuario_id: string | null
        }
        Insert: {
          conta_id?: string | null
          contato_id?: string | null
          conteudo: string
          conversa_id: string
          created_at?: string
          deletada?: boolean | null
          deletada_em?: string | null
          deletada_por?: string | null
          direcao: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_por_dispositivo?: boolean | null
          enviada_por_ia?: boolean | null
          id?: string
          lida?: boolean | null
          media_url?: string | null
          metadata?: Json | null
          tipo?: Database["public"]["Enums"]["tipo_mensagem"] | null
          usuario_id?: string | null
        }
        Update: {
          conta_id?: string | null
          contato_id?: string | null
          conteudo?: string
          conversa_id?: string
          created_at?: string
          deletada?: boolean | null
          deletada_em?: string | null
          deletada_por?: string | null
          direcao?: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_por_dispositivo?: boolean | null
          enviada_por_ia?: boolean | null
          id?: string
          lida?: boolean | null
          media_url?: string | null
          metadata?: Json | null
          tipo?: Database["public"]["Enums"]["tipo_mensagem"] | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "mensagens_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_deletada_por_fkey"
            columns: ["deletada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_arquivo: {
        Row: {
          arquivada_em: string | null
          conta_id: string | null
          contato_id: string | null
          conteudo: string
          conversa_id: string
          created_at: string
          deletada: boolean | null
          deletada_em: string | null
          deletada_por: string | null
          direcao: string
          enviada_por_dispositivo: boolean | null
          enviada_por_ia: boolean | null
          id: string
          lida: boolean | null
          media_url: string | null
          metadata: Json | null
          tipo: string | null
          usuario_id: string | null
        }
        Insert: {
          arquivada_em?: string | null
          conta_id?: string | null
          contato_id?: string | null
          conteudo: string
          conversa_id: string
          created_at: string
          deletada?: boolean | null
          deletada_em?: string | null
          deletada_por?: string | null
          direcao: string
          enviada_por_dispositivo?: boolean | null
          enviada_por_ia?: boolean | null
          id: string
          lida?: boolean | null
          media_url?: string | null
          metadata?: Json | null
          tipo?: string | null
          usuario_id?: string | null
        }
        Update: {
          arquivada_em?: string | null
          conta_id?: string | null
          contato_id?: string | null
          conteudo?: string
          conversa_id?: string
          created_at?: string
          deletada?: boolean | null
          deletada_em?: string | null
          deletada_por?: string | null
          direcao?: string
          enviada_por_dispositivo?: boolean | null
          enviada_por_ia?: boolean | null
          id?: string
          lida?: boolean | null
          media_url?: string | null
          metadata?: Json | null
          tipo?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      mensagens_processadas: {
        Row: {
          conta_id: string
          created_at: string | null
          evolution_msg_id: string
          id: string
          telefone: string
        }
        Insert: {
          conta_id: string
          created_at?: string | null
          evolution_msg_id: string
          id?: string
          telefone: string
        }
        Update: {
          conta_id?: string
          created_at?: string | null
          evolution_msg_id?: string
          id?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_processadas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_processadas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      negociacao_historico: {
        Row: {
          created_at: string
          descricao: string | null
          estagio_anterior_id: string | null
          estagio_novo_id: string | null
          id: string
          negociacao_id: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          estagio_anterior_id?: string | null
          estagio_novo_id?: string | null
          id?: string
          negociacao_id: string
          tipo?: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          estagio_anterior_id?: string | null
          estagio_novo_id?: string | null
          id?: string
          negociacao_id?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negociacao_historico_estagio_anterior_id_fkey"
            columns: ["estagio_anterior_id"]
            isOneToOne: false
            referencedRelation: "estagios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negociacao_historico_estagio_novo_id_fkey"
            columns: ["estagio_novo_id"]
            isOneToOne: false
            referencedRelation: "estagios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negociacao_historico_negociacao_id_fkey"
            columns: ["negociacao_id"]
            isOneToOne: false
            referencedRelation: "negociacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negociacao_historico_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      negociacao_notas: {
        Row: {
          conteudo: string
          created_at: string | null
          id: string
          negociacao_id: string
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          conteudo: string
          created_at?: string | null
          id?: string
          negociacao_id: string
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          conteudo?: string
          created_at?: string | null
          id?: string
          negociacao_id?: string
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negociacao_notas_negociacao_id_fkey"
            columns: ["negociacao_id"]
            isOneToOne: false
            referencedRelation: "negociacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negociacao_notas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      negociacoes: {
        Row: {
          conta_id: string
          contato_id: string
          created_at: string
          data_fechamento: string | null
          estagio_id: string | null
          id: string
          notas: string | null
          probabilidade: number | null
          responsavel_id: string | null
          resumo_gerado_em: string | null
          resumo_ia: string | null
          status: Database["public"]["Enums"]["status_negociacao"] | null
          titulo: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          conta_id: string
          contato_id: string
          created_at?: string
          data_fechamento?: string | null
          estagio_id?: string | null
          id?: string
          notas?: string | null
          probabilidade?: number | null
          responsavel_id?: string | null
          resumo_gerado_em?: string | null
          resumo_ia?: string | null
          status?: Database["public"]["Enums"]["status_negociacao"] | null
          titulo: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          conta_id?: string
          contato_id?: string
          created_at?: string
          data_fechamento?: string | null
          estagio_id?: string | null
          id?: string
          notas?: string | null
          probabilidade?: number | null
          responsavel_id?: string | null
          resumo_gerado_em?: string | null
          resumo_ia?: string | null
          status?: Database["public"]["Enums"]["status_negociacao"] | null
          titulo?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "negociacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negociacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "negociacoes_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negociacoes_estagio_id_fkey"
            columns: ["estagio_id"]
            isOneToOne: false
            referencedRelation: "estagios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negociacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          conta_id: string
          created_at: string
          id: string
          lida: boolean
          link: string | null
          mensagem: string | null
          metadata: Json | null
          tipo: string
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          conta_id: string
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          metadata?: Json | null
          tipo?: string
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          conta_id?: string
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          metadata?: Json | null
          tipo?: string
          titulo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          id: string
          limite_agentes: number
          limite_conexoes_evolution: number
          limite_conexoes_meta: number
          limite_conexoes_whatsapp: number
          limite_funis: number
          limite_mensagens_mes: number
          limite_usuarios: number
          nome: string
          permite_instagram: boolean
          preco_mensal: number | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          limite_agentes?: number
          limite_conexoes_evolution?: number
          limite_conexoes_meta?: number
          limite_conexoes_whatsapp?: number
          limite_funis?: number
          limite_mensagens_mes?: number
          limite_usuarios?: number
          nome: string
          permite_instagram?: boolean
          preco_mensal?: number | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          limite_agentes?: number
          limite_conexoes_evolution?: number
          limite_conexoes_meta?: number
          limite_conexoes_whatsapp?: number
          limite_funis?: number
          limite_mensagens_mes?: number
          limite_usuarios?: number
          nome?: string
          permite_instagram?: boolean
          preco_mensal?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          conta_id: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_agent: string | null
          usuario_id: string
        }
        Insert: {
          auth: string
          conta_id: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_agent?: string | null
          usuario_id: string
        }
        Update: {
          auth?: string
          conta_id?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_agent?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      respostas_pendentes: {
        Row: {
          conversa_id: string
          created_at: string | null
          id: string
          processando: boolean | null
          responder_em: string
        }
        Insert: {
          conversa_id: string
          created_at?: string | null
          id?: string
          processando?: boolean | null
          responder_em: string
        }
        Update: {
          conversa_id?: string
          created_at?: string | null
          id?: string
          processando?: boolean | null
          responder_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "respostas_pendentes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: true
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          conta_id: string
          cor: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          conta_id: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          conta_id?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      transferencias_atendimento: {
        Row: {
          conversa_id: string
          created_at: string
          de_usuario_id: string | null
          id: string
          motivo: string | null
          para_agente_ia: boolean | null
          para_usuario_id: string | null
        }
        Insert: {
          conversa_id: string
          created_at?: string
          de_usuario_id?: string | null
          id?: string
          motivo?: string | null
          para_agente_ia?: boolean | null
          para_usuario_id?: string | null
        }
        Update: {
          conversa_id?: string
          created_at?: string
          de_usuario_id?: string | null
          id?: string
          motivo?: string | null
          para_agente_ia?: boolean | null
          para_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_atendimento_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_atendimento_de_usuario_id_fkey"
            columns: ["de_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_atendimento_para_usuario_id_fkey"
            columns: ["para_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      uso_historico: {
        Row: {
          conta_id: string
          conversas_ativas: number | null
          created_at: string | null
          data: string
          id: string
          leads_novos: number | null
          mensagens_enviadas: number | null
          mensagens_recebidas: number | null
          usuarios_ativos: number | null
        }
        Insert: {
          conta_id: string
          conversas_ativas?: number | null
          created_at?: string | null
          data: string
          id?: string
          leads_novos?: number | null
          mensagens_enviadas?: number | null
          mensagens_recebidas?: number | null
          usuarios_ativos?: number | null
        }
        Update: {
          conta_id?: string
          conversas_ativas?: number | null
          created_at?: string | null
          data?: string
          id?: string
          leads_novos?: number | null
          mensagens_enviadas?: number | null
          mensagens_recebidas?: number | null
          usuarios_ativos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uso_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uso_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      uso_tokens: {
        Row: {
          completion_tokens: number
          conta_id: string
          conversa_id: string | null
          created_at: string | null
          custo_estimado: number | null
          id: string
          modelo: string
          prompt_tokens: number
          provider: string
          total_tokens: number
        }
        Insert: {
          completion_tokens?: number
          conta_id: string
          conversa_id?: string | null
          created_at?: string | null
          custo_estimado?: number | null
          id?: string
          modelo: string
          prompt_tokens?: number
          provider: string
          total_tokens?: number
        }
        Update: {
          completion_tokens?: number
          conta_id?: string
          conversa_id?: string | null
          created_at?: string | null
          custo_estimado?: number | null
          id?: string
          modelo?: string
          prompt_tokens?: number
          provider?: string
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "uso_tokens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uso_tokens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "uso_tokens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          assinatura_ativa: boolean | null
          avatar_url: string | null
          conta_id: string
          created_at: string
          email: string
          id: string
          is_admin: boolean | null
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assinatura_ativa?: boolean | null
          avatar_url?: string | null
          conta_id: string
          created_at?: string
          email: string
          id?: string
          is_admin?: boolean | null
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assinatura_ativa?: boolean | null
          avatar_url?: string | null
          conta_id?: string
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean | null
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_performance_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
    }
    Views: {
      v_performance_conta: {
        Row: {
          ativo: boolean | null
          conta_id: string | null
          conta_nome: string | null
          conversas_ativas: number | null
          conversas_total: number | null
          limite_mensagens_mes: number | null
          plano_nome: string | null
          total_contatos: number | null
          total_usuarios: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      atendente_ver_todas: { Args: { _usuario_id: string }; Returns: boolean }
      get_current_usuario_id: { Args: never; Returns: string }
      get_user_conta_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "atendente" | "super_admin"
      direcao_mensagem: "entrada" | "saida"
      status_conexao: "conectado" | "desconectado" | "aguardando"
      status_conversa: "em_atendimento" | "aguardando_cliente" | "encerrado"
      status_negociacao: "aberto" | "ganho" | "perdido"
      tipo_mensagem:
        | "texto"
        | "imagem"
        | "audio"
        | "video"
        | "documento"
        | "sticker"
        | "sistema"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "atendente", "super_admin"],
      direcao_mensagem: ["entrada", "saida"],
      status_conexao: ["conectado", "desconectado", "aguardando"],
      status_conversa: ["em_atendimento", "aguardando_cliente", "encerrado"],
      status_negociacao: ["aberto", "ganho", "perdido"],
      tipo_mensagem: [
        "texto",
        "imagem",
        "audio",
        "video",
        "documento",
        "sticker",
        "sistema",
      ],
    },
  },
} as const
