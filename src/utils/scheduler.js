import { isWithinInterval, parse, differenceInCalendarMonths } from 'date-fns';
import { normalizeWeekday } from './weekdays';
import { areNeighborhoodsIncompatible, neighborhoodKey } from './neighborhoods';

const isBlackoutDate = (date, globalBlackoutDates) => {
	if (!date) return false;
	if (!Array.isArray(globalBlackoutDates) || globalBlackoutDates.length === 0) return false;
	const targetDate = parse(String(date), 'yyyy-MM-dd', new Date());
	return globalBlackoutDates.some((blackout) => {
		if (!blackout || !blackout.start || !blackout.end) return false;
		const start = parse(String(blackout.start), 'yyyy-MM-dd', new Date());
		const end = parse(String(blackout.end), 'yyyy-MM-dd', new Date());
		return isWithinInterval(targetDate, { start, end });
	});
};

const toLower = (s) => (typeof s === 'string' ? s.toLowerCase().trim() : '');

const createRng = (seed) => {
	let t = (Number(seed) >>> 0) || 1;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
};

const getTeacherMaxEvents = (teacher) => {
	const max = Number(teacher?.maxEvents);
	return Number.isFinite(max) && max > 0 ? max : Infinity;
};

const resolveRequiredSlots = (event) => {
	const n = Number(event?.requiredSlots);
	if (!Number.isFinite(n) || n < 1) return 5;
	return Math.min(10, Math.max(1, Math.floor(n)));
};

const getEventWeekday = (event) => {
	if (!event?.date) return null;
	const parsed = parse(String(event.date), 'yyyy-MM-dd', new Date());
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toLocaleDateString('en-US', { weekday: 'long' });
};

/** Soft ward match — never a hard block. */
const getWardScore = (teacherWard, eventWard) => {
	const tw = toLower(teacherWard);
	const ew = toLower(eventWard);
	if (!tw || !ew) return 0;
	return tw === ew ? 1 : 0;
};

const getNeighborhoodScore = (teacherNeighborhood, schoolNeighborhoods) => {
	const tn = neighborhoodKey(teacherNeighborhood);
	const neighborhoods = (Array.isArray(schoolNeighborhoods) ? schoolNeighborhoods : []).map(neighborhoodKey);
	if (tn && neighborhoods.includes(tn)) {
		return 2;
	}
	if (areNeighborhoodsIncompatible(teacherNeighborhood, schoolNeighborhoods)) {
		return 0;
	}
	return 1;
};

/** Soft preference only — never blocks assignment. */
const getPreferredDayScore = (teacher, event) => {
	const preferred = Array.isArray(teacher?.preferredDays) ? teacher.preferredDays : [];
	if (!preferred.length) return 0.5;
	const weekday = getEventWeekday(event);
	if (!weekday) return 0;
	const match = preferred.some((day) => toLower(normalizeWeekday(day)) === toLower(weekday));
	return match ? 1 : 0;
};

/**
 * Hard availability. Monthly spacing can be relaxed on fallback passes.
 * Preferred days and ward/neighborhood are never hard blocks. Max is enforced by caller.
 */
const isTeacherAvailable = (teacher, event, assignedSchedule, globalBlackoutDates, options = {}) => {
	const { relaxMonthlySpacing = false } = options;
	const schedule = Array.isArray(assignedSchedule) ? assignedSchedule : [];

	if (
		schedule.some(
			(assignment) =>
				assignment?.date === event?.date &&
				Array.isArray(assignment?.teachers) &&
				assignment.teachers.includes(teacher.id)
		)
	) {
		return false;
	}

	if (teacher?.baseSchool && event?.schoolName && teacher.baseSchool === event.schoolName) {
		return false;
	}

	if (event?.leaderName && teacher?.name && event.leaderName === teacher.name) {
		return false;
	}

	const teacherBlackouts = Array.isArray(teacher?.blackoutDates) ? teacher.blackoutDates : [];
	if (event?.date && teacherBlackouts.includes(event.date)) {
		return false;
	}

	if (isBlackoutDate(event?.date, globalBlackoutDates)) {
		return false;
	}

	const weekday = getEventWeekday(event);
	const visitDay = normalizeWeekday(teacher?.visitSchool?.day);
	if (visitDay && weekday && visitDay === weekday) {
		return false;
	}

	if (!relaxMonthlySpacing) {
		const hasRecentAssignment = schedule.some((assignment) => {
			if (!Array.isArray(assignment?.teachers) || !assignment?.date) return false;
			if (assignment.teachers.includes(teacher.id)) {
				const assignmentDate = parse(String(assignment.date), 'yyyy-MM-dd', new Date());
				const eventDate = parse(String(event.date), 'yyyy-MM-dd', new Date());
				return Math.abs(differenceInCalendarMonths(assignmentDate, eventDate)) < 1;
			}
			return false;
		});
		if (hasRecentAssignment) return false;
	}

	return true;
};

const getTeacherBlockingReason = (
	teacher,
	event,
	assignedSchedule,
	globalBlackoutDates,
	teacherAssignmentCounts,
	options = {}
) => {
	const count = teacherAssignmentCounts.get(teacher.id) ?? 0;
	if (count >= getTeacherMaxEvents(teacher)) return 'max_events_reached';

	const schedule = Array.isArray(assignedSchedule) ? assignedSchedule : [];
	if (
		schedule.some(
			(assignment) =>
				assignment?.date === event?.date &&
				Array.isArray(assignment?.teachers) &&
				assignment.teachers.includes(teacher.id)
		)
	) {
		return 'already_assigned_same_day';
	}
	if (teacher?.baseSchool && event?.schoolName && teacher.baseSchool === event.schoolName) {
		return 'base_school_conflict';
	}
	if (event?.leaderName && teacher?.name && event.leaderName === teacher.name) {
		return 'event_leader';
	}
	const teacherBlackouts = Array.isArray(teacher?.blackoutDates) ? teacher.blackoutDates : [];
	if (event?.date && teacherBlackouts.includes(event.date)) {
		return 'blackout_date';
	}
	if (isBlackoutDate(event?.date, globalBlackoutDates)) {
		return 'global_blackout';
	}
	const weekday = getEventWeekday(event);
	const visitDay = normalizeWeekday(teacher?.visitSchool?.day);
	if (visitDay && weekday && visitDay === weekday) {
		return 'visit_school_day';
	}
	if (!options.relaxMonthlySpacing) {
		const hasRecentAssignment = schedule.some((assignment) => {
			if (!Array.isArray(assignment?.teachers) || !assignment?.date) return false;
			if (assignment.teachers.includes(teacher.id)) {
				const assignmentDate = parse(String(assignment.date), 'yyyy-MM-dd', new Date());
				const eventDate = parse(String(event.date), 'yyyy-MM-dd', new Date());
				return Math.abs(differenceInCalendarMonths(assignmentDate, eventDate)) < 1;
			}
			return false;
		});
		if (hasRecentAssignment) return 'within_one_month_of_prior_assignment';
	}
	return null;
};

/**
 * Soft preference weights.
 * Ward > neighborhood > preferred day > fairness > gender/country.
 * Half-day events get a much stronger ward weight (avoid long cross-ward commutes).
 * variationStrength dampens geography so alternate schedules can diverge — less so for half-days.
 */
const isHalfDayEvent = (event) => {
	const length = toLower(event?.length);
	return length.includes('half');
};

const getPreferenceWeights = (
	variationStrength = 0,
	{ preferPreferredDays = true, prioritizeFairness = true, halfDay = false } = {}
) => {
	// Half-day: keep ward preference sticky even when generating alternatives
	const dampenFactor = halfDay ? 0.05 : 0.12;
	const dampen = 1 / (1 + Math.max(0, variationStrength) * dampenFactor);
	const wardBase = halfDay ? 280 : 100;
	return {
		ward: wardBase * dampen,
		neighborhood: (halfDay ? 25 : 40) * dampen,
		preferredDay: preferPreferredDays ? 10 : 2,
		fairness: prioritizeFairness ? 8 : 2,
		gender: halfDay ? 8 : 12,
		country: halfDay ? 4 : 6,
		minimalConstraints: 2,
		reuse: 4,
		jitterScale: Math.max(0, variationStrength) * (halfDay ? 4 : 8),
	};
};

/**
 * Greedy slot fill: re-score each pick so ward/neighborhood stay primary,
 * while gender/country nudge among similarly strong geographic matches.
 * Half-day events strongly prefer same-ward members.
 */
const selectTeachersForEvent = (
	availableTeachers,
	event,
	teacherAssignmentCounts,
	previouslyUsed,
	variationStrength,
	rng,
	{ preferPreferredDays = true, prioritizeFairness = true, requireSameWard = false } = {}
) => {
	const requiredSlots = resolveRequiredSlots(event);
	const halfDay = isHalfDayEvent(event);
	const weights = getPreferenceWeights(variationStrength, {
		preferPreferredDays,
		prioritizeFairness,
		halfDay,
	});

	let pool = availableTeachers;
	if (requireSameWard && event?.ward) {
		const sameWard = availableTeachers.filter((t) => getWardScore(t.ward, event.ward) === 1);
		if (sameWard.length > 0) {
			pool = sameWard;
		}
	}

	const selected = [];
	const genderCount = { Male: 0, Female: 0 };
	const countryCount = new Map();
	const remaining = [...pool];

	while (selected.length < requiredSlots && remaining.length > 0) {
		const slotsLeft = requiredSlots - selected.length;
		let bestIndex = 0;
		let bestScore = -Infinity;

		for (let i = 0; i < remaining.length; i++) {
			const teacher = remaining[i];
			const wardScore = getWardScore(teacher.ward, event.ward);
			const neighborhoodScore = getNeighborhoodScore(teacher.neighborhood, event.neighborhoods);
			const preferredDayScore = getPreferredDayScore(teacher, event);
			const assignmentCount = teacherAssignmentCounts.get(teacher.id) ?? 0;
			const reusePenalty = previouslyUsed.has(teacher.id) ? weights.reuse : 0;

			const maleCount = genderCount.Male || 0;
			const femaleCount = genderCount.Female || 0;
			let genderBonus = 0;
			if (teacher.gender === 'Male' || teacher.gender === 'Female') {
				if (maleCount === femaleCount) {
					genderBonus = 0.5;
				} else if (teacher.gender === 'Male' && maleCount < femaleCount) {
					genderBonus = 1;
				} else if (teacher.gender === 'Female' && femaleCount < maleCount) {
					genderBonus = 1;
				} else {
					genderBonus = -0.4;
				}
				if (slotsLeft <= 2 && maleCount === 0 && teacher.gender === 'Male') genderBonus += 0.8;
				if (slotsLeft <= 2 && femaleCount === 0 && teacher.gender === 'Female') genderBonus += 0.8;
			}

			const countryFreq = countryCount.get(teacher.country) || 0;
			const countryBonus = selected.length === 0 ? 0 : 1 / (1 + countryFreq);
			const lazyBonus = teacher.hasMinimalConstraints ? 1 : 0;
			const jitter = weights.jitterScale > 0 ? rng() * weights.jitterScale : 0;

			const score =
				wardScore * weights.ward +
				neighborhoodScore * weights.neighborhood +
				preferredDayScore * weights.preferredDay -
				assignmentCount * weights.fairness +
				genderBonus * weights.gender +
				countryBonus * weights.country +
				lazyBonus * weights.minimalConstraints -
				reusePenalty +
				jitter;

			if (score > bestScore) {
				bestScore = score;
				bestIndex = i;
			}
		}

		const chosen = remaining.splice(bestIndex, 1)[0];
		selected.push(chosen.id);
		if (chosen.gender) {
			genderCount[chosen.gender] = (genderCount[chosen.gender] || 0) + 1;
		}
		countryCount.set(chosen.country, (countryCount.get(chosen.country) || 0) + 1);
	}

	return selected;
};

const getFillStrategies = (event) => {
	if (isHalfDayEvent(event)) {
		// Half-day: exhaust same-ward options before allowing cross-ward exceptions
		return [
			{
				relaxMonthlySpacing: false,
				preferPreferredDays: true,
				prioritizeFairness: true,
				requireSameWard: true,
				label: 'halfday_ward_only',
			},
			{
				relaxMonthlySpacing: false,
				preferPreferredDays: false,
				prioritizeFairness: true,
				requireSameWard: true,
				label: 'halfday_ward_relaxed_days',
			},
			{
				relaxMonthlySpacing: true,
				preferPreferredDays: false,
				prioritizeFairness: true,
				requireSameWard: true,
				label: 'halfday_ward_relaxed_spacing',
			},
			{
				relaxMonthlySpacing: true,
				preferPreferredDays: false,
				prioritizeFairness: false,
				requireSameWard: false,
				label: 'halfday_cross_ward_fallback',
			},
		];
	}

	return [
		{ relaxMonthlySpacing: false, preferPreferredDays: true, prioritizeFairness: true, requireSameWard: false, label: 'optimal' },
		{ relaxMonthlySpacing: false, preferPreferredDays: false, prioritizeFairness: true, requireSameWard: false, label: 'relaxed_preferred_days' },
		{ relaxMonthlySpacing: true, preferPreferredDays: false, prioritizeFairness: true, requireSameWard: false, label: 'relaxed_spacing' },
		{ relaxMonthlySpacing: true, preferPreferredDays: false, prioritizeFairness: false, requireSameWard: false, label: 'relaxed_all_soft' },
	];
};

const assignTeachersToEvent = (
	event,
	teacherList,
	schedule,
	teacherAssignmentCounts,
	globalBlackoutDates,
	previouslyUsed,
	variationStrength,
	rng
) => {
	const requiredSlots = resolveRequiredSlots(event);
	let bestPartial = { teachers: [], strategy: null };
	const strategies = getFillStrategies(event);

	for (const strategy of strategies) {
		const availableTeachers = teacherList.filter(
			(teacher) =>
				isTeacherAvailable(teacher, event, schedule, globalBlackoutDates, {
					relaxMonthlySpacing: strategy.relaxMonthlySpacing,
				}) && (teacherAssignmentCounts.get(teacher.id) ?? 0) < getTeacherMaxEvents(teacher)
		);

		const selectedTeachers = selectTeachersForEvent(
			availableTeachers,
			event,
			teacherAssignmentCounts,
			previouslyUsed,
			variationStrength,
			rng,
			{
				preferPreferredDays: strategy.preferPreferredDays,
				prioritizeFairness: strategy.prioritizeFairness,
				requireSameWard: strategy.requireSameWard,
			}
		);

		if (selectedTeachers.length > bestPartial.teachers.length) {
			bestPartial = { teachers: selectedTeachers, strategy: strategy.label };
		}

		if (selectedTeachers.length >= requiredSlots) {
			return {
				teachers: selectedTeachers,
				requiredSlots,
				suboptimalFill: strategy.label !== 'optimal' && strategy.label !== 'halfday_ward_only',
				partialFill: false,
				fillStrategy: strategy.label,
			};
		}
	}

	if (bestPartial.teachers.length > 0) {
		return {
			teachers: bestPartial.teachers,
			requiredSlots,
			suboptimalFill: true,
			partialFill: bestPartial.teachers.length < requiredSlots,
			fillStrategy: bestPartial.strategy,
		};
	}

	return {
		teachers: [],
		requiredSlots,
		suboptimalFill: false,
		partialFill: true,
		fillStrategy: null,
	};
};

/** Summarize why an event is hard to fill (for error messages / debugging). */
export const describeEventFillGap = (teachers, event, schedule, globalBlackoutDates, teacherAssignmentCounts) => {
	const requiredSlots = resolveRequiredSlots(event);
	const blockerCounts = {};

	(Array.isArray(teachers) ? teachers : []).forEach((teacher) => {
		const reason = getTeacherBlockingReason(
			teacher,
			event,
			schedule,
			globalBlackoutDates,
			teacherAssignmentCounts,
			{ relaxMonthlySpacing: false }
		);
		if (reason) blockerCounts[reason] = (blockerCounts[reason] || 0) + 1;
	});

	const strictEligible = (teachers || []).filter(
		(teacher) =>
			isTeacherAvailable(teacher, event, schedule, globalBlackoutDates, { relaxMonthlySpacing: false }) &&
			(teacherAssignmentCounts.get(teacher.id) ?? 0) < getTeacherMaxEvents(teacher)
	).length;

	const relaxedEligible = (teachers || []).filter(
		(teacher) =>
			isTeacherAvailable(teacher, event, schedule, globalBlackoutDates, { relaxMonthlySpacing: true }) &&
			(teacherAssignmentCounts.get(teacher.id) ?? 0) < getTeacherMaxEvents(teacher)
	).length;

	const topBlockers = Object.entries(blockerCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 4)
		.map(([reason, count]) => `${reason.replace(/_/g, ' ')} (${count})`)
		.join(', ');

	return {
		schoolName: event.schoolName,
		date: event.date,
		ward: event.ward,
		requiredSlots,
		strictEligible,
		relaxedEligible,
		topBlockers,
	};
};

export const getScheduleFingerprint = (schedule) => {
	if (!Array.isArray(schedule)) return '';
	return schedule
		.map((assignment) => {
			const teacherIds = Array.isArray(assignment?.teachers)
				? [...assignment.teachers].map(String).sort().join(',')
				: '';
			return `${assignment?.id ?? ''}:${teacherIds}`;
		})
		.sort()
		.join('|');
};

const buildPriorAssignmentMap = (previousSchedules) => {
	const map = new Map();
	(Array.isArray(previousSchedules) ? previousSchedules : []).forEach((schedule) => {
		(Array.isArray(schedule) ? schedule : []).forEach((assignment) => {
			if (!assignment?.id || !Array.isArray(assignment.teachers)) return;
			if (!map.has(assignment.id)) map.set(assignment.id, new Set());
			const set = map.get(assignment.id);
			assignment.teachers.forEach((id) => set.add(id));
		});
	});
	return map;
};

const differenceRatio = (candidate, previousSchedules) => {
	if (!Array.isArray(candidate) || candidate.length === 0) return 0;
	if (!previousSchedules?.length) return 1;

	let bestOverlap = 0;
	for (const prior of previousSchedules) {
		if (!Array.isArray(prior)) continue;
		const priorById = new Map(prior.map((a) => [a.id, new Set((a.teachers || []).map(String))]));
		let matchingEvents = 0;
		for (const assignment of candidate) {
			const priorTeachers = priorById.get(assignment.id);
			if (!priorTeachers) continue;
			const current = new Set((assignment.teachers || []).map(String));
			if (current.size === priorTeachers.size && [...current].every((id) => priorTeachers.has(id))) {
				matchingEvents += 1;
			}
		}
		const overlap = matchingEvents / candidate.length;
		if (overlap > bestOverlap) bestOverlap = overlap;
	}
	return 1 - bestOverlap;
};

/**
 * Soft priorities: ward → neighborhood → preferred day → fairness → gender/country.
 * Hard: Max, same-day, base school, leader, blackouts, visit day (+ spacing unless relaxed).
 */
export const generateSchedule = (teachers, events, globalBlackoutDates, options = {}) => {
	const teacherList = Array.isArray(teachers) ? teachers : [];
	const eventList = Array.isArray(events) ? events : [];
	const {
		seed = 0,
		previousSchedules = [],
		variationStrength = 0,
	} = options;

	const rng = createRng(seed);
	const priorAssignments = buildPriorAssignmentMap(previousSchedules);
	const schedule = [];
	const teacherAssignmentCounts = new Map(teacherList.map((t) => [t.id, 0]));

	const sortedEvents = [...eventList].sort((a, b) => new Date(a?.date || 0) - new Date(b?.date || 0));

	for (const event of sortedEvents) {
		const previouslyUsed = priorAssignments.get(event.id) || new Set();
		const fillResult = assignTeachersToEvent(
			event,
			teacherList,
			schedule,
			teacherAssignmentCounts,
			globalBlackoutDates,
			previouslyUsed,
			variationStrength,
			rng
		);

		if (fillResult.teachers.length === 0) continue;

		schedule.push({
			...event,
			teachers: fillResult.teachers,
			suboptimalFill: fillResult.suboptimalFill,
			partialFill: fillResult.partialFill,
			fillStrategy: fillResult.fillStrategy,
			targetSlots: fillResult.requiredSlots,
		});

		fillResult.teachers.forEach((teacherId) => {
			teacherAssignmentCounts.set(teacherId, (teacherAssignmentCounts.get(teacherId) || 0) + 1);
		});
	}

	return schedule;
};

const MAX_ATTEMPTS = 40;
const MIN_DIFFERENCE_RATIO = 0.15;

export const generateDistinctSchedule = (teachers, events, globalBlackoutDates, previousSchedules = []) => {
	const priors = Array.isArray(previousSchedules) ? previousSchedules : [];
	const knownFingerprints = new Set(priors.map(getScheduleFingerprint));

	if (priors.length === 0) {
		const schedule = generateSchedule(teachers, events, globalBlackoutDates, {
			seed: 0,
			previousSchedules: [],
			variationStrength: 0,
		});
		return { schedule };
	}

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const variationStrength = 1.5 + attempt * 0.45;
		const seed = Date.now() + attempt * 9973;
		const schedule = generateSchedule(teachers, events, globalBlackoutDates, {
			seed,
			previousSchedules: priors,
			variationStrength,
		});

		const fingerprint = getScheduleFingerprint(schedule);
		if (knownFingerprints.has(fingerprint)) continue;

		const ratio = differenceRatio(schedule, priors);
		if (ratio < MIN_DIFFERENCE_RATIO && attempt < MAX_ATTEMPTS - 5) continue;

		return { schedule };
	}

	return { exhausted: true };
};
