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

const holidayCache = {};

function formatDate(adYear, adMonth, adDay) {
	return `${adYear}-${String(adMonth).padStart(2, "0")}-${String(adDay).padStart(2, "0")}`;
}

async function fetchHolidaysForBSYear(bsYear) {
	try {
		if (holidayFileExists(bsYear)) {
			try {
				const holidaysArr = readHolidayFile(bsYear);
				if (
					holidaysArr &&
					Array.isArray(holidaysArr) &&
					holidaysArr.length > 0
				) {
					return new Set(holidaysArr);
				}
			} catch (fileError) {
				console.error(
					`Error reading holiday file for BS ${bsYear}:`,
					fileError
				);
			}
		}

		if (
			holidayCache[bsYear] &&
			Date.now() - holidayCache[bsYear].fetchedAt < 24 * 60 * 60 * 1000
		) {
			return holidayCache[bsYear].holidays;
		}


		const response = await axios.get(
			`https://raw.githubusercontent.com/Saral-Patro/data/main/${bsYear}.json`,
			{
				timeout: 5000, // 5 second timeout
				headers: { Accept: "application/json" },
			}
		);

		const holidays = [];
		if (response.data && Array.isArray(response.data)) {
			response.data.forEach((holiday) => {
				if (
					holiday.isHoliday &&
					holiday.adYear &&
					holiday.adMonth &&
					holiday.adDay
				) {
					holidays.push(
						formatDate(holiday.adYear, holiday.adMonth, holiday.adDay)
					);
				}
			});
		}

		if (holidays.length > 0) {
			try {
				writeHolidayFile(bsYear, holidays);
			} catch (writeError) {
				console.error(
					`Error writing holiday file for BS ${bsYear}:`,
					writeError
				);
			}
		}

		const holidaysSet = new Set(holidays);
		holidayCache[bsYear] = {
			holidays: holidaysSet,
			fetchedAt: Date.now(),
		};

		return holidaysSet;
	} catch (error) {
		console.error(
			`Error fetching holidays for BS ${bsYear} from GitHub:`,
			error
		);
		// Return an empty set if there's an error
		return new Set();
	}
}

async function isHoliday(adDate) {
	const date = dayjs(adDate);
	const adYear = date.year();
	const adMonth = date.month() + 1;
	const adDay = date.date();

	const bsYear = adYear + 57;
	const holidays = await fetchHolidaysForBSYear(bsYear);
	return holidays.has(formatDate(adYear, adMonth, adDay));
}

module.exports = {
	isHoliday,
	fetchHolidaysForBSYear,
};
