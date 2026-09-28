import * as XLSX from 'xlsx';

const formatEventLabel = (assignment) => `${assignment.date} - ${assignment.schoolName}`;

const getTeacherAssignments = (teacherId, schedule) =>
	schedule
		.filter((assignment) => Array.isArray(assignment.teachers) && assignment.teachers.includes(teacherId))
		.sort((a, b) => new Date(a.date) - new Date(b.date))
		.map(formatEventLabel);

const buildMemberSummaryRows = (teachers, schedules) =>
	teachers.map((teacher) => {
		const row = {
			Name: teacher.name,
			'Base School': teacher.baseSchool,
			'SHS Available': teacher.willingSeniorHigh ? 'Yes' : 'No',
			'Visit School Day': teacher.visitSchool?.day || '',
			'Preferred Days': (teacher.preferredDays || []).join(', '),
			'Blackout Dates': (teacher.blackoutDates || []).join(', '),
			Neighborhood: teacher.neighborhood,
			Country: teacher.country,
			Gender: teacher.gender,
			Max: teacher.maxEvents ?? '',
			Constraints: teacher.hasMinimalConstraints ? 'Minimal' : 'Full',
		};

		schedules.forEach((schedule, index) => {
			const assignments = getTeacherAssignments(teacher.id, schedule);
			row[`Schedule ${index + 1} Assignments`] = assignments.join('; ');
			row[`Schedule ${index + 1} Count`] = assignments.length;
		});

		return row;
	});

const buildScheduleRows = (schedule, teachers) =>
	schedule.map((assignment) => {
		const assignedTeachers = assignment.teachers
			.map((id) => teachers.find((t) => t.id === id))
			.filter(Boolean);

		const genderCount = assignedTeachers.reduce((acc, teacher) => {
			acc[teacher.gender] = (acc[teacher.gender] || 0) + 1;
			return acc;
		}, {});

		const neighborhoodMatch = assignedTeachers.filter((teacher) =>
			(assignment.neighborhoods || []).includes(teacher.neighborhood)
		).length;

		return {
			Date: assignment.date,
			School: assignment.schoolName,
			Day: assignment.time,
			Type: assignment.schoolType,
			Length: assignment.length,
			Leader: assignment.leaderName,
			'Assigned Teachers': assignedTeachers.map((t) => t.name).join(', '),
			'Male Count': genderCount.Male || 0,
			'Female Count': genderCount.Female || 0,
			'Neighborhood Match': `${neighborhoodMatch}/${assignedTeachers.length}`,
		};
	});

const memberSummaryColumnWidths = (scheduleCount) => {
	const widths = [
		{ wch: 22 }, // Name
		{ wch: 25 }, // Base School
		{ wch: 14 }, // SHS Available
		{ wch: 16 }, // Visit School Day
		{ wch: 28 }, // Preferred Days
		{ wch: 28 }, // Blackout Dates
		{ wch: 14 }, // Neighborhood
		{ wch: 14 }, // Country
		{ wch: 10 }, // Gender
		{ wch: 8 },  // Max
		{ wch: 12 }, // Constraints
	];

	for (let i = 0; i < scheduleCount; i++) {
		widths.push({ wch: 45 }); // Assignments
		widths.push({ wch: 16 }); // Count
	}
	return widths;
};

const scheduleColumnWidths = [
	{ wch: 12 },
	{ wch: 25 },
	{ wch: 12 },
	{ wch: 10 },
	{ wch: 12 },
	{ wch: 20 },
	{ wch: 40 },
	{ wch: 12 },
	{ wch: 12 },
	{ wch: 18 },
];

export const buildSchedulesWorkbook = (teachers, schedules) => {
	const wb = XLSX.utils.book_new();

	const memberRows = buildMemberSummaryRows(teachers, schedules);
	const memberSheet = XLSX.utils.json_to_sheet(memberRows);
	memberSheet['!cols'] = memberSummaryColumnWidths(schedules.length);
	XLSX.utils.book_append_sheet(wb, memberSheet, 'Member Summary');

	schedules.forEach((schedule, index) => {
		const scheduleRows = buildScheduleRows(schedule, teachers);
		const scheduleSheet = XLSX.utils.json_to_sheet(scheduleRows);
		scheduleSheet['!cols'] = scheduleColumnWidths;
		XLSX.utils.book_append_sheet(wb, scheduleSheet, `Schedule ${index + 1}`);
	});

	return wb;
};

export const downloadSchedulesExcel = (teachers, schedules) => {
	if (!Array.isArray(schedules) || schedules.length === 0) return;

	const wb = buildSchedulesWorkbook(teachers, schedules);
	const dateStamp = new Date().toISOString().slice(0, 10);
	XLSX.writeFile(wb, `kicp_schedules_${dateStamp}.xlsx`);
};
