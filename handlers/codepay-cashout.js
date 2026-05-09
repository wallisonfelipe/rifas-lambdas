const {
  processCashout,
  ValidationError,
  GatewayError,
} = require("../services/codepay-cashout.service");

exports.handler = async (event) => {
  let body;
  try {
    body = parseBody(event);
  } catch (_) {
    return jsonResponse(400, { error: "Body invalido" });
  }

  try {
    const { status, data } = await processCashout(body);
    return jsonResponse(status, data);
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonResponse(400, { error: err.message });
    }
    if (err instanceof GatewayError) {
      return jsonResponse(502, { error: err.message });
    }
    console.error("Erro inesperado no cashout:", err);
    return jsonResponse(500, { error: "Erro inesperado" });
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
