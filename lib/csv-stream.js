const fs = require("fs");

const BOM = "﻿";

function escapeCell(value, delimiter) {
	if (value === null || value === undefined) return "";
	const str = String(value);
	if (
		str.includes(delimiter) ||
		str.includes('"') ||
		str.includes("\n") ||
		str.includes("\r")
	) {
		return '"' + str.replace(/"/g, '""') + '"';
	}
	return str;
}

function createCsvWriter(filePath, { delimiter = ";", useBom = true } = {}) {
	const out = fs.createWriteStream(filePath, { encoding: "utf8" });
	if (useBom) out.write(BOM);

	function writeRow(cells) {
		const line =
			cells.map((c) => escapeCell(c, delimiter)).join(delimiter) + "\n";
		if (!out.write(line)) {
			return new Promise((resolve) => out.once("drain", resolve));
		}
		return null;
	}

	function close() {
		return new Promise((resolve, reject) => {
			out.once("error", reject);
			out.once("finish", resolve);
			out.end();
		});
	}

	return { writeRow, close };
}

module.exports = { createCsvWriter };
