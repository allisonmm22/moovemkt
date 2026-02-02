import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';

// Import handlers
import { handleWhatsappWebhook } from './handlers/whatsapp-webhook';
import { handleAiResponder } from './handlers/ai-responder';
import { handleEnviarMensagem } from './handlers/enviar-mensagem';
import { handleProcessarRespostaAgora } from './handlers/processar-resposta-agora';
import { handleProcessarRespostasPendentes } from './handlers/processar-respostas-pendentes';

// Cron handlers
import { runProcessarRespostasPendentes, runProcessarFollowups, runProcessarLembretes, runArquivarMensagens, runConsolidarUso } from './handlers/cron';

const app = new Hono<{ Bindings: Env }>();

// CORS global
app.use('*', cors({
  origin: '*',
  allowHeaders: ['authorization', 'x-client-info', 'apikey', 'content-type'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'crm-workers' }));
app.get('/health', (c) => c.json({ status: 'ok' }));

// ===== ROTAS CRÍTICAS (ALTA PRIORIDADE) =====
app.all('/whatsapp-webhook', handleWhatsappWebhook);
app.post('/ai-responder', handleAiResponder);
app.post('/enviar-mensagem', handleEnviarMensagem);
app.post('/processar-resposta-agora', handleProcessarRespostaAgora);
app.post('/processar-respostas-pendentes', handleProcessarRespostasPendentes);

// ===== ROTAS MÉDIA PRIORIDADE (a serem migradas) =====
// app.post('/download-media', handleDownloadMedia);
// app.post('/processar-followups', handleProcessarFollowups);
// app.post('/processar-followups-agendados', handleProcessarFollowupsAgendados);
// app.post('/processar-lembretes', handleProcessarLembretes);
// app.post('/transcrever-audio', handleTranscreverAudio);
// app.post('/resumir-conversa', handleResumirConversa);
// app.post('/registrar-log', handleRegistrarLog);

// ===== ROTAS BAIXA PRIORIDADE (a serem migradas) =====
// Auth/Admin
// app.post('/signup-completo', handleSignupCompleto);
// app.post('/reset-user-password', handleResetUserPassword);
// app.post('/bootstrap-super-admin', handleBootstrapSuperAdmin);
// app.post('/criar-conta-admin', handleCriarContaAdmin);
// app.post('/desativar-conta', handleDesativarConta);

// Evolution API
// app.post('/evolution-connect', handleEvolutionConnect);
// app.post('/evolution-disconnect', handleEvolutionDisconnect);
// app.post('/evolution-connection-status', handleEvolutionConnectionStatus);
// app.post('/evolution-create-instance', handleEvolutionCreateInstance);
// app.post('/evolution-delete-instance', handleEvolutionDeleteInstance);
// app.post('/evolution-set-webhook', handleEvolutionSetWebhook);
// app.post('/evolution-fetch-messages', handleEvolutionFetchMessages);

// Meta/Instagram
// app.post('/meta-send-message', handleMetaSendMessage);
// app.post('/meta-download-media', handleMetaDownloadMedia);
// app.post('/meta-get-templates', handleMetaGetTemplates);
// app.post('/meta-configure-webhook', handleMetaConfigureWebhook);
// app.all('/meta-verify-webhook', handleMetaVerifyWebhook);
// app.post('/instagram-connect', handleInstagramConnect);
// app.all('/instagram-webhook', handleInstagramWebhook);

// Stripe
// app.all('/stripe-webhook', handleStripeWebhook);
// app.post('/stripe-checkout', handleStripeCheckout);
// app.post('/stripe-customer-portal', handleStripeCustomerPortal);
// app.post('/stripe-test-connection', handleStripeTestConnection);

// Google Calendar
// app.post('/google-calendar-auth', handleGoogleCalendarAuth);
// app.get('/google-calendar-callback', handleGoogleCalendarCallback);
// app.post('/google-calendar-refresh', handleGoogleCalendarRefresh);
// app.post('/google-calendar-actions', handleGoogleCalendarActions);

// Utilitários
// app.post('/analisar-imagem', handleAnalisarImagem);
// app.post('/extrair-texto-pdf', handleExtrairTextoPdf);
// app.post('/api-externa', handleApiExterna);
// app.post('/deletar-mensagem', handleDeletarMensagem);
// app.post('/executar-acao', handleExecutarAcao);
// app.post('/transferir-atendimento', handleTransferirAtendimento);
// app.post('/validar-limite-plano', handleValidarLimitePlano);
// app.post('/verificar-limites-plano', handleVerificarLimitesPlano);
// app.post('/send-push-notification', handleSendPushNotification);

// 404 handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: err.message }, 500);
});

// Export para Cloudflare Workers
export default {
  // HTTP handler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  // Cron handler (Scheduled Workers)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const trigger = event.cron;
    console.log(`[CRON] Trigger: ${trigger}`);

    try {
      switch (trigger) {
        case '*/5 * * * *':
          // A cada 5 minutos: processar respostas pendentes e followups agendados
          await runProcessarRespostasPendentes(env);
          await runProcessarFollowups(env);
          break;

        case '*/10 * * * *':
          // A cada 10 minutos: processar lembretes
          await runProcessarLembretes(env);
          break;

        case '0 3 * * *':
          // 3h UTC: arquivar mensagens antigas
          await runArquivarMensagens(env);
          break;

        case '0 4 * * *':
          // 4h UTC: consolidar uso diário
          await runConsolidarUso(env);
          break;

        default:
          console.log(`[CRON] Trigger não reconhecido: ${trigger}`);
      }
    } catch (error) {
      console.error(`[CRON] Erro no trigger ${trigger}:`, error);
    }
  },
};
