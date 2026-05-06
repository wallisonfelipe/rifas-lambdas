const axios = require("axios");

const PAY2M_BASE_URL = "https://portal.pay2m.com.br";

// cache por credencial
const tokenCache = new Map();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutos

async function loginPay2M({ tokenOrCreds }) {
  if (!tokenOrCreds) throw new Error("Credencial Pay2M não fornecida");

  const cacheKey = tokenOrCreds;
  const cached = tokenCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return { http: cached.http, token: cached.token };
  }

  const http = axios.create({
    baseURL: PAY2M_BASE_URL,
    timeout: 5000,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    validateStatus: () => true,
  });

  const resp = await http.post(
    "/api/auth/generate_token",
    { grant_type: "client_credentials" },
    {
      headers: {
        Authorization: `Basic ${Buffer.from(tokenOrCreds).toString("base64")}`,
      },
    }
  );

  if (!resp?.data?.access_token) {
    const err = resp?.data?.error
      ? `Erro ao logar no Pay2M: ${resp.data.error}`
      : "Erro ao logar no Pay2M";
    throw new Error(err);
  }

  const token = resp.data.access_token;

  tokenCache.set(cacheKey, {
    http,
    token,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return { http, token };
}

async function generatePixPay2M({
  http,
  token,
  externalId,
  value,
  expirationSeconds,
}) {
  const resp = await http.post(
    "/api/v1/pix/qrcode",
    {
      generator_name: "Pagamento",
      external_reference: externalId,
      value: Number(Number(value).toFixed(2)),
      expiration_time: expirationSeconds || 600,
      payer_message: "Cobranca de pagamento",
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp?.data?.reference_code || !resp?.data?.content) {
    throw new Error(
      resp?.data ? JSON.stringify(resp.data) : "Resposta invalida do Pay2M"
    );
  }

  return {
    paymentId: resp.data.reference_code,
    pix: resp.data.content,
  };
}

module.exports = { loginPay2M, generatePixPay2M };
