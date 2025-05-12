# KICP School Event Scheduler

A React-based scheduling tool for organizing special school events and assigning teachers to them. This application helps coordinate teacher assignments to special events while considering various constraints and promoting diversity in the assignments.

## Features

- Automatically generates schedules based on teacher availability and preferences
- Ensures diverse representation in terms of gender and nationality
- Respects teacher blackout dates and visit school schedules
- Maintains fair distribution of assignments among teachers
- Prevents scheduling conflicts
- Displays comprehensive schedule and assignment summaries

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/kicp-scheduler.git
cd kicp-scheduler
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Usage

The application currently uses mock data (located in `src/data/mockData.js`) to demonstrate the scheduling functionality. In a production environment, you would:

1. Import your teacher data (CSV format)
2. Import your school event data (CSV format)
3. View the generated schedule
4. Export the final schedule

## Data Format

### Teacher Data
Teachers should have the following information:
- Name
- Base School
- Gender
- Willingness to attend Senior High School events
- Country of origin
- Visit school information (school and day)
- Preferred days for events
- Blackout dates
- Neighborhood

### School Event Data
Events should have the following information:
- Date
- School name
- Time
- Event leader's name

## Scheduling Rules

The scheduler follows these rules:
- Each teacher must do at least two events during June 1st to October 31st, 2025
- Respects global blackout dates (June 25th - July 9th and July 18th - September 9th)
- Maintains gender and nationality diversity in event assignments
- Avoids scheduling teachers at their own schools
- Prevents scheduling conflicts with visit schools
- Ensures at least one month between assignments for each teacher

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details 