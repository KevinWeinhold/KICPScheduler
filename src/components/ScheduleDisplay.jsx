import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Stack,
  Divider,
  Tooltip,
  Button,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import { downloadSchedulesExcel } from '../utils/exportSchedules';

const ScheduleTable = ({ schedule, teachers }) => (
  <TableContainer component={Paper} variant="outlined">
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Date</TableCell>
          <TableCell>School</TableCell>
          <TableCell>Time</TableCell>
          <TableCell>Type</TableCell>
          <TableCell>Length</TableCell>
          <TableCell>Leader</TableCell>
          <TableCell>Assigned Teachers</TableCell>
          <TableCell>Gender Balance</TableCell>
          <TableCell>Neighborhood Match</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {schedule.map((assignment) => {
          const assignedTeachers = assignment.teachers
            .map((id) => teachers.find((t) => t.id === id))
            .filter(Boolean);

          const genderCount = assignedTeachers.reduce((acc, teacher) => {
            acc[teacher.gender] = (acc[teacher.gender] || 0) + 1;
            return acc;
          }, {});

          const neighborhoodMatch = assignedTeachers.filter((teacher) =>
            assignment.neighborhoods.includes(teacher.neighborhood)
          ).length;

          return (
            <TableRow key={assignment.id}>
              <TableCell>{assignment.date}</TableCell>
              <TableCell>{assignment.schoolName}</TableCell>
              <TableCell>{assignment.time}</TableCell>
              <TableCell>
                <Chip
                  label={assignment.schoolType}
                  color={
                    assignment.schoolType === 'SHS'
                      ? 'error'
                      : assignment.schoolType === 'MS'
                      ? 'warning'
                      : 'success'
                  }
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Chip
                  label={assignment.length}
                  color={assignment.length === 'Full day' ? 'primary' : 'secondary'}
                  size="small"
                />
              </TableCell>
              <TableCell>{assignment.leaderName}</TableCell>
              <TableCell>
                {(assignment.partialFill || assignment.suboptimalFill) && (
                  <Chip
                    label={
                      assignment.partialFill
                        ? `Partial (${assignment.teachers.length}/${assignment.targetSlots ?? '?'})`
                        : 'Sub-optimal fill'
                    }
                    size="small"
                    color="warning"
                    sx={{ mb: 0.5 }}
                  />
                )}
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {assignedTeachers.map((teacher) => (
                    <Tooltip
                      key={teacher.id}
                      title={`Neighborhood: ${teacher.neighborhood}, Country: ${teacher.country}, Gender: ${teacher.gender}`}
                    >
                      <Chip label={teacher.name} size="small" variant="outlined" />
                    </Tooltip>
                  ))}
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={1}>
                  <Chip
                    label={`M: ${genderCount.Male || 0}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label={`F: ${genderCount.Female || 0}`}
                    size="small"
                    color="secondary"
                    variant="outlined"
                  />
                </Stack>
              </TableCell>
              <TableCell>
                <Chip
                  label={`${neighborhoodMatch}/${assignedTeachers.length}`}
                  size="small"
                  color={
                    neighborhoodMatch === assignedTeachers.length ? 'success' : 'warning'
                  }
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </TableContainer>
);

const ScheduleDisplay = ({
  teachers,
  events,
  schedules = [],
  onGenerateSchedule,
  isGenerating,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasSchedules = schedules.length > 0;

  useEffect(() => {
    if (schedules.length > 0) {
      setExpanded(`schedule-${schedules.length - 1}`);
    } else {
      setExpanded(false);
    }
  }, [schedules.length]);

  const handleAccordionChange = (panel) => (_event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h5">Schedule Overview</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            color="primary"
            startIcon={
              isGenerating ? (
                <CircularProgress size={20} color="inherit" />
              ) : hasSchedules ? (
                <RefreshIcon />
              ) : (
                <PlayArrowIcon />
              )
            }
            onClick={onGenerateSchedule}
            disabled={!teachers.length || !events.length || isGenerating}
          >
            {isGenerating
              ? 'Generating...'
              : hasSchedules
              ? 'Generate New Schedule'
              : 'Generate Schedule'}
          </Button>
          {hasSchedules && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<DownloadIcon />}
              onClick={() => downloadSchedulesExcel(teachers, schedules)}
            >
              Download Excel
            </Button>
          )}
        </Stack>
      </Box>

      {hasSchedules ? (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Generated Schedules ({schedules.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Expand a schedule to review placements. Use &quot;Generate New Schedule&quot; to
            create another option with different teacher assignments where possible.
          </Typography>
          {schedules.map((schedule, index) => {
            const panelId = `schedule-${index}`;
            return (
              <Accordion
                key={panelId}
                expanded={expanded === panelId}
                onChange={handleAccordionChange(panelId)}
                sx={{ mb: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight={expanded === panelId ? 600 : 400}>
                    Schedule {index + 1}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <ScheduleTable schedule={schedule} teachers={teachers} />
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      ) : (
        <Alert severity="info" sx={{ mb: 4 }}>
          Upload teacher and event data, then click &quot;Generate Schedule&quot; to create a
          schedule. You can generate additional alternatives afterward.
        </Alert>
      )}

      <Divider sx={{ my: 4 }} />

      {teachers.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Ward Members
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Base School</TableCell>
                  <TableCell>SHS Available</TableCell>
                  <TableCell>Visit School Day</TableCell>
                  <TableCell>Preferred Days</TableCell>
                  <TableCell>Blackout Dates</TableCell>
                  <TableCell>Neighborhood</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Gender</TableCell>
                  <TableCell>Max</TableCell>
                  <TableCell>Constraints</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell>{teacher.name}</TableCell>
                    <TableCell>{teacher.baseSchool}</TableCell>
                    <TableCell>
                      <Chip
                        label={teacher.willingSeniorHigh ? 'Yes' : 'No'}
                        color={teacher.willingSeniorHigh ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {teacher.visitSchool.day ? (
                        <Chip label={teacher.visitSchool.day} color="warning" size="small" />
                      ) : (
                        <Chip label="None" color="default" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      {teacher.preferredDays.length > 0 ? (
                        <Stack direction="row" spacing={0.5}>
                          {teacher.preferredDays.map((day, index) => (
                            <Chip key={index} label={day} size="small" variant="outlined" />
                          ))}
                        </Stack>
                      ) : (
                        <Chip label="None" color="default" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      {teacher.blackoutDates.length > 0 ? (
                        <Stack direction="row" spacing={0.5}>
                          {teacher.blackoutDates.map((date, index) => (
                            <Chip
                              key={index}
                              label={date}
                              size="small"
                              color="error"
                              variant="outlined"
                            />
                          ))}
                        </Stack>
                      ) : (
                        <Chip label="None" color="default" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={teacher.neighborhood} color="primary" size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip label={teacher.country} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={teacher.gender}
                        size="small"
                        color={teacher.gender === 'Male' ? 'primary' : 'secondary'}
                      />
                    </TableCell>
                    <TableCell>{teacher.maxEvents ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={teacher.hasMinimalConstraints ? 'Minimal' : 'Full'}
                        color={teacher.hasMinimalConstraints ? 'success' : 'info'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {events.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            School Events
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Day</TableCell>
                  <TableCell>School</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Length</TableCell>
                  <TableCell>Leader</TableCell>
                  <TableCell>Required Slots</TableCell>
                  <TableCell>Neighborhoods</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{event.date}</TableCell>
                    <TableCell>{event.time}</TableCell>
                    <TableCell>{event.schoolName}</TableCell>
                    <TableCell>
                      <Chip
                        label={event.schoolType}
                        color={
                          event.schoolType === 'SHS'
                            ? 'error'
                            : event.schoolType === 'MS'
                            ? 'warning'
                            : 'success'
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={event.length}
                        color={event.length === 'Full day' ? 'primary' : 'secondary'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{event.leaderName}</TableCell>
                    <TableCell>{event.requiredSlots}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        {event.neighborhoods.map((neighborhood, index) => (
                          <Chip
                            key={index}
                            label={neighborhood}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
};

export default ScheduleDisplay;
