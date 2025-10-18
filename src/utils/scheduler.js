import { isWithinInterval, parse, differenceInCalendarMonths } from 'date-fns';

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

// Helper function to calculate neighborhood compatibility score
const getNeighborhoodScore = (teacherNeighborhood, schoolNeighborhoods) => {
	const tn = toLower(teacherNeighborhood);
	const neighborhoods = (Array.isArray(schoolNeighborhoods) ? schoolNeighborhoods : []).map(toLower);
	if (tn && neighborhoods.includes(tn)) {
		return 2; // Perfect match
	}
	// Check for incompatible neighborhoods (Hill and Terrace)
	if ((tn === 'hill' && neighborhoods.includes('terrace')) || (tn === 'terrace' && neighborhoods.includes('hill'))) {
		return 0; // Avoid this combination if possible
	}
	// If teacher is from a different but not incompatible neighborhood
	return 1;
};

// Helper function to check if a teacher is available for an event
const isTeacherAvailable = (teacher, event, assignedSchedule, globalBlackoutDates) => {
	const schedule = Array.isArray(assignedSchedule) ? assignedSchedule : [];
	// Check if teacher is already assigned to another event that day
	if (
		schedule.some(
			(assignment) => assignment?.date === event?.date && Array.isArray(assignment?.teachers) && assignment.teachers.includes(teacher.id)
		)
	) {
		return false;
	}

	// Check if event is at teacher's base school
	if (teacher?.baseSchool && event?.schoolName && teacher.baseSchool === event.schoolName) {
		return false;
	}

	// Check if teacher is the leader of another event that day
	if (event?.leaderName && teacher?.name && event.leaderName === teacher.name) {
		return false;
	}

	// Check if it's a teacher's blackout date
	const teacherBlackouts = Array.isArray(teacher?.blackoutDates) ? teacher.blackoutDates : [];
	if (event?.date && teacherBlackouts.includes(event.date)) {
		return false;
	}

	// Check if it's a global blackout date
	if (isBlackoutDate(event?.date, globalBlackoutDates)) {
		return false;
	}

	// Check if it's the teacher's visit school day
	const eventDateObj = event?.date ? new Date(event.date) : null;
	const weekday = eventDateObj ? eventDateObj.toLocaleDateString('en-US', { weekday: 'long' }) : null;
	if (teacher?.visitSchool?.day && weekday && teacher.visitSchool.day === weekday) {
		return false;
	}

	// Check if teacher has been assigned to an event within the last month
	const hasRecentAssignment = schedule.some((assignment) => {
		if (!Array.isArray(assignment?.teachers) || !assignment?.date) return false;
		if (assignment.teachers.includes(teacher.id)) {
			const assignmentDate = parse(String(assignment.date), 'yyyy-MM-dd', new Date());
			const eventDate = parse(String(event.date), 'yyyy-MM-dd', new Date());
			return Math.abs(differenceInCalendarMonths(assignmentDate, eventDate)) < 1;
		}
		return false;
	});

	return !hasRecentAssignment;
};

// Main scheduling function
export const generateSchedule = (teachers, events, globalBlackoutDates) => {
	const teacherList = Array.isArray(teachers) ? teachers : [];
	const eventList = Array.isArray(events) ? events : [];
	const schedule = [];
	const teacherAssignmentCounts = new Map(teacherList.map((t) => [t.id, 0]));

	// Sort events by date
	const sortedEvents = [...eventList].sort((a, b) => new Date(a?.date || 0) - new Date(b?.date || 0));

	for (const event of sortedEvents) {
		const availableTeachers = teacherList.filter((teacher) =>
			isTeacherAvailable(teacher, event, schedule, globalBlackoutDates)
		);

		// Calculate neighborhood scores and sort teachers by compatibility
		const teachersWithScores = availableTeachers.map((teacher) => ({
			...teacher,
			neighborhoodScore: getNeighborhoodScore(teacher?.neighborhood, event?.neighborhoods),
			assignmentCount: teacherAssignmentCounts.get(teacher.id) ?? 0,
		}));

		// Sort teachers by neighborhood score (high to low) and then by assignment count (low to high)
		teachersWithScores.sort((a, b) => {
			if (b.neighborhoodScore !== a.neighborhoodScore) {
				return b.neighborhoodScore - a.neighborhoodScore;
			}
			return a.assignmentCount - b.assignmentCount;
		});

		// Try to select a diverse group based on required slots (default 5-10)
		const requiredSlots = Math.max(5, Math.min(10, Number(event?.requiredSlots) || 5));
		const selectedTeachers = [];
		const genderCount = { Male: 0, Female: 0 };
		const countryCount = new Map();

		// Ensure gender balance first
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

		// Fill remaining spots while maintaining country diversity and preferring minimal constraints
		const remainingCandidates = teachersWithScores.filter((t) => !selectedTeachers.includes(t.id));
		remainingCandidates.sort((a, b) => {
			// Prefer teachers with minimal constraints
			const aLazy = a.hasMinimalConstraints ? 1 : 0;
			const bLazy = b.hasMinimalConstraints ? 1 : 0;
			if (bLazy !== aLazy) return bLazy - aLazy;
			// Then prefer under-represented countries
			const aCountryCount = countryCount.get(a.country) || 0;
			const bCountryCount = countryCount.get(b.country) || 0;
			if (aCountryCount !== bCountryCount) return aCountryCount - bCountryCount;
			// Then existing assignment count (fairness)
			return (a.assignmentCount ?? 0) - (b.assignmentCount ?? 0);
		});

		for (const teacher of remainingCandidates) {
			if (selectedTeachers.length >= requiredSlots) break;
			selectedTeachers.push(teacher.id);
			genderCount[teacher.gender] = (genderCount[teacher.gender] || 0) + 1;
			countryCount.set(teacher.country, (countryCount.get(teacher.country) || 0) + 1);
		}

		if (selectedTeachers.length >= Math.min(5, requiredSlots)) {
			schedule.push({
				...event,
				teachers: selectedTeachers,
			});
			// Update assignment counts
			selectedTeachers.forEach((teacherId) => {
				teacherAssignmentCounts.set(teacherId, (teacherAssignmentCounts.get(teacherId) || 0) + 1);
			});
		}
	}

	return schedule;
}; 