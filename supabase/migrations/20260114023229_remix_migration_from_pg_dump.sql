CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'atendente',
    'super_admin'
);


--
-- Name: direcao_mensagem; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.direcao_mensagem AS ENUM (
    'entrada',
    'saida'
);


--
-- Name: status_conexao; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_conexao AS ENUM (
    'conectado',
    'desconectado',
    'aguardando'
);


--
-- Name: status_conversa; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_conversa AS ENUM (
    'em_atendimento',
    'aguardando_cliente',
    'encerrado'
);


--
-- Name: status_negociacao; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_negociacao AS ENUM (
    'aberto',
    'ganho',
    'perdido'
);


--
-- Name: tipo_mensagem; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_mensagem AS ENUM (
    'texto',
    'imagem',
    'audio',
    'video',
    'documento',
    'sticker',
    'sistema'
);


--
-- Name: atendente_ver_todas(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atendente_ver_todas(_usuario_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT ver_todas_conversas FROM public.atendente_config WHERE usuario_id = _usuario_id),
    false
  )
$$;


--
-- Name: get_current_usuario_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_usuario_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM public.usuarios WHERE user_id = auth.uid() LIMIT 1
$$;


--
-- Name: get_user_conta_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_conta_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT conta_id FROM public.usuarios WHERE user_id = auth.uid() LIMIT 1
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'super_admin'
  )
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: agendamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agendamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    contato_id uuid,
    usuario_id uuid,
    titulo text NOT NULL,
    descricao text,
    data_inicio timestamp with time zone NOT NULL,
    data_fim timestamp with time zone,
    concluido boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    google_event_id text,
    google_meet_link text
);


--
-- Name: agent_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_ia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    nome text DEFAULT 'Assistente'::text,
    prompt_sistema text DEFAULT 'Você é um assistente virtual amigável e profissional.'::text,
    modelo text DEFAULT 'gpt-4o-mini'::text,
    temperatura numeric(2,1) DEFAULT 0.7,
    max_tokens integer DEFAULT 1000,
    ativo boolean DEFAULT true,
    horario_inicio time without time zone DEFAULT '08:00:00'::time without time zone,
    horario_fim time without time zone DEFAULT '18:00:00'::time without time zone,
    dias_ativos integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    mensagem_fora_horario text DEFAULT 'Obrigado pelo contato! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo text DEFAULT 'principal'::text,
    gatilho text,
    descricao text,
    atender_24h boolean DEFAULT false,
    tempo_espera_segundos integer DEFAULT 5,
    fracionar_mensagens boolean DEFAULT false,
    tamanho_max_fracao integer DEFAULT 500,
    delay_entre_fracoes integer DEFAULT 2,
    simular_digitacao boolean DEFAULT false,
    quantidade_mensagens_contexto integer DEFAULT 20,
    CONSTRAINT agent_ia_tipo_check CHECK ((tipo = ANY (ARRAY['principal'::text, 'secundario'::text])))
);


--
-- Name: agent_ia_agendamento_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_ia_agendamento_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_ia_id uuid NOT NULL,
    ativo boolean DEFAULT false,
    tipo_agenda text DEFAULT 'interno'::text,
    google_calendar_id uuid,
    duracao_padrao integer DEFAULT 60,
    limite_por_horario integer DEFAULT 1,
    intervalo_entre_agendamentos integer DEFAULT 0,
    antecedencia_minima_horas integer DEFAULT 1,
    antecedencia_maxima_dias integer DEFAULT 30,
    nome_agendamento text,
    descricao_agendamento text,
    prompt_consulta_horarios text,
    prompt_marcacao_horario text,
    gerar_meet boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    horario_inicio_dia time without time zone DEFAULT '08:00:00'::time without time zone,
    horario_fim_dia time without time zone DEFAULT '18:00:00'::time without time zone
);


--
-- Name: agent_ia_agendamento_horarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_ia_agendamento_horarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid NOT NULL,
    dia_semana integer NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fim time without time zone NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_ia_agendamento_horarios_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))
);


--
-- Name: agent_ia_etapas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_ia_etapas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_ia_id uuid NOT NULL,
    numero integer NOT NULL,
    tipo text,
    nome text NOT NULL,
    descricao text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_ia_etapas_tipo_check CHECK ((tipo = ANY (ARRAY['INICIO'::text, 'FINAL'::text, NULL::text])))
);


--
-- Name: agent_ia_perguntas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_ia_perguntas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_ia_id uuid NOT NULL,
    pergunta text NOT NULL,
    resposta text NOT NULL,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: atendente_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.atendente_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    ver_todas_conversas boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: calendarios_google; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendarios_google (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    nome text NOT NULL,
    email_google text NOT NULL,
    access_token text,
    refresh_token text,
    token_expiry timestamp with time zone,
    calendar_id text DEFAULT 'primary'::text,
    cor text DEFAULT '#4285F4'::text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: campos_personalizados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campos_personalizados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    grupo_id uuid,
    nome text NOT NULL,
    tipo text DEFAULT 'texto'::text NOT NULL,
    opcoes jsonb DEFAULT '[]'::jsonb,
    obrigatorio boolean DEFAULT false,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campos_personalizados_grupos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campos_personalizados_grupos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    nome text NOT NULL,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conexoes_whatsapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conexoes_whatsapp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    nome text DEFAULT 'Principal'::text NOT NULL,
    instance_name text NOT NULL,
    token text NOT NULL,
    webhook_url text,
    status public.status_conexao DEFAULT 'desconectado'::public.status_conexao,
    qrcode text,
    numero text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_provedor text DEFAULT 'evolution'::text,
    meta_phone_number_id text,
    meta_business_account_id text,
    meta_access_token text,
    meta_webhook_verify_token text,
    tipo_canal text DEFAULT 'whatsapp'::text,
    CONSTRAINT conexoes_whatsapp_tipo_provedor_check CHECK ((tipo_provedor = ANY (ARRAY['evolution'::text, 'meta'::text, 'instagram'::text])))
);


--
-- Name: configuracoes_plataforma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracoes_plataforma (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chave text NOT NULL,
    valor text,
    descricao text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    openai_api_key text,
    permitir_multiplas_negociacoes boolean DEFAULT true,
    ativo boolean DEFAULT true,
    plano_id uuid,
    reabrir_com_ia boolean DEFAULT true,
    stripe_customer_id text,
    stripe_subscription_id text,
    stripe_subscription_status text DEFAULT 'inactive'::text,
    stripe_current_period_start timestamp with time zone,
    stripe_current_period_end timestamp with time zone,
    stripe_cancel_at_period_end boolean DEFAULT false,
    whatsapp text,
    cpf text
);


--
-- Name: contato_campos_valores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contato_campos_valores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contato_id uuid NOT NULL,
    campo_id uuid NOT NULL,
    valor text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: contatos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contatos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    nome text NOT NULL,
    telefone text NOT NULL,
    email text,
    avatar_url text,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_grupo boolean DEFAULT false,
    grupo_jid text,
    canal text DEFAULT 'whatsapp'::text
);


--
-- Name: conversas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    contato_id uuid NOT NULL,
    conexao_id uuid,
    atendente_id uuid,
    agente_ia_ativo boolean DEFAULT true,
    ultima_mensagem text,
    ultima_mensagem_at timestamp with time zone,
    nao_lidas integer DEFAULT 0,
    arquivada boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.status_conversa DEFAULT 'em_atendimento'::public.status_conversa,
    memoria_limpa_em timestamp with time zone,
    agente_ia_id uuid,
    etapa_ia_atual uuid,
    canal text DEFAULT 'whatsapp'::text
);


--
-- Name: estagios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estagios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funil_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    followup_ativo boolean DEFAULT true,
    tipo text DEFAULT 'normal'::text,
    CONSTRAINT estagios_tipo_check CHECK ((tipo = ANY (ARRAY['normal'::text, 'ganho'::text, 'perdido'::text, 'cliente'::text])))
);


--
-- Name: followup_enviados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_enviados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    regra_id uuid NOT NULL,
    conversa_id uuid NOT NULL,
    tentativa integer DEFAULT 1 NOT NULL,
    mensagem_enviada text,
    enviado_em timestamp with time zone DEFAULT now(),
    respondido boolean DEFAULT false,
    respondido_em timestamp with time zone
);


--
-- Name: followup_regras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_regras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    agent_ia_id uuid,
    nome text NOT NULL,
    ativo boolean DEFAULT true,
    tipo text DEFAULT 'texto_fixo'::text NOT NULL,
    mensagem_fixa text,
    prompt_followup text,
    quantidade_mensagens_contexto integer DEFAULT 10,
    horas_sem_resposta integer DEFAULT 24 NOT NULL,
    max_tentativas integer DEFAULT 3,
    intervalo_entre_tentativas integer DEFAULT 24,
    aplicar_ia_ativa boolean DEFAULT true,
    aplicar_ia_pausada boolean DEFAULT false,
    estagio_ids uuid[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT followup_regras_tipo_check CHECK ((tipo = ANY (ARRAY['texto_fixo'::text, 'contextual_ia'::text])))
);


--
-- Name: followups_agendados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followups_agendados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    conversa_id uuid NOT NULL,
    contato_id uuid NOT NULL,
    agente_ia_id uuid,
    data_agendada timestamp with time zone NOT NULL,
    motivo text,
    contexto text,
    status text DEFAULT 'pendente'::text NOT NULL,
    enviado_em timestamp with time zone,
    mensagem_enviada text,
    created_at timestamp with time zone DEFAULT now(),
    criado_por text DEFAULT 'agente_ia'::text
);


--
-- Name: funis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    cor text DEFAULT '#10b981'::text,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lembrete_enviados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lembrete_enviados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    regra_id uuid NOT NULL,
    agendamento_id uuid NOT NULL,
    contato_id uuid,
    enviado_em timestamp with time zone DEFAULT now(),
    mensagem_enviada text
);


--
-- Name: lembrete_regras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lembrete_regras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true,
    minutos_antes integer DEFAULT 30 NOT NULL,
    tipo text DEFAULT 'texto_fixo'::text NOT NULL,
    mensagem_fixa text,
    prompt_lembrete text,
    incluir_link_meet boolean DEFAULT true,
    incluir_detalhes boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: logs_atividade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs_atividade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    usuario_id uuid,
    tipo text NOT NULL,
    descricao text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversa_id uuid NOT NULL,
    contato_id uuid,
    usuario_id uuid,
    tipo public.tipo_mensagem DEFAULT 'texto'::public.tipo_mensagem,
    direcao public.direcao_mensagem NOT NULL,
    conteudo text NOT NULL,
    media_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    lida boolean DEFAULT false,
    enviada_por_ia boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    enviada_por_dispositivo boolean DEFAULT false,
    deletada boolean DEFAULT false,
    deletada_por uuid,
    deletada_em timestamp with time zone
);


--
-- Name: mensagens_processadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens_processadas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evolution_msg_id text NOT NULL,
    conta_id uuid NOT NULL,
    telefone text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: negociacao_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negociacao_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    negociacao_id uuid NOT NULL,
    estagio_anterior_id uuid,
    estagio_novo_id uuid,
    usuario_id uuid,
    tipo text DEFAULT 'mudanca_estagio'::text NOT NULL,
    descricao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: negociacao_notas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negociacao_notas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    negociacao_id uuid NOT NULL,
    conteudo text NOT NULL,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: negociacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negociacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    contato_id uuid NOT NULL,
    estagio_id uuid,
    responsavel_id uuid,
    titulo text NOT NULL,
    valor numeric(15,2) DEFAULT 0,
    status public.status_negociacao DEFAULT 'aberto'::public.status_negociacao,
    probabilidade integer DEFAULT 50,
    data_fechamento date,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resumo_ia text,
    resumo_gerado_em timestamp with time zone
);


--
-- Name: notificacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    usuario_id uuid,
    tipo text DEFAULT 'info'::text NOT NULL,
    titulo text NOT NULL,
    mensagem text,
    lida boolean DEFAULT false NOT NULL,
    link text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: planos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    descricao text,
    limite_usuarios integer DEFAULT 1 NOT NULL,
    limite_agentes integer DEFAULT 1 NOT NULL,
    limite_funis integer DEFAULT 1 NOT NULL,
    limite_conexoes_whatsapp integer DEFAULT 1 NOT NULL,
    preco_mensal numeric(10,2) DEFAULT 0,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    limite_conexoes_evolution integer DEFAULT 1 NOT NULL,
    limite_conexoes_meta integer DEFAULT 0 NOT NULL,
    permite_instagram boolean DEFAULT false NOT NULL,
    limite_mensagens_mes integer DEFAULT 10000 NOT NULL
);


--
-- Name: respostas_pendentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.respostas_pendentes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversa_id uuid NOT NULL,
    responder_em timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    processando boolean DEFAULT false
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transferencias_atendimento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transferencias_atendimento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversa_id uuid NOT NULL,
    de_usuario_id uuid,
    para_usuario_id uuid,
    para_agente_ia boolean DEFAULT false,
    motivo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: uso_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uso_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_id uuid NOT NULL,
    conversa_id uuid,
    provider text NOT NULL,
    modelo text NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    custo_estimado numeric(10,6) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    conta_id uuid NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    is_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assinatura_ativa boolean DEFAULT true
);


--
-- Name: agendamentos agendamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_pkey PRIMARY KEY (id);


--
-- Name: agent_ia_agendamento_config agent_ia_agendamento_config_agent_ia_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_agendamento_config
    ADD CONSTRAINT agent_ia_agendamento_config_agent_ia_id_key UNIQUE (agent_ia_id);


--
-- Name: agent_ia_agendamento_config agent_ia_agendamento_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_agendamento_config
    ADD CONSTRAINT agent_ia_agendamento_config_pkey PRIMARY KEY (id);


--
-- Name: agent_ia_agendamento_horarios agent_ia_agendamento_horarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_agendamento_horarios
    ADD CONSTRAINT agent_ia_agendamento_horarios_pkey PRIMARY KEY (id);


--
-- Name: agent_ia_etapas agent_ia_etapas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_etapas
    ADD CONSTRAINT agent_ia_etapas_pkey PRIMARY KEY (id);


--
-- Name: agent_ia_perguntas agent_ia_perguntas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_perguntas
    ADD CONSTRAINT agent_ia_perguntas_pkey PRIMARY KEY (id);


--
-- Name: agent_ia agent_ia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia
    ADD CONSTRAINT agent_ia_pkey PRIMARY KEY (id);


--
-- Name: atendente_config atendente_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendente_config
    ADD CONSTRAINT atendente_config_pkey PRIMARY KEY (id);


--
-- Name: atendente_config atendente_config_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendente_config
    ADD CONSTRAINT atendente_config_usuario_id_key UNIQUE (usuario_id);


--
-- Name: calendarios_google calendarios_google_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendarios_google
    ADD CONSTRAINT calendarios_google_pkey PRIMARY KEY (id);


--
-- Name: campos_personalizados_grupos campos_personalizados_grupos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_personalizados_grupos
    ADD CONSTRAINT campos_personalizados_grupos_pkey PRIMARY KEY (id);


--
-- Name: campos_personalizados campos_personalizados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_personalizados
    ADD CONSTRAINT campos_personalizados_pkey PRIMARY KEY (id);


--
-- Name: conexoes_whatsapp conexoes_whatsapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conexoes_whatsapp
    ADD CONSTRAINT conexoes_whatsapp_pkey PRIMARY KEY (id);


--
-- Name: configuracoes_plataforma configuracoes_plataforma_chave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_plataforma
    ADD CONSTRAINT configuracoes_plataforma_chave_key UNIQUE (chave);


--
-- Name: configuracoes_plataforma configuracoes_plataforma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_plataforma
    ADD CONSTRAINT configuracoes_plataforma_pkey PRIMARY KEY (id);


--
-- Name: contas contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_pkey PRIMARY KEY (id);


--
-- Name: contato_campos_valores contato_campos_valores_contato_id_campo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contato_campos_valores
    ADD CONSTRAINT contato_campos_valores_contato_id_campo_id_key UNIQUE (contato_id, campo_id);


--
-- Name: contato_campos_valores contato_campos_valores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contato_campos_valores
    ADD CONSTRAINT contato_campos_valores_pkey PRIMARY KEY (id);


--
-- Name: contatos contatos_conta_id_telefone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contatos
    ADD CONSTRAINT contatos_conta_id_telefone_key UNIQUE (conta_id, telefone);


--
-- Name: contatos contatos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contatos
    ADD CONSTRAINT contatos_pkey PRIMARY KEY (id);


--
-- Name: conversas conversas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_pkey PRIMARY KEY (id);


--
-- Name: estagios estagios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estagios
    ADD CONSTRAINT estagios_pkey PRIMARY KEY (id);


--
-- Name: followup_enviados followup_enviados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_enviados
    ADD CONSTRAINT followup_enviados_pkey PRIMARY KEY (id);


--
-- Name: followup_regras followup_regras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_regras
    ADD CONSTRAINT followup_regras_pkey PRIMARY KEY (id);


--
-- Name: followups_agendados followups_agendados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups_agendados
    ADD CONSTRAINT followups_agendados_pkey PRIMARY KEY (id);


--
-- Name: funis funis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funis
    ADD CONSTRAINT funis_pkey PRIMARY KEY (id);


--
-- Name: lembrete_enviados lembrete_enviados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembrete_enviados
    ADD CONSTRAINT lembrete_enviados_pkey PRIMARY KEY (id);


--
-- Name: lembrete_enviados lembrete_enviados_regra_id_agendamento_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembrete_enviados
    ADD CONSTRAINT lembrete_enviados_regra_id_agendamento_id_key UNIQUE (regra_id, agendamento_id);


--
-- Name: lembrete_regras lembrete_regras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembrete_regras
    ADD CONSTRAINT lembrete_regras_pkey PRIMARY KEY (id);


--
-- Name: logs_atividade logs_atividade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_atividade
    ADD CONSTRAINT logs_atividade_pkey PRIMARY KEY (id);


--
-- Name: mensagens mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_pkey PRIMARY KEY (id);


--
-- Name: mensagens_processadas mensagens_processadas_evolution_msg_id_conta_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_processadas
    ADD CONSTRAINT mensagens_processadas_evolution_msg_id_conta_id_key UNIQUE (evolution_msg_id, conta_id);


--
-- Name: mensagens_processadas mensagens_processadas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_processadas
    ADD CONSTRAINT mensagens_processadas_pkey PRIMARY KEY (id);


--
-- Name: negociacao_historico negociacao_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacao_historico
    ADD CONSTRAINT negociacao_historico_pkey PRIMARY KEY (id);


--
-- Name: negociacao_notas negociacao_notas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacao_notas
    ADD CONSTRAINT negociacao_notas_pkey PRIMARY KEY (id);


--
-- Name: negociacoes negociacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacoes
    ADD CONSTRAINT negociacoes_pkey PRIMARY KEY (id);


--
-- Name: notificacoes notificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);


--
-- Name: planos planos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planos
    ADD CONSTRAINT planos_pkey PRIMARY KEY (id);


--
-- Name: respostas_pendentes respostas_pendentes_conversa_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respostas_pendentes
    ADD CONSTRAINT respostas_pendentes_conversa_id_key UNIQUE (conversa_id);


--
-- Name: respostas_pendentes respostas_pendentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respostas_pendentes
    ADD CONSTRAINT respostas_pendentes_pkey PRIMARY KEY (id);


--
-- Name: tags tags_conta_id_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_conta_id_nome_key UNIQUE (conta_id, nome);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: transferencias_atendimento transferencias_atendimento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_atendimento
    ADD CONSTRAINT transferencias_atendimento_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: uso_tokens uso_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_tokens
    ADD CONSTRAINT uso_tokens_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_user_id_conta_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_user_id_conta_id_key UNIQUE (user_id, conta_id);


--
-- Name: agendamentos_google_event_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agendamentos_google_event_unique ON public.agendamentos USING btree (google_event_id, conta_id) WHERE (google_event_id IS NOT NULL);


--
-- Name: idx_agendamentos_conta_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_conta_data ON public.agendamentos USING btree (conta_id, data_inicio) WHERE (concluido = false);


--
-- Name: idx_agendamentos_google_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendamentos_google_event_id ON public.agendamentos USING btree (google_event_id) WHERE (google_event_id IS NOT NULL);


--
-- Name: idx_agent_ia_conta_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_ia_conta_tipo ON public.agent_ia USING btree (conta_id, tipo);


--
-- Name: idx_agent_ia_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_ia_nome ON public.agent_ia USING btree (nome);


--
-- Name: idx_calendarios_google_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendarios_google_conta_id ON public.calendarios_google USING btree (conta_id);


--
-- Name: idx_conexoes_tipo_canal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conexoes_tipo_canal ON public.conexoes_whatsapp USING btree (tipo_canal);


--
-- Name: idx_contatos_canal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contatos_canal ON public.contatos USING btree (canal);


--
-- Name: idx_contatos_conta_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contatos_conta_telefone ON public.contatos USING btree (conta_id, telefone);


--
-- Name: idx_contatos_grupo_jid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contatos_grupo_jid ON public.contatos USING btree (grupo_jid);


--
-- Name: idx_contatos_is_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contatos_is_grupo ON public.contatos USING btree (is_grupo);


--
-- Name: idx_conversas_agente_ia_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversas_agente_ia_id ON public.conversas USING btree (agente_ia_id);


--
-- Name: idx_conversas_canal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversas_canal ON public.conversas USING btree (canal);


--
-- Name: idx_conversas_conta_status_arquivada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversas_conta_status_arquivada ON public.conversas USING btree (conta_id, status) WHERE (arquivada = false);


--
-- Name: idx_followups_agendados_contato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_agendados_contato ON public.followups_agendados USING btree (contato_id);


--
-- Name: idx_followups_agendados_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_agendados_data ON public.followups_agendados USING btree (data_agendada);


--
-- Name: idx_followups_agendados_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_agendados_status ON public.followups_agendados USING btree (status);


--
-- Name: idx_logs_atividade_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_atividade_conta_id ON public.logs_atividade USING btree (conta_id);


--
-- Name: idx_logs_atividade_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_atividade_created_at ON public.logs_atividade USING btree (created_at);


--
-- Name: idx_logs_atividade_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_atividade_tipo ON public.logs_atividade USING btree (tipo);


--
-- Name: idx_mensagens_conversa_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_conversa_created ON public.mensagens USING btree (conversa_id, created_at DESC);


--
-- Name: idx_mensagens_processadas_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_processadas_created_at ON public.mensagens_processadas USING btree (created_at);


--
-- Name: idx_mensagens_processadas_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_processadas_lookup ON public.mensagens_processadas USING btree (evolution_msg_id, conta_id);


--
-- Name: idx_negociacao_historico_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_negociacao_historico_created_at ON public.negociacao_historico USING btree (created_at DESC);


--
-- Name: idx_negociacao_historico_negociacao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_negociacao_historico_negociacao_id ON public.negociacao_historico USING btree (negociacao_id);


--
-- Name: idx_notificacoes_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_conta ON public.notificacoes USING btree (conta_id);


--
-- Name: idx_notificacoes_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_created ON public.notificacoes USING btree (created_at DESC);


--
-- Name: idx_notificacoes_lida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_lida ON public.notificacoes USING btree (lida);


--
-- Name: idx_notificacoes_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_usuario ON public.notificacoes USING btree (usuario_id);


--
-- Name: idx_respostas_pendentes_responder_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_respostas_pendentes_responder_em ON public.respostas_pendentes USING btree (responder_em);


--
-- Name: idx_uso_tokens_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uso_tokens_conta_id ON public.uso_tokens USING btree (conta_id);


--
-- Name: idx_uso_tokens_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uso_tokens_created_at ON public.uso_tokens USING btree (created_at);


--
-- Name: agendamentos update_agendamentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agendamentos_updated_at BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_ia_agendamento_config update_agent_ia_agendamento_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_ia_agendamento_config_updated_at BEFORE UPDATE ON public.agent_ia_agendamento_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_ia_etapas update_agent_ia_etapas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_ia_etapas_updated_at BEFORE UPDATE ON public.agent_ia_etapas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_ia_perguntas update_agent_ia_perguntas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_ia_perguntas_updated_at BEFORE UPDATE ON public.agent_ia_perguntas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_ia update_agent_ia_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_ia_updated_at BEFORE UPDATE ON public.agent_ia FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: atendente_config update_atendente_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_atendente_config_updated_at BEFORE UPDATE ON public.atendente_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: calendarios_google update_calendarios_google_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_calendarios_google_updated_at BEFORE UPDATE ON public.calendarios_google FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: campos_personalizados_grupos update_campos_personalizados_grupos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_campos_personalizados_grupos_updated_at BEFORE UPDATE ON public.campos_personalizados_grupos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: campos_personalizados update_campos_personalizados_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_campos_personalizados_updated_at BEFORE UPDATE ON public.campos_personalizados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conexoes_whatsapp update_conexoes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conexoes_updated_at BEFORE UPDATE ON public.conexoes_whatsapp FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: configuracoes_plataforma update_configuracoes_plataforma_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_configuracoes_plataforma_updated_at BEFORE UPDATE ON public.configuracoes_plataforma FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contas update_contas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contas_updated_at BEFORE UPDATE ON public.contas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contato_campos_valores update_contato_campos_valores_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contato_campos_valores_updated_at BEFORE UPDATE ON public.contato_campos_valores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contatos update_contatos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contatos_updated_at BEFORE UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversas update_conversas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversas_updated_at BEFORE UPDATE ON public.conversas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: estagios update_estagios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_estagios_updated_at BEFORE UPDATE ON public.estagios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: followup_regras update_followup_regras_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_followup_regras_updated_at BEFORE UPDATE ON public.followup_regras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: funis update_funis_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_funis_updated_at BEFORE UPDATE ON public.funis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lembrete_regras update_lembrete_regras_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lembrete_regras_updated_at BEFORE UPDATE ON public.lembrete_regras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: negociacao_notas update_negociacao_notas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_negociacao_notas_updated_at BEFORE UPDATE ON public.negociacao_notas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: negociacoes update_negociacoes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_negociacoes_updated_at BEFORE UPDATE ON public.negociacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: planos update_planos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_planos_updated_at BEFORE UPDATE ON public.planos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tags update_tags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: usuarios update_usuarios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agendamentos agendamentos_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: agendamentos agendamentos_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE;


--
-- Name: agendamentos agendamentos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamentos
    ADD CONSTRAINT agendamentos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: agent_ia_agendamento_config agent_ia_agendamento_config_agent_ia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_agendamento_config
    ADD CONSTRAINT agent_ia_agendamento_config_agent_ia_id_fkey FOREIGN KEY (agent_ia_id) REFERENCES public.agent_ia(id) ON DELETE CASCADE;


--
-- Name: agent_ia_agendamento_config agent_ia_agendamento_config_google_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_agendamento_config
    ADD CONSTRAINT agent_ia_agendamento_config_google_calendar_id_fkey FOREIGN KEY (google_calendar_id) REFERENCES public.calendarios_google(id) ON DELETE SET NULL;


--
-- Name: agent_ia_agendamento_horarios agent_ia_agendamento_horarios_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_agendamento_horarios
    ADD CONSTRAINT agent_ia_agendamento_horarios_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.agent_ia_agendamento_config(id) ON DELETE CASCADE;


--
-- Name: agent_ia agent_ia_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia
    ADD CONSTRAINT agent_ia_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: agent_ia_etapas agent_ia_etapas_agent_ia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_etapas
    ADD CONSTRAINT agent_ia_etapas_agent_ia_id_fkey FOREIGN KEY (agent_ia_id) REFERENCES public.agent_ia(id) ON DELETE CASCADE;


--
-- Name: agent_ia_perguntas agent_ia_perguntas_agent_ia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_ia_perguntas
    ADD CONSTRAINT agent_ia_perguntas_agent_ia_id_fkey FOREIGN KEY (agent_ia_id) REFERENCES public.agent_ia(id) ON DELETE CASCADE;


--
-- Name: atendente_config atendente_config_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendente_config
    ADD CONSTRAINT atendente_config_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: campos_personalizados campos_personalizados_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_personalizados
    ADD CONSTRAINT campos_personalizados_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: campos_personalizados campos_personalizados_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_personalizados
    ADD CONSTRAINT campos_personalizados_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.campos_personalizados_grupos(id) ON DELETE SET NULL;


--
-- Name: campos_personalizados_grupos campos_personalizados_grupos_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campos_personalizados_grupos
    ADD CONSTRAINT campos_personalizados_grupos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: conexoes_whatsapp conexoes_whatsapp_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conexoes_whatsapp
    ADD CONSTRAINT conexoes_whatsapp_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: contas contas_plano_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES public.planos(id);


--
-- Name: contato_campos_valores contato_campos_valores_campo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contato_campos_valores
    ADD CONSTRAINT contato_campos_valores_campo_id_fkey FOREIGN KEY (campo_id) REFERENCES public.campos_personalizados(id) ON DELETE CASCADE;


--
-- Name: contato_campos_valores contato_campos_valores_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contato_campos_valores
    ADD CONSTRAINT contato_campos_valores_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE;


--
-- Name: contatos contatos_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contatos
    ADD CONSTRAINT contatos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: conversas conversas_agente_ia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_agente_ia_id_fkey FOREIGN KEY (agente_ia_id) REFERENCES public.agent_ia(id);


--
-- Name: conversas conversas_atendente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: conversas conversas_conexao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_conexao_id_fkey FOREIGN KEY (conexao_id) REFERENCES public.conexoes_whatsapp(id) ON DELETE SET NULL;


--
-- Name: conversas conversas_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: conversas conversas_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE;


--
-- Name: conversas conversas_etapa_ia_atual_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_etapa_ia_atual_fkey FOREIGN KEY (etapa_ia_atual) REFERENCES public.agent_ia_etapas(id);


--
-- Name: estagios estagios_funil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estagios
    ADD CONSTRAINT estagios_funil_id_fkey FOREIGN KEY (funil_id) REFERENCES public.funis(id) ON DELETE CASCADE;


--
-- Name: followup_enviados followup_enviados_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_enviados
    ADD CONSTRAINT followup_enviados_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE CASCADE;


--
-- Name: followup_enviados followup_enviados_regra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_enviados
    ADD CONSTRAINT followup_enviados_regra_id_fkey FOREIGN KEY (regra_id) REFERENCES public.followup_regras(id) ON DELETE CASCADE;


--
-- Name: followup_regras followup_regras_agent_ia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_regras
    ADD CONSTRAINT followup_regras_agent_ia_id_fkey FOREIGN KEY (agent_ia_id) REFERENCES public.agent_ia(id) ON DELETE SET NULL;


--
-- Name: followup_regras followup_regras_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_regras
    ADD CONSTRAINT followup_regras_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: funis funis_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funis
    ADD CONSTRAINT funis_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: lembrete_enviados lembrete_enviados_agendamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembrete_enviados
    ADD CONSTRAINT lembrete_enviados_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE CASCADE;


--
-- Name: lembrete_enviados lembrete_enviados_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembrete_enviados
    ADD CONSTRAINT lembrete_enviados_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE SET NULL;


--
-- Name: lembrete_enviados lembrete_enviados_regra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembrete_enviados
    ADD CONSTRAINT lembrete_enviados_regra_id_fkey FOREIGN KEY (regra_id) REFERENCES public.lembrete_regras(id) ON DELETE CASCADE;


--
-- Name: lembrete_regras lembrete_regras_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembrete_regras
    ADD CONSTRAINT lembrete_regras_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: logs_atividade logs_atividade_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_atividade
    ADD CONSTRAINT logs_atividade_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: logs_atividade logs_atividade_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_atividade
    ADD CONSTRAINT logs_atividade_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: mensagens mensagens_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE;


--
-- Name: mensagens mensagens_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE CASCADE;


--
-- Name: mensagens mensagens_deletada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_deletada_por_fkey FOREIGN KEY (deletada_por) REFERENCES public.usuarios(id);


--
-- Name: mensagens_processadas mensagens_processadas_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_processadas
    ADD CONSTRAINT mensagens_processadas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: mensagens mensagens_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: negociacao_historico negociacao_historico_estagio_anterior_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacao_historico
    ADD CONSTRAINT negociacao_historico_estagio_anterior_id_fkey FOREIGN KEY (estagio_anterior_id) REFERENCES public.estagios(id) ON DELETE SET NULL;


--
-- Name: negociacao_historico negociacao_historico_estagio_novo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacao_historico
    ADD CONSTRAINT negociacao_historico_estagio_novo_id_fkey FOREIGN KEY (estagio_novo_id) REFERENCES public.estagios(id) ON DELETE SET NULL;


--
-- Name: negociacao_historico negociacao_historico_negociacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacao_historico
    ADD CONSTRAINT negociacao_historico_negociacao_id_fkey FOREIGN KEY (negociacao_id) REFERENCES public.negociacoes(id) ON DELETE CASCADE;


--
-- Name: negociacao_historico negociacao_historico_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacao_historico
    ADD CONSTRAINT negociacao_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: negociacao_notas negociacao_notas_negociacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacao_notas
    ADD CONSTRAINT negociacao_notas_negociacao_id_fkey FOREIGN KEY (negociacao_id) REFERENCES public.negociacoes(id) ON DELETE CASCADE;


--
-- Name: negociacao_notas negociacao_notas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacao_notas
    ADD CONSTRAINT negociacao_notas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: negociacoes negociacoes_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacoes
    ADD CONSTRAINT negociacoes_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: negociacoes negociacoes_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacoes
    ADD CONSTRAINT negociacoes_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE;


--
-- Name: negociacoes negociacoes_estagio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacoes
    ADD CONSTRAINT negociacoes_estagio_id_fkey FOREIGN KEY (estagio_id) REFERENCES public.estagios(id) ON DELETE SET NULL;


--
-- Name: negociacoes negociacoes_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negociacoes
    ADD CONSTRAINT negociacoes_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: notificacoes notificacoes_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: notificacoes notificacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: respostas_pendentes respostas_pendentes_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respostas_pendentes
    ADD CONSTRAINT respostas_pendentes_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE CASCADE;


--
-- Name: tags tags_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: transferencias_atendimento transferencias_atendimento_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_atendimento
    ADD CONSTRAINT transferencias_atendimento_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE CASCADE;


--
-- Name: transferencias_atendimento transferencias_atendimento_de_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_atendimento
    ADD CONSTRAINT transferencias_atendimento_de_usuario_id_fkey FOREIGN KEY (de_usuario_id) REFERENCES public.usuarios(id);


--
-- Name: transferencias_atendimento transferencias_atendimento_para_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_atendimento
    ADD CONSTRAINT transferencias_atendimento_para_usuario_id_fkey FOREIGN KEY (para_usuario_id) REFERENCES public.usuarios(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: uso_tokens uso_tokens_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_tokens
    ADD CONSTRAINT uso_tokens_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: uso_tokens uso_tokens_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uso_tokens
    ADD CONSTRAINT uso_tokens_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE SET NULL;


--
-- Name: usuarios usuarios_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles Admins podem atualizar roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins podem atualizar roles" ON public.user_roles FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (user_id IN ( SELECT u.user_id
   FROM public.usuarios u
  WHERE (u.conta_id = public.get_user_conta_id())))));


--
-- Name: user_roles Admins podem deletar roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins podem deletar roles" ON public.user_roles FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (user_id IN ( SELECT u.user_id
   FROM public.usuarios u
  WHERE (u.conta_id = public.get_user_conta_id())))));


--
-- Name: atendente_config Admins podem gerenciar config de atendentes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins podem gerenciar config de atendentes" ON public.atendente_config TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (usuario_id IN ( SELECT usuarios.id
   FROM public.usuarios
  WHERE (usuarios.conta_id = public.get_user_conta_id())))));


--
-- Name: user_roles Admins podem inserir roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins podem inserir roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (user_id IN ( SELECT u.user_id
   FROM public.usuarios u
  WHERE (u.conta_id = public.get_user_conta_id())))));


--
-- Name: user_roles Admins podem ver roles da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins podem ver roles da conta" ON public.user_roles FOR SELECT TO authenticated USING ((user_id IN ( SELECT u.user_id
   FROM public.usuarios u
  WHERE (u.conta_id = public.get_user_conta_id()))));


--
-- Name: followups_agendados Service role pode gerenciar followups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role pode gerenciar followups" ON public.followups_agendados USING (true) WITH CHECK (true);


--
-- Name: mensagens_processadas Service role pode gerenciar mensagens processadas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role pode gerenciar mensagens processadas" ON public.mensagens_processadas USING (true) WITH CHECK (true);


--
-- Name: respostas_pendentes Service role pode gerenciar respostas pendentes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role pode gerenciar respostas pendentes" ON public.respostas_pendentes USING (true) WITH CHECK (true);


--
-- Name: logs_atividade Service role pode inserir logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role pode inserir logs" ON public.logs_atividade FOR INSERT WITH CHECK (true);


--
-- Name: uso_tokens Service role pode inserir tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role pode inserir tokens" ON public.uso_tokens FOR INSERT WITH CHECK (true);


--
-- Name: contas Super admin pode atualizar todas as contas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode atualizar todas as contas" ON public.contas FOR UPDATE USING (public.is_super_admin());


--
-- Name: usuarios Super admin pode atualizar todos os usuarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode atualizar todos os usuarios" ON public.usuarios FOR UPDATE USING (public.is_super_admin());


--
-- Name: configuracoes_plataforma Super admin pode gerenciar configuracoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode gerenciar configuracoes" ON public.configuracoes_plataforma USING (public.is_super_admin());


--
-- Name: planos Super admin pode gerenciar planos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode gerenciar planos" ON public.planos USING (public.is_super_admin());


--
-- Name: user_roles Super admin pode gerenciar todas as roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode gerenciar todas as roles" ON public.user_roles USING (public.is_super_admin());


--
-- Name: contas Super admin pode ver todas as contas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todas as contas" ON public.contas FOR SELECT USING (public.is_super_admin());


--
-- Name: conversas Super admin pode ver todas as conversas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todas as conversas" ON public.conversas FOR SELECT USING (public.is_super_admin());


--
-- Name: mensagens Super admin pode ver todas as mensagens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todas as mensagens" ON public.mensagens FOR SELECT USING (public.is_super_admin());


--
-- Name: negociacoes Super admin pode ver todas as negociacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todas as negociacoes" ON public.negociacoes FOR SELECT USING (public.is_super_admin());


--
-- Name: conexoes_whatsapp Super admin pode ver todas conexoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todas conexoes" ON public.conexoes_whatsapp FOR SELECT USING (public.is_super_admin());


--
-- Name: agent_ia Super admin pode ver todos agentes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todos agentes" ON public.agent_ia FOR SELECT USING (public.is_super_admin());


--
-- Name: funis Super admin pode ver todos funis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todos funis" ON public.funis FOR SELECT USING (public.is_super_admin());


--
-- Name: contatos Super admin pode ver todos os contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todos os contatos" ON public.contatos FOR SELECT USING (public.is_super_admin());


--
-- Name: logs_atividade Super admin pode ver todos os logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todos os logs" ON public.logs_atividade FOR SELECT USING (public.is_super_admin());


--
-- Name: uso_tokens Super admin pode ver todos os tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todos os tokens" ON public.uso_tokens FOR SELECT USING (public.is_super_admin());


--
-- Name: usuarios Super admin pode ver todos os usuarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin pode ver todos os usuarios" ON public.usuarios FOR SELECT USING (public.is_super_admin());


--
-- Name: conexoes_whatsapp Usuarios podem atualizar conexoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem atualizar conexoes" ON public.conexoes_whatsapp FOR UPDATE USING ((conta_id = public.get_user_conta_id()));


--
-- Name: contatos Usuarios podem atualizar contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem atualizar contatos" ON public.contatos FOR UPDATE USING ((conta_id = public.get_user_conta_id()));


--
-- Name: conversas Usuarios podem atualizar conversas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem atualizar conversas" ON public.conversas FOR UPDATE USING ((conta_id = public.get_user_conta_id()));


--
-- Name: mensagens Usuarios podem atualizar mensagens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem atualizar mensagens" ON public.mensagens FOR UPDATE USING ((conversa_id IN ( SELECT conversas.id
   FROM public.conversas
  WHERE (conversas.conta_id = public.get_user_conta_id()))));


--
-- Name: usuarios Usuarios podem atualizar seus dados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem atualizar seus dados" ON public.usuarios FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: contas Usuarios podem atualizar suas contas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem atualizar suas contas" ON public.contas FOR UPDATE USING ((id IN ( SELECT usuarios.conta_id
   FROM public.usuarios
  WHERE (usuarios.user_id = auth.uid()))));


--
-- Name: notificacoes Usuarios podem atualizar suas notificacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem atualizar suas notificacoes" ON public.notificacoes FOR UPDATE USING (((conta_id = public.get_user_conta_id()) AND ((usuario_id IS NULL) OR (usuario_id = public.get_current_usuario_id()))));


--
-- Name: contas Usuarios podem criar contas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem criar contas" ON public.contas FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: conexoes_whatsapp Usuarios podem deletar conexoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem deletar conexoes" ON public.conexoes_whatsapp FOR DELETE USING ((conta_id = public.get_user_conta_id()));


--
-- Name: contatos Usuarios podem deletar contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem deletar contatos" ON public.contatos FOR DELETE USING ((conta_id = public.get_user_conta_id()));


--
-- Name: conversas Usuarios podem deletar conversas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem deletar conversas" ON public.conversas FOR DELETE USING ((conta_id = public.get_user_conta_id()));


--
-- Name: mensagens Usuarios podem deletar mensagens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem deletar mensagens" ON public.mensagens FOR DELETE USING ((conversa_id IN ( SELECT conversas.id
   FROM public.conversas
  WHERE (conversas.conta_id = public.get_user_conta_id()))));


--
-- Name: agendamentos Usuarios podem gerenciar agendamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar agendamentos" ON public.agendamentos USING ((conta_id = public.get_user_conta_id()));


--
-- Name: calendarios_google Usuarios podem gerenciar calendarios da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar calendarios da conta" ON public.calendarios_google USING ((conta_id = public.get_user_conta_id()));


--
-- Name: campos_personalizados Usuarios podem gerenciar campos da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar campos da conta" ON public.campos_personalizados USING ((conta_id = public.get_user_conta_id()));


--
-- Name: agent_ia Usuarios podem gerenciar config IA; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar config IA" ON public.agent_ia USING ((conta_id = public.get_user_conta_id()));


--
-- Name: agent_ia_agendamento_config Usuarios podem gerenciar config de agendamento do agente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar config de agendamento do agente" ON public.agent_ia_agendamento_config USING ((agent_ia_id IN ( SELECT agent_ia.id
   FROM public.agent_ia
  WHERE (agent_ia.conta_id = public.get_user_conta_id()))));


--
-- Name: estagios Usuarios podem gerenciar estagios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar estagios" ON public.estagios USING ((funil_id IN ( SELECT funis.id
   FROM public.funis
  WHERE (funis.conta_id = public.get_user_conta_id()))));


--
-- Name: agent_ia_etapas Usuarios podem gerenciar etapas do agente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar etapas do agente" ON public.agent_ia_etapas USING ((agent_ia_id IN ( SELECT agent_ia.id
   FROM public.agent_ia
  WHERE (agent_ia.conta_id = public.get_user_conta_id()))));


--
-- Name: followup_enviados Usuarios podem gerenciar followups da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar followups da conta" ON public.followup_enviados USING ((regra_id IN ( SELECT followup_regras.id
   FROM public.followup_regras
  WHERE (followup_regras.conta_id = public.get_user_conta_id()))));


--
-- Name: followups_agendados Usuarios podem gerenciar followups da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar followups da conta" ON public.followups_agendados USING ((conta_id = public.get_user_conta_id()));


--
-- Name: funis Usuarios podem gerenciar funis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar funis" ON public.funis USING ((conta_id = public.get_user_conta_id()));


--
-- Name: campos_personalizados_grupos Usuarios podem gerenciar grupos da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar grupos da conta" ON public.campos_personalizados_grupos USING ((conta_id = public.get_user_conta_id()));


--
-- Name: agent_ia_agendamento_horarios Usuarios podem gerenciar horarios do agente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar horarios do agente" ON public.agent_ia_agendamento_horarios USING ((config_id IN ( SELECT c.id
   FROM (public.agent_ia_agendamento_config c
     JOIN public.agent_ia a ON ((c.agent_ia_id = a.id)))
  WHERE (a.conta_id = public.get_user_conta_id()))));


--
-- Name: lembrete_enviados Usuarios podem gerenciar lembretes da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar lembretes da conta" ON public.lembrete_enviados USING ((regra_id IN ( SELECT lembrete_regras.id
   FROM public.lembrete_regras
  WHERE (lembrete_regras.conta_id = public.get_user_conta_id()))));


--
-- Name: negociacoes Usuarios podem gerenciar negociacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar negociacoes" ON public.negociacoes USING ((conta_id = public.get_user_conta_id()));


--
-- Name: negociacao_notas Usuarios podem gerenciar notas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar notas" ON public.negociacao_notas USING ((negociacao_id IN ( SELECT negociacoes.id
   FROM public.negociacoes
  WHERE (negociacoes.conta_id = public.get_user_conta_id()))));


--
-- Name: agent_ia_perguntas Usuarios podem gerenciar perguntas do agente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar perguntas do agente" ON public.agent_ia_perguntas USING ((agent_ia_id IN ( SELECT agent_ia.id
   FROM public.agent_ia
  WHERE (agent_ia.conta_id = public.get_user_conta_id()))));


--
-- Name: followup_regras Usuarios podem gerenciar regras da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar regras da conta" ON public.followup_regras USING ((conta_id = public.get_user_conta_id()));


--
-- Name: lembrete_regras Usuarios podem gerenciar regras da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar regras da conta" ON public.lembrete_regras USING ((conta_id = public.get_user_conta_id()));


--
-- Name: tags Usuarios podem gerenciar tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar tags" ON public.tags USING ((conta_id = public.get_user_conta_id()));


--
-- Name: contato_campos_valores Usuarios podem gerenciar valores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem gerenciar valores" ON public.contato_campos_valores USING ((contato_id IN ( SELECT contatos.id
   FROM public.contatos
  WHERE (contatos.conta_id = public.get_user_conta_id()))));


--
-- Name: conexoes_whatsapp Usuarios podem inserir conexoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir conexoes" ON public.conexoes_whatsapp FOR INSERT WITH CHECK ((conta_id = public.get_user_conta_id()));


--
-- Name: contatos Usuarios podem inserir contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir contatos" ON public.contatos FOR INSERT WITH CHECK ((conta_id = public.get_user_conta_id()));


--
-- Name: conversas Usuarios podem inserir conversas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir conversas" ON public.conversas FOR INSERT WITH CHECK ((conta_id = public.get_user_conta_id()));


--
-- Name: usuarios Usuarios podem inserir em suas contas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir em suas contas" ON public.usuarios FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: negociacao_historico Usuarios podem inserir historico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir historico" ON public.negociacao_historico FOR INSERT WITH CHECK ((negociacao_id IN ( SELECT negociacoes.id
   FROM public.negociacoes
  WHERE (negociacoes.conta_id = public.get_user_conta_id()))));


--
-- Name: mensagens Usuarios podem inserir mensagens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir mensagens" ON public.mensagens FOR INSERT WITH CHECK ((conversa_id IN ( SELECT conversas.id
   FROM public.conversas
  WHERE (conversas.conta_id = public.get_user_conta_id()))));


--
-- Name: notificacoes Usuarios podem inserir notificacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir notificacoes" ON public.notificacoes FOR INSERT WITH CHECK ((conta_id = public.get_user_conta_id()));


--
-- Name: transferencias_atendimento Usuarios podem inserir transferencias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir transferencias" ON public.transferencias_atendimento FOR INSERT WITH CHECK ((conversa_id IN ( SELECT conversas.id
   FROM public.conversas
  WHERE (conversas.conta_id = public.get_user_conta_id()))));


--
-- Name: agendamentos Usuarios podem ver agendamentos da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver agendamentos da conta" ON public.agendamentos FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: calendarios_google Usuarios podem ver calendarios da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver calendarios da conta" ON public.calendarios_google FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: campos_personalizados Usuarios podem ver campos da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver campos da conta" ON public.campos_personalizados FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: conexoes_whatsapp Usuarios podem ver conexoes da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver conexoes da conta" ON public.conexoes_whatsapp FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: agent_ia Usuarios podem ver config IA da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver config IA da conta" ON public.agent_ia FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: agent_ia_agendamento_config Usuarios podem ver config de agendamento do agente da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver config de agendamento do agente da conta" ON public.agent_ia_agendamento_config FOR SELECT USING ((agent_ia_id IN ( SELECT agent_ia.id
   FROM public.agent_ia
  WHERE (agent_ia.conta_id = public.get_user_conta_id()))));


--
-- Name: atendente_config Usuarios podem ver config de atendentes da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver config de atendentes da conta" ON public.atendente_config FOR SELECT TO authenticated USING ((usuario_id IN ( SELECT usuarios.id
   FROM public.usuarios
  WHERE (usuarios.conta_id = public.get_user_conta_id()))));


--
-- Name: contatos Usuarios podem ver contatos da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver contatos da conta" ON public.contatos FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: conversas Usuarios podem ver conversas da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver conversas da conta" ON public.conversas FOR SELECT TO authenticated USING (((conta_id = public.get_user_conta_id()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.atendente_ver_todas(public.get_current_usuario_id()) OR (atendente_id = public.get_current_usuario_id()) OR (atendente_id IS NULL))));


--
-- Name: estagios Usuarios podem ver estagios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver estagios" ON public.estagios FOR SELECT USING ((funil_id IN ( SELECT funis.id
   FROM public.funis
  WHERE (funis.conta_id = public.get_user_conta_id()))));


--
-- Name: agent_ia_etapas Usuarios podem ver etapas do agente da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver etapas do agente da conta" ON public.agent_ia_etapas FOR SELECT USING ((agent_ia_id IN ( SELECT agent_ia.id
   FROM public.agent_ia
  WHERE (agent_ia.conta_id = public.get_user_conta_id()))));


--
-- Name: followup_enviados Usuarios podem ver followups da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver followups da conta" ON public.followup_enviados FOR SELECT USING ((regra_id IN ( SELECT followup_regras.id
   FROM public.followup_regras
  WHERE (followup_regras.conta_id = public.get_user_conta_id()))));


--
-- Name: followups_agendados Usuarios podem ver followups da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver followups da conta" ON public.followups_agendados FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: funis Usuarios podem ver funis da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver funis da conta" ON public.funis FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: campos_personalizados_grupos Usuarios podem ver grupos da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver grupos da conta" ON public.campos_personalizados_grupos FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: negociacao_historico Usuarios podem ver historico da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver historico da conta" ON public.negociacao_historico FOR SELECT USING ((negociacao_id IN ( SELECT negociacoes.id
   FROM public.negociacoes
  WHERE (negociacoes.conta_id = public.get_user_conta_id()))));


--
-- Name: agent_ia_agendamento_horarios Usuarios podem ver horarios do agente da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver horarios do agente da conta" ON public.agent_ia_agendamento_horarios FOR SELECT USING ((config_id IN ( SELECT c.id
   FROM (public.agent_ia_agendamento_config c
     JOIN public.agent_ia a ON ((c.agent_ia_id = a.id)))
  WHERE (a.conta_id = public.get_user_conta_id()))));


--
-- Name: lembrete_enviados Usuarios podem ver lembretes da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver lembretes da conta" ON public.lembrete_enviados FOR SELECT USING ((regra_id IN ( SELECT lembrete_regras.id
   FROM public.lembrete_regras
  WHERE (lembrete_regras.conta_id = public.get_user_conta_id()))));


--
-- Name: mensagens Usuarios podem ver mensagens das conversas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver mensagens das conversas" ON public.mensagens FOR SELECT USING ((conversa_id IN ( SELECT conversas.id
   FROM public.conversas
  WHERE (conversas.conta_id = public.get_user_conta_id()))));


--
-- Name: negociacoes Usuarios podem ver negociacoes da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver negociacoes da conta" ON public.negociacoes FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: negociacao_notas Usuarios podem ver notas da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver notas da conta" ON public.negociacao_notas FOR SELECT USING ((negociacao_id IN ( SELECT negociacoes.id
   FROM public.negociacoes
  WHERE (negociacoes.conta_id = public.get_user_conta_id()))));


--
-- Name: agent_ia_perguntas Usuarios podem ver perguntas do agente da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver perguntas do agente da conta" ON public.agent_ia_perguntas FOR SELECT USING ((agent_ia_id IN ( SELECT agent_ia.id
   FROM public.agent_ia
  WHERE (agent_ia.conta_id = public.get_user_conta_id()))));


--
-- Name: planos Usuarios podem ver planos ativos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver planos ativos" ON public.planos FOR SELECT USING ((ativo = true));


--
-- Name: followup_regras Usuarios podem ver regras da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver regras da conta" ON public.followup_regras FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: lembrete_regras Usuarios podem ver regras da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver regras da conta" ON public.lembrete_regras FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: contas Usuarios podem ver suas contas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver suas contas" ON public.contas FOR SELECT USING ((id IN ( SELECT usuarios.conta_id
   FROM public.usuarios
  WHERE (usuarios.user_id = auth.uid()))));


--
-- Name: notificacoes Usuarios podem ver suas notificacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver suas notificacoes" ON public.notificacoes FOR SELECT USING (((conta_id = public.get_user_conta_id()) AND ((usuario_id IS NULL) OR (usuario_id = public.get_current_usuario_id()))));


--
-- Name: tags Usuarios podem ver tags da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver tags da conta" ON public.tags FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: transferencias_atendimento Usuarios podem ver transferencias da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver transferencias da conta" ON public.transferencias_atendimento FOR SELECT USING ((conversa_id IN ( SELECT conversas.id
   FROM public.conversas
  WHERE (conversas.conta_id = public.get_user_conta_id()))));


--
-- Name: usuarios Usuarios podem ver usuarios da mesma conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver usuarios da mesma conta" ON public.usuarios FOR SELECT USING ((conta_id = public.get_user_conta_id()));


--
-- Name: contato_campos_valores Usuarios podem ver valores da conta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver valores da conta" ON public.contato_campos_valores FOR SELECT USING ((contato_id IN ( SELECT contatos.id
   FROM public.contatos
  WHERE (contatos.conta_id = public.get_user_conta_id()))));


--
-- Name: agendamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_ia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_ia ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_ia_agendamento_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_ia_agendamento_config ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_ia_agendamento_horarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_ia_agendamento_horarios ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_ia_etapas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_ia_etapas ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_ia_perguntas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_ia_perguntas ENABLE ROW LEVEL SECURITY;

--
-- Name: atendente_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.atendente_config ENABLE ROW LEVEL SECURITY;

--
-- Name: calendarios_google; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendarios_google ENABLE ROW LEVEL SECURITY;

--
-- Name: campos_personalizados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campos_personalizados ENABLE ROW LEVEL SECURITY;

--
-- Name: campos_personalizados_grupos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campos_personalizados_grupos ENABLE ROW LEVEL SECURITY;

--
-- Name: conexoes_whatsapp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conexoes_whatsapp ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracoes_plataforma; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracoes_plataforma ENABLE ROW LEVEL SECURITY;

--
-- Name: contas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;

--
-- Name: contato_campos_valores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contato_campos_valores ENABLE ROW LEVEL SECURITY;

--
-- Name: contatos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

--
-- Name: conversas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;

--
-- Name: estagios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estagios ENABLE ROW LEVEL SECURITY;

--
-- Name: followup_enviados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followup_enviados ENABLE ROW LEVEL SECURITY;

--
-- Name: followup_regras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followup_regras ENABLE ROW LEVEL SECURITY;

--
-- Name: followups_agendados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followups_agendados ENABLE ROW LEVEL SECURITY;

--
-- Name: funis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funis ENABLE ROW LEVEL SECURITY;

--
-- Name: lembrete_enviados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lembrete_enviados ENABLE ROW LEVEL SECURITY;

--
-- Name: lembrete_regras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lembrete_regras ENABLE ROW LEVEL SECURITY;

--
-- Name: logs_atividade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logs_atividade ENABLE ROW LEVEL SECURITY;

--
-- Name: mensagens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

--
-- Name: mensagens_processadas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensagens_processadas ENABLE ROW LEVEL SECURITY;

--
-- Name: negociacao_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.negociacao_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: negociacao_notas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.negociacao_notas ENABLE ROW LEVEL SECURITY;

--
-- Name: negociacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.negociacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: notificacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: planos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

--
-- Name: respostas_pendentes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.respostas_pendentes ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: transferencias_atendimento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transferencias_atendimento ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: uso_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uso_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;