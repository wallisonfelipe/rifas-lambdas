const QRCode = require("qrcode");

async function pixToQrBase64(pix) {
  const buf = await QRCode.toBuffer(pix, { type: "png", width: 300 });
  return buf.toString("base64");
}

module.exports = { pixToQrBase64 };