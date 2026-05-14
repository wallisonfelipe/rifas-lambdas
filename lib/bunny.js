const fs = require("fs");
const path = require("path");
const axios = require("axios");

const REGION_HOSTS = {
	BR: "br.storage.bunnycdn.com",
	DE: "storage.bunnycdn.com",
	NY: "ny.storage.bunnycdn.com",
	LA: "la.storage.bunnycdn.com",
	SG: "sg.storage.bunnycdn.com",
	SYD: "syd.storage.bunnycdn.com",
	UK: "uk.storage.bunnycdn.com",
};

function normalizePath(p) {
	return String(p || "")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}

async function uploadFile({
	storageZone,
	apiKey,
	region,
	uploadPath,
	fileName,
	cdnUrl,
	localFilePath,
}) {
	if (!storageZone) throw new Error("bunny: storageZone obrigatorio");
	if (!apiKey) throw new Error("bunny: apiKey obrigatorio");
	if (!localFilePath) throw new Error("bunny: localFilePath obrigatorio");

	const host = REGION_HOSTS[(region || "BR").toUpperCase()] || REGION_HOSTS.BR;
	const cleanPath = normalizePath(uploadPath);
	const cleanName = fileName || path.basename(localFilePath);
	const remoteKey = cleanPath ? `${cleanPath}/${cleanName}` : cleanName;

	const url = `https://${host}/${storageZone}/${remoteKey}`;
	const stat = fs.statSync(localFilePath);
	const stream = fs.createReadStream(localFilePath);

	await axios.put(url, stream, {
		maxBodyLength: Infinity,
		maxContentLength: Infinity,
		headers: {
			AccessKey: apiKey,
			"Content-Type": "application/octet-stream",
			"Content-Length": stat.size,
		},
	});

	const base = (cdnUrl || "").replace(/\/+$/, "");
	return `${base}/${remoteKey}`;
}

module.exports = { uploadFile };
