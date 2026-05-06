const { executeGenerate } = require("../services/generate-qrcode.service");

exports.handler = async (event) => {
  try {
    let data = event.detail ? event.detail : event.body;
    if (typeof data == 'string') {
      data = JSON.parse(data)
    }

    return await executeGenerate(data);
  } catch (err) {
    console.error(err);
    throw err;
  }
};