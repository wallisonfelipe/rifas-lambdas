const axios = require("axios");

function parseCredentials(tokenOrCreds) {
  if (!tokenOrCreds) throw new Error("Credencial/token não fornecido");

  if (tokenOrCreds.startsWith("Bearer ")) {
    return { type: "bearer", value: tokenOrCreds.replace("Bearer ", "") };
  }

  if (tokenOrCreds.includes(":")) {
    const [clientId, password] = tokenOrCreds.split(":");
    if (!clientId || !password) {
      throw new Error("Credenciais CodePay inválidas (clientId:password)");
    }
    return { type: "credentials", clientId, password };
  }

  return { type: "token", value: tokenOrCreds };
}

// cache por credencial/baseUrl
const tokenCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

function getCacheKey(baseUrl, tokenOrCreds) {
  return `${baseUrl}::${tokenOrCreds}`;
}

async function loginAndGetToken({ baseUrl, tokenOrCreds }) {

  const http = axios.create({
    baseURL: baseUrl,
    timeout: 5000,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    validateStatus: () => true,
  });

  const parsed = parseCredentials(tokenOrCreds);

  // token já pronto (não precisa autenticar)
  if (parsed.type === "token" || parsed.type === "bearer") {
    return { http, token: parsed.value };
  }

  const resp = await http.post("/client/authenticate", {
    clientId: parsed.clientId,
    password: parsed.password,
  });

  if (!resp?.data?.data?.token) {
    const err = resp?.data?.error
      ? `CodePay login error: ${resp.data.error}`
      : "CodePay login error";
    throw new Error(err);
  }

  return { http, token: resp.data.data.token };
}

async function loginCodePay({ baseUrl, tokenOrCreds }) {
  const cacheKey = getCacheKey(baseUrl, tokenOrCreds);
  const cached = tokenCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return { http: cached.http, token: cached.token };
  }

  const { http, token } = await loginAndGetToken({
    baseUrl,
    tokenOrCreds,
  });

  tokenCache.set(cacheKey, {
    http,
    token,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return { http, token };
}

async function generatePix({
  http,
  token,
  externalId,
  value,
  expirationSeconds,
}) {
  const resp = await http.post(
    "/payment/pix/generate-pix",
    {
      externalId,
      value,
      expiration: expirationSeconds,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp?.data?.data?.pix || !resp?.data?.data?.paymentId) {
    throw new Error(
      resp?.data ? JSON.stringify(resp.data) : "Resposta inválida do CodePay"
    );
  }

  return {
    paymentId: resp.data.data.paymentId,
    pix: resp.data.data.pix,
  };
}

module.exports = { loginCodePay, generatePix };