const { executeGenerate } = require("../services/generate-qrcode.service");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    const result = await executeGenerate({detail: body});

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};