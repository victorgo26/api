const express = require('express');
const admin   = require('firebase-admin');

// Usa as variaveis separadas que ja estao no Railway
const serviceAccount = {
  type:                        process.env.type,
  project_id:                  process.env.project_id,
  private_key_id:              process.env.private_key_id,
  private_key:                 (process.env.private_key || '').replace(/\\n/g, '\n'),
  client_email:                process.env.client_email,
  client_id:                   process.env.client_id,
  auth_uri:                    process.env.auth_uri,
  token_uri:                   process.env.token_uri,
  auth_provider_x509_cert_url: process.env.auth_provider_x509_cert_url,
  client_x509_cert_url:        process.env.client_x509_cert_url,
  universe_domain:             process.env.universe_domain,
};

if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
  console.error('ERRO: variaveis do Firebase incompletas no Railway.');
  process.exit(1);
}

console.log('Firebase configurado para o projeto:', serviceAccount.project_id);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

function authenticate(req, res, next) {
  const key = req.headers['x-secret-key'];
  if (!key || key !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Nao autorizado' });
  }
  next();
}

app.post('/notify', authenticate, async (req, res) => {
  const { botUsername, channelName, guildName, content, embeds, timestamp } = req.body;

  if (!content && (!embeds || embeds.length === 0)) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }

  let notificationBody = content || '';
  if (embeds && embeds.length > 0) {
    const embed = embeds[0];
    if (embed.title)       notificationBody = embed.title;
    if (embed.description) notificationBody += ' - ' + embed.description;
  }

  if (notificationBody.length > 200) {
    notificationBody = notificationBody.slice(0, 197) + '...';
  }

  const message = {
    topic: 'discord_alerts',
    notification: {
      title: 'Discord: ' + guildName + ' #' + channelName,
      body:  notificationBody,
    },
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
        sound:     'default',
        channelId: 'discord_alerts',
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Notificacao enviada:', response);
    return res.json({ success: true, messageId: response });
  } catch (err) {
    console.error('Erro ao enviar FCM:', err);
    return res.status(500).json({ error: 'Falha ao enviar notificacao', details: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log('API rodando na porta ' + PORT);
});
