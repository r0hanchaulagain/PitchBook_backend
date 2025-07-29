const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

DOMPurify.setConfig({
	ALLOWED_TAGS: [],
	ALLOWED_ATTR: [],
	FORBID_TAGS: [
		"script",
		"iframe",
		"object",
		"embed",
		"svg",
		"img",
		"audio",
		"video",
		"body",
		"frameset",
		"applet",
		"marquee",
		"xml",
		"bgsound",
		"title",
		"style",
		"link",
		"meta",
	],
	FORBID_ATTR: [
		"onload",
		"onerror",
		"onclick",
		"onmouseover",
		"onmouseenter",
		"onmouseleave",
		"onmousewheel",
		"onmousedown",
		"onmouseup",
		"onmousemove",
		"onmouseout",
		"onfocus",
		"onblur",
		"onchange",
		"onsubmit",
		"onreset",
		"onselect",
		"onunload",
		"onbeforeunload",
		"onpagehide",
		"onpageshow",
		"onresize",
		"onscroll",
		"onkeydown",
		"onkeyup",
		"onkeypress",
		"onpropertychange",
		"onreadystatechange",
		"onbeforeload",
		"onbeforeprint",
		"onafterprint",
		"onbeforecopy",
		"onbeforecut",
		"onbeforepaste",
		"oncopy",
		"oncut",
		"onpaste",
		"oncontextmenu",
		"onhelp",
		"onselectstart",
		"onstart",
		"onfinish",
		"onbounce",
		"onbeforeeditfocus",
		"onlayoutcomplete",
		"onlosecapture",
		"onpropertychange",
		"onreadystatechange",
		"onrowsdelete",
		"onrowsinserted",
		"onstop",
		"onbeforedeactivate",
		"onbeforeactivate",
		"onbeforecopy",
		"onbeforecut",
		"onbeforepaste",
		"oncopy",
		"oncut",
		"onpaste",
		"oncontextmenu",
		"onhelp",
		"onselectstart",
		"onstart",
		"onfinish",
		"onbounce",
		"onbeforeeditfocus",
		"onlayoutcomplete",
		"onlosecapture",
		"onpropertychange",
		"onreadystatechange",
		"onrowsdelete",
		"onrowsinserted",
		"onstop",
		"onbeforedeactivate",
		"onbeforeactivate",
	],
	KEEP_CONTENT: false,
	RETURN_DOM: false,
	RETURN_DOM_FRAGMENT: false,
	RETURN_DOM_IMPORT: false,
	RETURN_TRUSTED_TYPE: false,
	SANITIZE_DOM: true,
	WHOLE_DOCUMENT: false,
	RETURN_TRUSTED_TYPE: false,
	ADD_URI_SAFE_ATTR: [],
	ALLOW_DATA_ATTR: false,
	ALLOW_UNKNOWN_PROTOCOLS: false,
	ALLOWED_URI_REGEXP:
		/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
	ADD_TAGS: [],
	ADD_ATTR: [],
	USE_PROFILES: {
		html: false,
		svg: false,
		svgFilters: false,
		mathMl: false,
	},
});

function additionalSanitization(input) {
	if (typeof input !== "string") return input;
	let sanitized = input;
	sanitized = sanitized.replace(/\x00/g, "");
	try {
		sanitized = decodeURIComponent(sanitized);
	} catch (e) {}
	sanitized = sanitized.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
		return String.fromCharCode(parseInt(hex, 16));
	});
	sanitized = sanitized.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
		return String.fromCharCode(parseInt(hex, 16));
	});

	const dangerousPatterns = [
		/javascript:/gi,
		/vbscript:/gi,
		/data:/gi,
		/on\w+\s*=/gi,
		/<script/gi,
		/<iframe/gi,
		/<object/gi,
		/<embed/gi,
		/<svg/gi,
		/<img/gi,
		/<audio/gi,
		/<video/gi,
		/<body/gi,
		/<frameset/gi,
		/<applet/gi,
		/<marquee/gi,
		/<xml/gi,
		/<bgsound/gi,
		/<title/gi,
		/<style/gi,
		/<link/gi,
		/<meta/gi,
		/prompt\(/gi,
		/alert\(/gi,
		/confirm\(/gi,
		/eval\(/gi,
		/setTimeout\(/gi,
		/setInterval\(/gi,
		/Function\(/gi,
		/new\s+Function/gi,
	];

	dangerousPatterns.forEach((pattern) => {
		sanitized = sanitized.replace(pattern, "");
	});

	sanitized = sanitized.replace(/["']/g, "");

	sanitized = sanitized.replace(/[<>]/g, "");

	return sanitized;
}

function sanitizeAllStrings(input) {
	if (typeof input === "string") {
		let sanitized = DOMPurify.sanitize(input);

		sanitized = additionalSanitization(sanitized);
		return sanitized;
	}
	if (Array.isArray(input)) {
		return input.map(sanitizeAllStrings);
	}
	if (input && typeof input === "object" && !(input instanceof Date)) {
		const sanitized = {};
		for (const [key, value] of Object.entries(input)) {
			sanitized[key] = sanitizeAllStrings(value);
		}
		return sanitized;
	}
	return input;
}

function xssSanitizerImproved(req, res, next) {
	if (req.body) req.body = sanitizeAllStrings(req.body);
	if (req.query) {
		Object.keys(req.query).forEach((key) => {
			if (typeof req.query[key] === "string") {
				req.query[key] = sanitizeAllStrings(req.query[key]);
			}
		});
	}
	if (req.params) {
		Object.keys(req.params).forEach((key) => {
			if (typeof req.params[key] === "string") {
				req.params[key] = sanitizeAllStrings(req.params[key]);
			}
		});
	}
	next();
}

module.exports = xssSanitizerImproved;
