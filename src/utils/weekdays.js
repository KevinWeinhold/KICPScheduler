const WEEKDAY_ALIASES = {
	mo: 'Monday',
	mon: 'Monday',
	monday: 'Monday',
	tu: 'Tuesday',
	tue: 'Tuesday',
	tues: 'Tuesday',
	tuesday: 'Tuesday',
	we: 'Wednesday',
	wed: 'Wednesday',
	wednesday: 'Wednesday',
	th: 'Thursday',
	thu: 'Thursday',
	thur: 'Thursday',
	thurs: 'Thursday',
	thursday: 'Thursday',
	fr: 'Friday',
	fri: 'Friday',
	friday: 'Friday',
	sa: 'Saturday',
	sat: 'Saturday',
	saturday: 'Saturday',
	su: 'Sunday',
	sun: 'Sunday',
	sunday: 'Sunday',
};

/** Split comma- or semicolon-separated list values (e.g. "Monday;Wednesday;"). */
export const splitDelimitedList = (val) => {
	if (!val) return [];
	if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
	return String(val)
		.replace(/\band\b/gi, ',')
		.replace(/[\/;&]/g, ',')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
};

export const normalizeWeekday = (day) => {
	if (!day) return '';
	const trimmed = String(day).trim();
	if (!trimmed) return '';
	const key = trimmed.toLowerCase().replace(/\.$/, '');
	if (WEEKDAY_ALIASES[key]) return WEEKDAY_ALIASES[key];
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

export const normalizeWeekdayList = (val) =>
	splitDelimitedList(val).map(normalizeWeekday).filter(Boolean);
