const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../lib/dynamo");
const { loginCodePay, generatePix } = require("../lib/gateway-codepay");
const { loginPay2M, generatePixPay2M } = require("../lib/gateway-pay2m");
const { pixToQrBase64 } = require("../lib/qrcode");
const { randomUUID } = require("crypto");

const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE;
const CODEPAY_BASE_URL = 'https://production.codetech.technology/cli';

function nowIso() {
  return new Date().toISOString();
}

function toNumber2(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Valor inválido: ${value}`);
  return Number(n.toFixed(2));
}

async function generateWithCodepay({ tokenOrCreds, externalId, value, expirationSeconds }) {
  if (!tokenOrCreds) throw new Error("Sem credenciais CodePay");

  const { http, token } = await loginCodePay({
    baseUrl: CODEPAY_BASE_URL,
    tokenOrCreds,
  });

  return generatePix({ http, token, externalId, value, expirationSeconds });
}

async function generateWithPay2M({ tokenOrCreds, externalId, value, expirationSeconds }) {
  if (!tokenOrCreds) throw new Error("Sem credenciais Pay2M");

  const { http, token } = await loginPay2M({ tokenOrCreds });

  return generatePixPay2M({ http, token, externalId, value, expirationSeconds });
}

async function executeGenerate(detail) {
  const tenant = detail.tenant;
  const paymentInfo = detail.paymentInfo;
  const externalId = detail.externalId;
  const expiresInMinutes = Number(detail.expiresInMinutes || 30);
  const gateway = detail.gateway || "codepay";

  if (!tenant || !externalId) {
    throw new Error("tenant/externalId ausentes");
  }

  const value = toNumber2(detail.value);
  const paymentId = randomUUID();
  const expirationSeconds = Math.max(60, expiresInMinutes * 60);

  const startedAt = Date.now();
  let pixResp;

  if (gateway === "pay2m") {
    const tokenOrCreds = detail.pay2mTokenOrCreds || null;
    pixResp = await generateWithPay2M({ tokenOrCreds, externalId, value, expirationSeconds });
  } else {
    const tokenOrCreds = detail.codepayTokenOrCreds || null;
    pixResp = await generateWithCodepay({ tokenOrCreds, externalId, value, expirationSeconds });
  }

  const qrBase64 = await pixToQrBase64(pixResp.pix);

  const createdAt = nowIso();
  const createdAtEpoch = Date.now();
  const ttlEpoch =
    Math.floor(Date.now() / 1000) + expirationSeconds + 3600;

  const item = {
    paymentId, // PK absoluta
    entityType: "PAYMENT", // para GSI
    createdAt,
    createdAtEpoch,
    tenant,
    externalId,
    gateway,
    gatewayPaymentId: pixResp.paymentId,
    value,
    pix: pixResp.pix,
    qrCodeImageBase64: qrBase64,
    expiresInMinutes,
    status: "completed",
    ttlEpoch,
    paymentInfo: paymentInfo || null,
  };

  await docClient.send(
    new PutCommand({
      TableName: PAYMENTS_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(paymentId)",
    })
  );

  const elapsed = Date.now() - startedAt;

  return { ok: true, paymentId, elapsedMs: elapsed, data: item };
}

module.exports = { executeGenerate };