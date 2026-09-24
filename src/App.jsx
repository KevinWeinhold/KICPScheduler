import React, { useState } from "react";
import {
  Container,
  CssBaseline,
  ThemeProvider,
  createTheme,
  Alert,
} from "@mui/material";
import FileUpload from "./components/FileUpload";
import ScheduleDisplay from "./components/ScheduleDisplay";
import { generateDistinctSchedule } from "./utils/scheduler";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2",
    },
    secondary: {
      main: "#dc004e",
    },
  },
});

function App() {
  const [teachers, setTeachers] = useState([]);
  const [events, setEvents] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const validateInputs = () => {
    if (!teachers.length || !events.length) {
      throw new Error("Please upload both teacher and event data first");
    }

    teachers.forEach((teacher, index) => {
        if (!teacher.id || !teacher.name) {
          throw new Error(
            `Invalid teacher data at index ${index}: missing required fields`,
          );
        }
        if (!Number.isFinite(teacher.maxEvents) || teacher.maxEvents < 1) {
          throw new Error(
            `Invalid teacher data at index ${index}: Max must be a positive number`,
          );
        }
    });

    events.forEach((event, index) => {
      if (!event.id || !event.date || !event.time) {
        throw new Error(
          `Invalid event data at index ${index}: missing required fields`,
        );
      }
    });
  };

  const validateGeneratedSchedule = (generatedSchedule) => {
    if (!Array.isArray(generatedSchedule)) {
      throw new Error("Schedule generation failed: invalid return type");
    }

    if (generatedSchedule.length !== events.length) {
      const missingEvents = events.filter(
        (event) =>
          !generatedSchedule.some((assignment) => assignment.id === event.id),
      );
      throw new Error(
        `Could not generate assignments for events: ${missingEvents.map((e) => e.schoolName).join(", ")}`,
      );
    }
  };

  const handleGenerateSchedule = () => {
    try {
      setIsGenerating(true);
      setError("");
      setInfoMessage("");
      validateInputs();

      const result = generateDistinctSchedule(teachers, events, undefined, schedules);

      if (result.exhausted) {
        setInfoMessage(
          "No more distinct schedules can be generated with the current constraints. All reasonable placement options have been exhausted.",
        );
        return;
      }

      validateGeneratedSchedule(result.schedule);
      setSchedules((prev) => [...prev, result.schedule]);
    } catch (err) {
      console.error("Schedule generation error:", err);
      setError(err.message);
      if (schedules.length === 0) {
        setSchedules([]);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleWardDataUpload = (data) => {
    setTeachers(data);
    setSchedules([]);
    setError("");
    setInfoMessage("");
  };

  const handleEventDataUpload = (data) => {
    setEvents(data);
    setSchedules([]);
    setError("");
    setInfoMessage("");
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
        {infoMessage && (
          <Alert severity="info" sx={{ mt: 2, mb: 2 }} onClose={() => setInfoMessage("")}>
            {infoMessage}
          </Alert>
        )}
        <FileUpload
          onWardDataUpload={handleWardDataUpload}
          onEventDataUpload={handleEventDataUpload}
        />
        <ScheduleDisplay
          teachers={teachers}
          events={events}
          schedules={schedules}
          onGenerateSchedule={handleGenerateSchedule}
          isGenerating={isGenerating}
        />
      </Container>
    </ThemeProvider>
  );
}

export default App;
