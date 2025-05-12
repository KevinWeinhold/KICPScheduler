import { isWithinInterval, parse, differenceInCalendarMonths } from 'date-fns';

// Helper function to check if a date is within global blackout dates
const isBlackoutDate = (date, globalBlackoutDates) => {
  const targetDate = parse(date, 'yyyy-MM-dd', new Date());
  return globalBlackoutDates.some(blackout => {
    const start = parse(blackout.start, 'yyyy-MM-dd', new Date());
    const end = parse(blackout.end, 'yyyy-MM-dd', new Date());
    return isWithinInterval(targetDate, { start, end });
  });
};

// Helper function to calculate neighborhood compatibility score
const getNeighborhoodScore = (teacherNeighborhood, schoolNeighborhoods) => {
  if (schoolNeighborhoods.includes(teacherNeighborhood)) {
    return 2; // Perfect match
  }
  
  // Check for incompatible neighborhoods (Hill and Terrace)
  if ((teacherNeighborhood === 'Hill' && schoolNeighborhoods.includes('Terrace')) ||
      (teacherNeighborhood === 'Terrace' && schoolNeighborhoods.includes('Hill'))) {
    return 0; // Avoid this combination if possible
  }
  
  // If teacher is from a different but not incompatible neighborhood
  return 1;
};

// Helper function to check if a teacher is available for an event
const isTeacherAvailable = (teacher, event, assignedSchedule, globalBlackoutDates) => {
  // Check if teacher is already assigned to another event that day
  if (assignedSchedule.some(assignment => 
    assignment.date === event.date && 
    assignment.teachers.includes(teacher.id)
  )) {
    return false;
  }

  // Check if event is at teacher's base school
  if (teacher.baseSchool === event.schoolName) {
    return false;
  }

  // Check if teacher is the leader of another event that day
  if (event.leaderName === teacher.name) {
    return false;
  }

  // Check if it's a teacher's blackout date
  if (teacher.blackoutDates.includes(event.date)) {
    return false;
  }

  // Check if it's a global blackout date
  if (isBlackoutDate(event.date, globalBlackoutDates)) {
    return false;
  }

  // Check if it's the teacher's visit school day
  const eventDate = new Date(event.date);
  const weekday = eventDate.toLocaleDateString('en-US', { weekday: 'long' });
  if (teacher.visitSchool && teacher.visitSchool.day === weekday) {
    return false;
  }

  // Check if teacher has been assigned to an event within the last month
  const hasRecentAssignment = assignedSchedule.some(assignment => {
    if (assignment.teachers.includes(teacher.id)) {
      const assignmentDate = parse(assignment.date, 'yyyy-MM-dd', new Date());
      const eventDate = parse(event.date, 'yyyy-MM-dd', new Date());
      return Math.abs(differenceInCalendarMonths(assignmentDate, eventDate)) < 1;
    }
    return false;
  });

  return !hasRecentAssignment;
};

// Main scheduling function
export const generateSchedule = (teachers, events, globalBlackoutDates) => {
  const schedule = [];
  const teacherAssignmentCounts = new Map(teachers.map(t => [t.id, 0]));

  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const event of sortedEvents) {
    const availableTeachers = teachers.filter(teacher => 
      isTeacherAvailable(teacher, event, schedule, globalBlackoutDates)
    );

    // Calculate neighborhood scores and sort teachers by compatibility
    const teachersWithScores = availableTeachers.map(teacher => ({
      ...teacher,
      neighborhoodScore: getNeighborhoodScore(teacher.neighborhood, event.neighborhoods),
      assignmentCount: teacherAssignmentCounts.get(teacher.id)
    }));

    // Sort teachers by neighborhood score (high to low) and then by assignment count (low to high)
    teachersWithScores.sort((a, b) => {
      if (b.neighborhoodScore !== a.neighborhoodScore) {
        return b.neighborhoodScore - a.neighborhoodScore;
      }
      return a.assignmentCount - b.assignmentCount;
    });

    // Try to select a diverse group of 5-10 teachers
    const selectedTeachers = [];
    const genderCount = { Male: 0, Female: 0 };
    const countryCount = new Map();

    // First, ensure we have a good gender balance
    for (const gender of ['Male', 'Female']) {
      const teachersOfGender = teachersWithScores.filter(t => t.gender === gender);
      const targetCount = Math.min(5, Math.ceil(teachersOfGender.length / 2));
      
      for (let i = 0; i < targetCount && selectedTeachers.length < 10; i++) {
        const teacher = teachersOfGender[i];
        if (teacher) {
          selectedTeachers.push(teacher.id);
          genderCount[gender]++;
          countryCount.set(teacher.country, (countryCount.get(teacher.country) || 0) + 1);
        }
      }
    }

    // Fill remaining spots while maintaining diversity
    while (selectedTeachers.length < 5 && teachersWithScores.length > 0) {
      const teacher = teachersWithScores.shift();
      if (teacher && !selectedTeachers.includes(teacher.id)) {
        selectedTeachers.push(teacher.id);
        genderCount[teacher.gender]++;
        countryCount.set(teacher.country, (countryCount.get(teacher.country) || 0) + 1);
      }
    }

    if (selectedTeachers.length >= 5) {
      schedule.push({
        ...event,
        teachers: selectedTeachers
      });

      // Update assignment counts
      selectedTeachers.forEach(teacherId => {
        teacherAssignmentCounts.set(teacherId, teacherAssignmentCounts.get(teacherId) + 1);
      });
    }
  }

  return schedule;
}; 