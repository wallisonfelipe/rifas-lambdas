const axios = require("axios");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

async function notifyDiscord(message) {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn("DISCORD_WEBHOOK_URL nao configurada, pulando notificacao");
    return;
  }

  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      username: "Webhook Monitor",
      avatar_url: "https://cdn-icons-png.flaticon.com/512/906/906361.png",
      embeds: [
        {
          title: "Webhook Falhou",
          description: message,
          color: 16711680,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem ao Discord:", err.message);
  }
}

module.exports = { notifyDiscord };
