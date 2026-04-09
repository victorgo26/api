const express = require('express');
const admin   = require('firebase-admin');

// ─── INICIALIZA FIREBASE ──────────────────────────────────────────────────────
// O JSON da service account vem como variável de ambiente no Railway
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ─── APP ──────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── MIDDLEWARE DE AUTENTICAÇÃO ───────────────────────────────────────────────
function authenticate(req, res, next) {
  const key = req.headers['x-secret-key'];
  if (!key || key !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

// ─── ROTA PRINCIPAL ───────────────────────────────────────────────────────────
app.post('/notify', authenticate, async (req, res) => {
  const { botUsername, channelName, guildName, content, embeds, timestamp } = req.body;

  if (!content && (!embeds || embeds.length === 0)) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }

  // Monta o texto da notificação
  let notificationBody = content || '';
  if (embeds && embeds.length > 0) {
    const embed = embeds[0];
    if (embed.title)       notificationBody = embed.title;
    if (embed.description) notificationBody += ` — ${embed.description}`;
  }

  // Limita o tamanho para a notificação
  if (notificationBody.length > 200) {
    notificationBody = notificationBody.slice(0, 197) + '...';
  }

  const message = {
    // FCM topic: todos os dispositivos inscritos receberão
    topic: 'discord_alerts',

    notification: {
      title: `📩 ${guildName} • #${channelName}`,
      body:  notificationBody,
    },

    // Dados extras que o app pode usar
    data: {
      botUsername:  botUsername || '',
      channelName:  channelName || '',
      guildName:    guildName  || '',
      fullContent:  (content   || '').slice(0, 500),
      timestamp:    timestamp  || new Date().toISOString(),
    },

    android: {
      priority: 'high',
      notification: {
        sound:       'default',
        channelId:   'discord_alerts',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`✅ Notificação enviada — messageId: ${response}`);
    return res.json({ success: true, messageId: response });
  } catch (err) {
    console.error('❌ Erro ao enviar FCM:', err);
    return res.status(500).json({ error: 'Falha ao enviar notificação', details: err.message });
  }
});

// ─── HEALTHCHECK ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});
