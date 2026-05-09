const axios = require("axios");
const { notifyDiscord } = require("../lib/discord");
const {
  getUser,
  saveRequest,
  saveRequestLog,
} = require("../lib/relay-store");

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;

class ValidationError extends Error {}
class NotFoundError extends Error {}

const validators = {
  codepay(payload) {
    const { movId, externalId, status, value } = payload || {};
    if (!movId || !externalId || !status || !value) {
      throw new ValidationError("Parametros faltando!");
    }
  },
  pagstar(payload) {
    const { endToEndId, valor } = payload || {};
    if (!endToEndId || !valor) {
      throw new ValidationError("Parametros faltando!");
    }
  },
  pay2m(payload) {
    const { notification_type, message } = payload || {};
    const { reference_code, external_reference, status, value } = message || {};
    if (
      !notification_type ||
      !reference_code ||
      !external_reference ||
      !status ||
      !value
    ) {
      throw new ValidationError("Parametros faltando!");
    }
  },
};

const externalIdResolvers = {
  codepay: (p) => p?.externalId,
  pagstar: (p) => p?.endToEndId,
  pay2m: (p) => p?.message?.external_reference,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postOnce(url, payload) {
  return axios.post(url, payload, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: { Connection: "close" },
  });
}

async function deliverWebhook({ requestId, user, payload, gateway }) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await postOnce(user.targetUrl, payload);

      await saveRequestLog({
        requestId,
        status: "success",
        responseCode: response.status,
        message: response.data,
      });

      console.log(
        `Webhook entregue [${user.userName}] tentativa ${attempt}/${MAX_ATTEMPTS}`
      );
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  const message = lastError?.message || "Erro desconhecido";
  const responseCode = lastError?.response?.status || 0;

  await saveRequestLog({
    requestId,
    status: "failed",
    responseCode,
    message,
  });

  console.error(
    `Falha ao entregar webhook [${user.userName}]:`,
    message
  );

  const externalId = externalIdResolvers[gateway]?.(payload) || "";
  await notifyDiscord(
    `Falha ao entregar webhook do usuario **${user.userName}** (${user.pathUrl})\n` +
      `Gateway: ${gateway}\n` +
      `Payment ID: ${externalId}\n` +
      `Tentativas: ${MAX_ATTEMPTS}/${MAX_ATTEMPTS}\n` +
      `Request ID: ${requestId}\n` +
      `Erro: ${message}\n` +
      `URL: ${user.targetUrl}`
  );

  return false;
}

async function processWebhook({ gateway, pathUrl, payload, requestId }) {
  const validate = validators[gateway];
  if (!validate) {
    throw new ValidationError("Gateway desconhecido");
  }

  validate(payload);

  const user = await getUser(pathUrl);
  if (!user) {
    throw new NotFoundError("User not found!");
  }

  await saveRequest({ requestId, user, payload });
  await deliverWebhook({ requestId, user, payload, gateway });

  return { requestId, message: "Webhook delivery started" };
}

module.exports = { processWebhook, ValidationError, NotFoundError };
