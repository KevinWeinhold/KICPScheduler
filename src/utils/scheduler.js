import { isWithinInterval, parse, differenceInCalendarMonths } from 'date-fns';
import { normalizeWeekday } from './weekdays';
import { areNeighborhoodsIncompatible, neighborhoodKey } from './neighborhoods';

// Helper function to check if a date is within global blackout dates
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

// Deterministic PRNG (mulberry32) so attempts are reproducible per seed
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

// Helper function to calculate neighborhood compatibility score
const getNeighborhoodScore = (teacherNeighborhood, schoolNeighborhoods) => {
	const tn = neighborhoodKey(teacherNeighborhood);
	const neighborhoods = (Array.isArray(schoolNeighborhoods) ? schoolNeighborhoods : []).map(neighborhoodKey);
	if (tn && neighborhoods.includes(tn)) {
		return 2; // Perfect match
	}
	if (areNeighborhoodsIncompatible(teacherNeighborhood, schoolNeighborhoods)) {
		return 0;
	}
	return 1;
};

const resolveRequiredSlots = (event) => {
	const n = Number(event?.requiredSlots);
	if (!Number.isFinite(n) || n < 1) return 5;
	return Math.min(10, Math.max(1, Math.floor(n)));
};

/** Hard availability checks; monthly spacing can be relaxed in fallback passes. */
const isTeacherAvailable = (teacher, event, assignedSchedule, globalBlackoutDates, options = {}) => {
	const { relaxMonthlySpacing = false } = options;
	const schedule = Array.isArray(assignedSchedule) ? assignedSchedule : [];
	if (
		schedule.some(
			(assignment) => assignment?.date === event?.date && Array.isArray(assignment?.teachers) && assignment.teachers.includes(teacher.id)
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

	const eventDateObj = event?.date ? new Date(event.date) : null;
	const weekday = eventDateObj ? eventDateObj.toLocaleDateString('en-US', { weekday: 'long' }) : null;
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

const getTeacherBlockingReason = (teacher, event, assignedSchedule, globalBlackoutDates, teacherAssignmentCounts, options = {}) => {
	const count = teacherAssignmentCounts.get(teacher.id) ?? 0;
	if (count >= getTeacherMaxEvents(teacher)) return 'max_events_reached';

	const schedule = Array.isArray(assignedSchedule) ? assignedSchedule : [];
	if (
		schedule.some(
			(assignment) => assignment?.date === event?.date && Array.isArray(assignment?.teachers) && assignment.teachers.includes(teacher.id)
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
	const eventDateObj = event?.date ? new Date(event.date) : null;
	const weekday = eventDateObj ? eventDateObj.toLocaleDateString('en-US', { weekday: 'long' }) : null;
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

const buildRankedCandidates = (
	availableTeachers,
	event,
	teacherAssignmentCounts,
	previouslyUsed,
	variationStrength,
	rng,
	{ prioritizeFairness = true }
) => {
	const teachersWithScores = availableTeachers.map((teacher) => {
		const neighborhoodScore = getNeighborhoodScore(teacher?.neighborhood, event?.neighborhoods);
		const assignmentCount = teacherAssignmentCounts.get(teacher.id) ?? 0;
		const reusePenalty = previouslyUsed.has(teacher.id) ? variationStrength : 0;
		const jitter = variationStrength > 0 ? rng() * variationStrength : 0;
		return {
			...teacher,
			neighborhoodScore,
			assignmentCount,
			sortKey: neighborhoodScore * 10 - reusePenalty + jitter,
		};
	});

	teachersWithScores.sort((a, b) => {
		if (prioritizeFairness && a.assignmentCount !== b.assignmentCount) {
			return a.assignmentCount - b.assignmentCount;
		}
		if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
		return a.id - b.id;
	});

	return teachersWithScores;
};

const selectTeachersFromCandidates = (
	teachersWithScores,
	requiredSlots,
	{ useGenderBalance, previouslyUsed, variationStrength, rng }
) => {
	const selectedTeachers = [];
	const genderCount = { Male: 0, Female: 0 };
	const countryCount = new Map();

	if (useGenderBalance) {
		for (const gender of ['Male', 'Female']) {
			const teachersOfGender = teachersWithScores.filter((t) => t.gender === gender);
			const targetCount = Math.min(Math.ceil(requiredSlots / 2), teachersOfGender.length);
			for (let i = 0; i < targetCount && selectedTeachers.length < requiredSlots; i++) {
				const teacher = teachersOfGender[i];
				if (teacher) {
					selectedTeachers.push(teacher.id);
					genderCount[gender]++;
					countryCount.set(teacher.country, (countryCount.get(teacher.country) || 0) + 1);
				}
			}
		}
	}

	const remainingCandidates = teachersWithScores.filter((t) => !selectedTeachers.includes(t.id));
	remainingCandidates.sort((a, b) => {
		const aReuse = previouslyUsed.has(a.id) ? variationStrength : 0;
		const bReuse = previouslyUsed.has(b.id) ? variationStrength : 0;
		const aLazy = a.hasMinimalConstraints ? 1 : 0;
		const bLazy = b.hasMinimalConstraints ? 1 : 0;
		if (bLazy !== aLazy) return bLazy - aLazy;
		const aCountryCount = (countryCount.get(a.country) || 0) + aReuse;
		const bCountryCount = (countryCount.get(b.country) || 0) + bReuse;
		if (aCountryCount !== bCountryCount) return aCountryCount - bCountryCount;
		if (aReuse !== bReuse) return aReuse - bReuse;
		const jitterA = variationStrength > 0 ? rng() * 0.5 : 0;
		const jitterB = variationStrength > 0 ? rng() * 0.5 : 0;
		return (a.assignmentCount ?? 0) + jitterA - ((b.assignmentCount ?? 0) + jitterB);
	});

	for (const teacher of remainingCandidates) {
		if (selectedTeachers.length >= requiredSlots) break;
		selectedTeachers.push(teacher.id);
	}

	return selectedTeachers;
};

const FILL_STRATEGIES = [
	{ relaxMonthlySpacing: false, useGenderBalance: true, prioritizeFairness: true, label: 'optimal' },
	{ relaxMonthlySpacing: false, useGenderBalance: false, prioritizeFairness: true, label: 'relaxed_gender' },
	{ relaxMonthlySpacing: true, useGenderBalance: false, prioritizeFairness: true, label: 'relaxed_spacing' },
	{ relaxMonthlySpacing: true, useGenderBalance: false, prioritizeFairness: false, label: 'relaxed_all_soft' },
];

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

	for (const strategy of FILL_STRATEGIES) {
		const availableTeachers = teacherList.filter(
			(teacher) =>
				isTeacherAvailable(teacher, event, schedule, globalBlackoutDates, {
					relaxMonthlySpacing: strategy.relaxMonthlySpacing,
				}) && (teacherAssignmentCounts.get(teacher.id) ?? 0) < getTeacherMaxEvents(teacher)
		);

		const ranked = buildRankedCandidates(
			availableTeachers,
			event,
			teacherAssignmentCounts,
			previouslyUsed,
			variationStrength,
			rng,
			{ prioritizeFairness: strategy.prioritizeFairness }
		);

		const selectedTeachers = selectTeachersFromCandidates(ranked, requiredSlots, {
			useGenderBalance: strategy.useGenderBalance,
			previouslyUsed,
			variationStrength,
			rng,
		});

		if (selectedTeachers.length > bestPartial.teachers.length) {
			bestPartial = { teachers: selectedTeachers, strategy: strategy.label };
		}

		if (selectedTeachers.length >= requiredSlots) {
			return {
				teachers: selectedTeachers,
				requiredSlots,
				suboptimalFill: strategy.label !== 'optimal',
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

	teachers.forEach((teacher) => {
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

	const strictEligible = teachers.filter(
		(teacher) =>
			isTeacherAvailable(teacher, event, schedule, globalBlackoutDates, { relaxMonthlySpacing: false }) &&
			(teacherAssignmentCounts.get(teacher.id) ?? 0) < getTeacherMaxEvents(teacher)
	).length;

	const relaxedEligible = teachers.filter(
		(teacher) =>
			isTeacherAvailable(teacher, event, schedule, globalBlackoutDates, { relaxMonthlySpacing: true }) &&
			(teacherAssignmentCounts.get(teacher.id) ?? 0) < getTeacherMaxEvents(teacher)
	).length;

	const topBlockers = Object.entries(blockerCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 4)
		.map(([reason, count]) => `${reason} (${count})`)
		.join(', ');

	return {
		schoolName: event.schoolName,
		date: event.date,
		requiredSlots,
		strictEligible,
		relaxedEligible,
		topBlockers,
	};
};

/** Stable fingerprint for comparing schedules (event → sorted teacher IDs). */
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

/**
 * Build a map of eventId → Set of teacherIds used in prior schedules,
 * so regenerating can prefer different placements.
 */
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

/**
 * Fraction of event slots whose teacher set differs from the most similar prior schedule.
 * 0 = identical to some prior; 1 = every event differs.
 */
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
 * Generate one schedule. Soft preferences (neighborhood, fairness, gender, country)
 * remain; optional seed + prior schedules nudge placements so alternatives differ.
 *
 * @param {object[]} teachers
 * @param {object[]} events
 * @param {object[]} [globalBlackoutDates]
 * @param {{ seed?: number, previousSchedules?: object[][], variationStrength?: number }} [options]
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

	// Sort events by date
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
const MIN_DIFFERENCE_RATIO = 0.15; // at least ~15% of events should change teacher sets

/**
 * Generate a schedule distinct from previous ones, or null if options are exhausted.
 * First call (no previous) returns the baseline deterministic schedule.
 *
 * @returns {{ schedule: object[] } | { exhausted: true }}
 */
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
		const variationStrength = 1.5 + attempt * 0.35;
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
