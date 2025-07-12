// src/services/holidayService.js
const axios = require("axios");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");
const {
	holidayFileExists,
	readHolidayFile,
	writeHolidayFile,
} = require("./holidayFileUtil");

const SARALPATRO_API_URL = "https://api.saralpatro.com/graphql";

// In-memory cache: { [bsYear]: { holidays: Set<YYYY-MM-DD>, fetchedAt: Date } }
const holidayCache = {};

// Helper: Convert AD date to YYYY-MM-DD string
function formatDate(adYear, adMonth, adDay) {
	return `${adYear}-${String(adMonth).padStart(2, "0")}-${String(adDay).padStart(2, "0")}`;
}

// Fetch holidays for a given BS year from SaralPatro, or load from file if exists
async function fetchHolidaysForBSYear(bsYear) {
	// Try file first
	if (holidayFileExists(bsYear)) {
		const holidaysArr = readHolidayFile(bsYear);
		// Support both array and Set
		return new Set(holidaysArr);
	}

	// Check cache (refresh every 24 hours)
	if (
		holidayCache[bsYear] &&
		Date.now() - holidayCache[bsYear].fetchedAt < 24 * 60 * 60 * 1000
	) {
		return holidayCache[bsYear].holidays;
	}

	// Fetch from API
	const query = `query { dates(bsYear: ${bsYear}) { adYear adMonth adDay isHoliday } }`;
	const response = await axios.post(
		SARALPATRO_API_URL,
		{ query },
		{ headers: { "Content-Type": "application/json" } }
	);

	const holidays = [];
	if (
		response.data &&
		response.data.data &&
		Array.isArray(response.data.data.dates)
	) {
		response.data.data.dates.forEach((d) => {
			if (d.isHoliday) {
				holidays.push(formatDate(d.adYear, d.adMonth, d.adDay));
			}
		});
	}
	// Save to file for future use
	writeHolidayFile(bsYear, holidays);
	holidayCache[bsYear] = { holidays: new Set(holidays), fetchedAt: Date.now() };
	return new Set(holidays);
}

// Check if an AD date (YYYY-MM-DD or Date object) is a holiday
async function isHoliday(adDate) {
	const date = dayjs(adDate);
	const adYear = date.year();
	const adMonth = date.month() + 1; // dayjs month is 0-indexed
	const adDay = date.date();

	// Find corresponding BS year (roughly, BS = AD + 57)
	const bsYear = adYear + 57;
	const holidays = await fetchHolidaysForBSYear(bsYear);
	return holidays.has(formatDate(adYear, adMonth, adDay));
}

module.exports = {
	isHoliday,
	fetchHolidaysForBSYear,
};
