import { useState, useEffect } from 'react';
import { 
  Container, 
  Paper, 
  Typography, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Box,
  Chip,
  Stack,
  Tooltip
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { mockTeachers, mockSchoolEvents, globalBlackoutDates } from './data/mockData';
import { generateSchedule } from './utils/scheduler';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    neighborhood: {
      hill: '#4caf50',
      terrace: '#ff9800',
      scranton: '#9c27b0'
    }
  },
});

function App() {
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    const generatedSchedule = generateSchedule(mockTeachers, mockSchoolEvents, globalBlackoutDates);
    setSchedule(generatedSchedule);
  }, []);

  const getTeacherDetails = (teacherId) => {
    return mockTeachers.find(t => t.id === teacherId);
  };

  const getNeighborhoodColor = (neighborhood) => {
    const colors = {
      Hill: theme.palette.neighborhood.hill,
      Terrace: theme.palette.neighborhood.terrace,
      Scranton: theme.palette.neighborhood.scranton
    };
    return colors[neighborhood] || theme.palette.primary.main;
  };

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center">
          School Event Schedule
        </Typography>
        
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Global Blackout Dates:
          </Typography>
          <Stack direction="row" spacing={1}>
            {globalBlackoutDates.map((date, index) => (
              <Chip 
                key={index}
                label={`${date.start} to ${date.end}`}
                color="secondary"
                variant="outlined"
              />
            ))}
          </Stack>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>School</TableCell>
                <TableCell>Neighborhoods</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Leader</TableCell>
                <TableCell>Assigned Teachers</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schedule.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.date}</TableCell>
                  <TableCell>{event.schoolName}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      {event.neighborhoods.map((neighborhood, index) => (
                        <Chip
                          key={index}
                          label={neighborhood}
                          sx={{ bgcolor: getNeighborhoodColor(neighborhood), color: 'white' }}
                          size="small"
                        />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>{event.time}</TableCell>
                  <TableCell>{event.leaderName}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {event.teachers.map((teacherId) => {
                        const teacher = getTeacherDetails(teacherId);
                        return (
                          <Tooltip 
                            key={teacherId}
                            title={`Neighborhood: ${teacher.neighborhood}`}
                            arrow
                          >
                            <Chip
                              label={`${teacher.name} (${teacher.country})`}
                              sx={{ 
                                borderColor: getNeighborhoodColor(teacher.neighborhood),
                                borderWidth: 2,
                                '&:hover': {
                                  bgcolor: `${getNeighborhoodColor(teacher.neighborhood)}22`
                                }
                              }}
                              variant="outlined"
                              size="small"
                              style={{ margin: '4px 0' }}
                            />
                          </Tooltip>
                        );
                      })}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Teacher Assignment Summary:
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Teacher</TableCell>
                  <TableCell>Base School</TableCell>
                  <TableCell>Neighborhood</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Number of Assignments</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mockTeachers.map((teacher) => {
                  const assignmentCount = schedule.reduce((count, event) => 
                    count + (event.teachers.includes(teacher.id) ? 1 : 0), 0
                  );
                  return (
                    <TableRow key={teacher.id}>
                      <TableCell>{teacher.name}</TableCell>
                      <TableCell>{teacher.baseSchool}</TableCell>
                      <TableCell>
                        <Chip
                          label={teacher.neighborhood}
                          sx={{ bgcolor: getNeighborhoodColor(teacher.neighborhood), color: 'white' }}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{teacher.country}</TableCell>
                      <TableCell>{assignmentCount}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App; 