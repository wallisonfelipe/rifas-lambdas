const axios = require("axios");

const UNUPAY_BASE_URL = "https://api.fastsoftbrasil.com";

// Unupay exige email no customer; a maioria dos compradores nao tem email cadastrado,
// entao usamos um email institucional fixo em todas as requests.
const DEFAULT_CUSTOMER_EMAIL = "no-reply@rifa.com.br";

// Unupay usa Basic auth direto (sem endpoint de login). amount/unitPrice em centavos.
async function generatePixUnupay({
  tokenOrCreds,
  externalId,
  value,
  expirationSeconds,
  paymentInfo,
}) {
  if (!tokenOrCreds) throw new Error("Sem credenciais Unupay");

  // tokenOrCreds = "client_id:client_secret"
  const auth = Buffer.from(tokenOrCreds).toString("base64");
  const amountCents = Math.round(Number(value) * 100); // Unupay usa centavos

  const http = axios.create({
    baseURL: UNUPAY_BASE_URL,
    timeout: 8000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    validateStatus: () => true,
  });

  const body = {
    amount: amountCents,
    currency: "BRL",
    paymentMethod: "PIX",
    items: [
      {
        title: "Pagamento",
        unitPrice: amountCents,
        quantity: 1,
        tangible: false,
        externalRef: String(externalId),
      },
    ],
    customer: {
      name: (paymentInfo && paymentInfo.client_name) || "Cliente",
      email: DEFAULT_CUSTOMER_EMAIL,
      // document (CPF) omitido - opcional na Unupay
    },
    pix: { expiresInSeconds: expirationSeconds || 600 },
    metadata: JSON.stringify({ external_id: String(externalId) }),
    traceable: false,
  };

  const resp = await http.post("/api/user/transactions", body);

  const data = resp?.data?.data;
  if (!data?.id || !data?.pix?.qrcode) {
    throw new Error(
      resp?.data ? JSON.stringify(resp.data) : "Resposta invalida do Unupay"
    );
  }

  return {
    paymentId: data.id,
    pix: data.pix.qrcode,
  };
}

module.exports = { generatePixUnupay };
