import React, { useState } from 'react';
import { Container, CssBaseline, ThemeProvider, createTheme, Alert } from '@mui/material';
import FileUpload from './components/FileUpload';
import ScheduleDisplay from './components/ScheduleDisplay';
import { generateSchedule } from './utils/scheduler';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  const [teachers, setTeachers] = useState([]);
  const [events, setEvents] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateSchedule = () => {
    try {
      setIsGenerating(true);
      setError('');

      // Validate that we have both teachers and events
      if (!teachers.length || !events.length) {
        throw new Error('Please upload both teacher and event data first');
      }

      // Debug log the input data
      console.log('Teachers:', teachers);
      console.log('Events:', events);

      // Validate teacher data structure
      teachers.forEach((teacher, index) => {
        if (!teacher.id || !teacher.name) {
          throw new Error(`Invalid teacher data at index ${index}: missing required fields`);
        }
        if (!Array.isArray(teacher.blackoutDates)) {
          console.warn(`Teacher ${teacher.name} has invalid blackoutDates:`, teacher.blackoutDates);
        }
        if (!Array.isArray(teacher.preferredDays)) {
          console.warn(`Teacher ${teacher.name} has invalid preferredDays:`, teacher.preferredDays);
        }
      });

      // Validate event data structure
      events.forEach((event, index) => {
        if (!event.id || !event.date || !event.time) {
          throw new Error(`Invalid event data at index ${index}: missing required fields`);
        }
        if (!Array.isArray(event.neighborhoods)) {
          console.warn(`Event ${event.schoolName} has invalid neighborhoods:`, event.neighborhoods);
        }
      });

      // Generate the schedule
      const generatedSchedule = generateSchedule(teachers, events);
      
      // Validate the generated schedule
      if (!Array.isArray(generatedSchedule)) {
        throw new Error('Schedule generation failed: invalid return type');
      }

      // Check if we have assignments for all events
      if (generatedSchedule.length !== events.length) {
        const missingEvents = events.filter(event => 
          !generatedSchedule.some(schedule => schedule.id === event.id)
        );
        throw new Error(`Could not generate assignments for events: ${missingEvents.map(e => e.schoolName).join(', ')}`);
      }

      setSchedule(generatedSchedule);
    } catch (err) {
      console.error('Schedule generation error:', err);
      setError(err.message);
      setSchedule([]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl">
        {error && (
          <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
            {error}
          </Alert>
        )}
        <FileUpload 
          onWardDataUpload={setTeachers} 
          onEventDataUpload={setEvents} 
        />
        <ScheduleDisplay 
          teachers={teachers}
          events={events}
          schedule={schedule}
          onGenerateSchedule={handleGenerateSchedule}
          isGenerating={isGenerating}
        />
      </Container>
    </ThemeProvider>
  );
}

export default App; 