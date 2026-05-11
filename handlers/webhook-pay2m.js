const { randomUUID } = require("crypto");
const {
  processWebhook,
  ValidationError,
  NotFoundError,
} = require("../services/webhook-relay.service");

exports.handler = async (event) => {
  const requestId = randomUUID();
  const pathUrl = event?.pathParameters?.pathUrl;

  let payload;
  try {
    payload = parseBody(event);
  } catch (_) {
    return jsonResponse(400, { requestId, error: "Body invalido" });
  }

  try {
    const result = await processWebhook({
      gateway: "pay2m",
      pathUrl,
      payload,
      requestId,
    });
    return jsonResponse(200, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonResponse(422, { requestId, error: err.message });
    }
    if (err instanceof NotFoundError) {
      return jsonResponse(404, { requestId, error: err.message });
    }
    console.error(`[${requestId}] Erro processando webhook pay2m:`, err);
    return jsonResponse(500, { requestId, error: "Could not process webhook" });
  }
};

function parseBody(event) {
  if (!event?.body) return {};
  return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
