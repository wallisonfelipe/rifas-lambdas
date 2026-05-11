const axios = require("axios");

const MYIP_PASSWORD = process.env.MYIP_PASSWORD;

exports.handler = async (event) => {
  const password = event?.queryStringParameters?.password;

  if (!MYIP_PASSWORD || password !== MYIP_PASSWORD) {
    return jsonResponse(404, { error: "Not Found" });
  }

  try {
    const response = await axios.get("https://api.ipify.org/?format=json", {
      timeout: 5000,
    });
    return jsonResponse(200, response.data);
  } catch (err) {
    console.error("Erro ao consultar ipify:", err.message);
    return jsonResponse(500, { error: err.message });
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
