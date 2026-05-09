const axios = require("axios");
const { notifyDiscord } = require("../lib/discord");

const CODEPAY_BASE_URL = "https://production.codetech.technology/cli";
const REQUEST_TIMEOUT_MS = 5000;

class ValidationError extends Error {}
class GatewayError extends Error {}

async function processCashout({ token, externalId, pixKey, payment }) {
  if (
    !token ||
    !externalId ||
    !pixKey ||
    !payment ||
    Number(payment.amount) <= 0
  ) {
    notifyDiscord(
      `Parametros faltando para cashout:\n` +
        `Token: ${token ? token.substring(0, 4) : "N/A"}...\n` +
        `ExternalId: ${externalId ?? "N/A"}\n` +
        `PixKey: ${pixKey ?? "N/A"}\n` +
        `Amount: ${payment?.amount ?? "N/A"}`
    ).catch(() => {});

    throw new ValidationError("Parametros invalidos para cashout");
  }

  try {
    const response = await axios.post(
      `${CODEPAY_BASE_URL}/payment/pix/pix-key`,
      {
        externalId,
        pixKey,
        payment: { amount: Number(payment.amount) },
      },
      {
        headers: {
          Authorization: token.startsWith("Bearer ")
            ? token
            : `Bearer ${token}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );

    return { status: response.status, data: response.data };
  } catch (error) {
    console.error("Erro ao chamar CodePay:", error.message);
    notifyDiscord(`Erro ao processar cashout:\n${error.message}`).catch(
      () => {}
    );
    throw new GatewayError("Falha ao comunicar com o gateway de pagamento");
  }
}

module.exports = { processCashout, ValidationError, GatewayError };
