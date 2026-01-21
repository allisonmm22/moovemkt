import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função auxiliar para converter base64url para Uint8Array com tipo correto
function base64UrlToBytes(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function bytesToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concatArrayBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new ArrayBuffer(totalLength);
  const view = new Uint8Array(result);
  let offset = 0;
  for (const buf of buffers) {
    view.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result;
}

// Gerar JWT para VAPID
async function generateVapidJwt(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  
  const encoder = new TextEncoder();
  const headerB64 = bytesToBase64Url(encoder.encode(JSON.stringify(header)).buffer as ArrayBuffer);
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const unsignedToken = `${headerB64}.${payloadB64}`;
  
  // Preparar chaves para JWK
  const publicKeyBytes = new Uint8Array(base64UrlToBytes(publicKey));
  const privateKeyBytes = new Uint8Array(base64UrlToBytes(privateKey));
  
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(publicKeyBytes.slice(1, 33).buffer as ArrayBuffer),
    y: bytesToBase64Url(publicKeyBytes.slice(33, 65).buffer as ArrayBuffer),
    d: bytesToBase64Url(privateKeyBytes.buffer as ArrayBuffer),
  };
  
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  
  const signatureRaw = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(unsignedToken)
  );
  
  const signatureB64 = bytesToBase64Url(signatureRaw);
  return `${unsignedToken}.${signatureB64}`;
}

// Enviar push notification usando Web Push Protocol
async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<Response> {
  const encoder = new TextEncoder();
  
  // 1. Gerar par de chaves ECDH locais
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  
  // 2. Importar chave pública do cliente
  const clientPublicKeyBuffer = base64UrlToBytes(subscription.keys.p256dh);
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  
  // 3. Derivar shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    localKeyPair.privateKey,
    256
  );
  
  // 4. Obter auth secret e chave pública local
  const authSecretBuffer = base64UrlToBytes(subscription.keys.auth);
  const localPublicKeyRaw = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
  
  // 5. Salt aleatório
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // 6. Derivar IKM usando HKDF
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  
  const authInfo = encoder.encode('Content-Encoding: auth\x00');
  
  const ikm = await crypto.subtle.deriveBits(
    { 
      name: 'HKDF', 
      salt: authSecretBuffer, 
      info: authInfo.buffer as ArrayBuffer, 
      hash: 'SHA-256' 
    },
    sharedSecretKey,
    256
  );
  
  // 7. Importar IKM e derivar CEK e nonce
  const ikmKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const cekInfo = encoder.encode('Content-Encoding: aes128gcm\x00');
  const nonceInfo = encoder.encode('Content-Encoding: nonce\x00');
  
  const cek = await crypto.subtle.deriveKey(
    { 
      name: 'HKDF', 
      salt: salt.buffer as ArrayBuffer, 
      info: cekInfo.buffer as ArrayBuffer, 
      hash: 'SHA-256' 
    },
    ikmKey,
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt']
  );
  
  const nonceBytes = await crypto.subtle.deriveBits(
    { 
      name: 'HKDF', 
      salt: salt.buffer as ArrayBuffer, 
      info: nonceInfo.buffer as ArrayBuffer, 
      hash: 'SHA-256' 
    },
    ikmKey,
    96
  );
  
  // 8. Preparar plaintext com delimiter
  const payloadBytes = encoder.encode(payload);
  const plaintext = new ArrayBuffer(payloadBytes.length + 1);
  const plaintextView = new Uint8Array(plaintext);
  plaintextView.set(payloadBytes);
  plaintextView[payloadBytes.length] = 2; // Delimiter byte
  
  // 9. Criptografar
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBytes },
    cek,
    plaintext
  );
  
  // 10. Construir header aes128gcm
  const recordSize = 4096;
  const localPubKeyBytes = new Uint8Array(localPublicKeyRaw);
  const headerSize = 16 + 4 + 1 + localPubKeyBytes.length; // salt + recordSize + keyIdLen + keyId
  const header = new ArrayBuffer(headerSize);
  const headerView = new Uint8Array(header);
  const headerDataView = new DataView(header);
  
  headerView.set(salt, 0);
  headerDataView.setUint32(16, recordSize, false);
  headerView[20] = localPubKeyBytes.length;
  headerView.set(localPubKeyBytes, 21);
  
  // 11. Combinar header + ciphertext
  const body = concatArrayBuffers(header, ciphertext);
  
  // 12. Gerar VAPID JWT
  const vapidJwt = await generateVapidJwt(
    subscription.endpoint,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject
  );
  
  // 13. Enviar request
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Authorization': `vapid t=${vapidJwt}, k=${vapidPublicKey}`,
      'TTL': '86400',
      'Urgency': 'high',
    },
    body: body,
  });
  
  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
  
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys não configuradas');
    return new Response(JSON.stringify({ error: 'VAPID keys não configuradas' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { conta_id, usuario_id, title, body, url, data } = await req.json();

    console.log('=== ENVIANDO PUSH NOTIFICATION ===');
    console.log('Conta:', conta_id);
    console.log('Usuario:', usuario_id);
    console.log('Título:', title);

    // Buscar subscriptions
    let query = supabase.from('push_subscriptions').select('*');
    
    if (usuario_id) {
      query = query.eq('usuario_id', usuario_id);
    } else if (conta_id) {
      query = query.eq('conta_id', conta_id);
    } else {
      return new Response(JSON.stringify({ error: 'conta_id ou usuario_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subscriptions, error: subError } = await query;

    if (subError) {
      console.error('Erro ao buscar subscriptions:', subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('Nenhuma subscription encontrada');
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'Nenhuma subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Encontradas ${subscriptions.length} subscriptions`);

    const payload = JSON.stringify({
      title: title || 'Nova mensagem',
      body: body || 'Você recebeu uma nova mensagem',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      url: url || '/conversas',
      data: data || {},
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const subscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };

          const response = await sendWebPush(
            subscription,
            payload,
            vapidPublicKey,
            vapidPrivateKey,
            'mailto:admin@moovecrm.com'
          );

          console.log(`Push para ${sub.endpoint.substring(0, 50)}... status:`, response.status);

          // Se subscription expirou ou é inválida, remover
          if (response.status === 404 || response.status === 410) {
            console.log('Subscription expirada, removendo...');
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            return { success: false, removed: true };
          }

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Erro no push:', response.status, errorText);
            return { success: false, error: errorText };
          }

          return { success: true };
        } catch (error) {
          console.error('Erro ao enviar push:', error);
          return { success: false, error: String(error) };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as {success: boolean}).success).length;
    const removed = results.filter(r => r.status === 'fulfilled' && (r.value as {removed?: boolean}).removed).length;

    console.log(`Enviados: ${successful}, Removidos: ${removed}`);

    return new Response(JSON.stringify({ 
      success: true, 
      sent: successful, 
      removed,
      total: subscriptions.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro ao processar push:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
