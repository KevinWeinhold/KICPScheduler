import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Box, Button, Typography, Paper, Alert, Stack } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import { downloadTemplate } from '../utils/excelTemplates';

// Normalize a value into YYYY-MM-DD
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const formatDateYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const excelSerialToDate = (serial) => {
	// Excel serial date to JS Date (treating base as 1899-12-30)
	const utcDays = Math.floor(serial - 25569);
	const utcValue = utcDays * 86400; // seconds
	return new Date(utcValue * 1000);
};
const normalizeDate = (value) => {
	if (!value) return '';
	if (value instanceof Date) {
		return formatDateYMD(value);
	}
	if (typeof value === 'number') {
		const d = excelSerialToDate(value);
		return formatDateYMD(d);
	}
	// treat as string
	const d = new Date(value);
	if (!isNaN(d.getTime())) return formatDateYMD(d);
	return String(value);
};

const FileUpload = ({ onWardDataUpload, onEventDataUpload }) => {
	const [wardFile, setWardFile] = useState(null);
	const [eventFile, setEventFile] = useState(null);
	const [error, setError] = useState('');

	const handleWardFileUpload = (event) => {
		const file = event.target.files[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const workbook = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
					const sheetName = workbook.SheetNames[0];
					const worksheet = workbook.Sheets[sheetName];
					const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });

					// Validate required fields
					const requiredFields = [
						'Name',
						'Base School',
						'SHS availability',
						'Visit School Day',
						'Best days',
						'Blackout Dates',
						'Neighborhood',
						'Country'
					];

					const missingFields = requiredFields.filter(
						(field) => !Object.keys(data[0] || {}).includes(field)
					);

					if (missingFields.length > 0) {
						setError(`Missing required fields: ${missingFields.join(', ')}`);
						return;
					}

					// Transform data to match our data structure
					const transformedData = data.map((row, index) => ({
						id: index + 1,
						name: row['Name'],
						baseSchool: row['Base School'],
						willingSeniorHigh: String(row['SHS availability']).toLowerCase() === 'yes',
						visitSchool: {
							day: row['Visit School Day'] || null
						},
						preferredDays: row['Best days']
							? String(row['Best days']).split(',').map((day) => day.trim()).filter(Boolean)
							: [],
						blackoutDates: row['Blackout Dates']
							? String(row['Blackout Dates'])
									.split(',')
									.map((date) => normalizeDate(date.trim()))
									.filter(Boolean)
							: [],
						neighborhood: row['Neighborhood'],
						country: row['Country'],
						hasMinimalConstraints:
							!row['Visit School Day'] && !row['Best days'] && !row['Blackout Dates']
					}));

					setWardFile(file);
					onWardDataUpload(transformedData);
					setError('');
				} catch (err) {
					setError('Error processing ward file: ' + err.message);
				}
			};
			reader.readAsBinaryString(file);
		}
	};

	const handleEventFileUpload = (event) => {
		const file = event.target.files[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const workbook = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
					const sheetName = workbook.SheetNames[0];
					const worksheet = workbook.Sheets[sheetName];
					const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });

					// Validate required fields
					const requiredFields = [
						'Day of the week',
						'Date',
						'School name',
						'School type',
						'Length',
						'Leader',
						'Number of slots'
					];

					const missingFields = requiredFields.filter(
						(field) => !Object.keys(data[0] || {}).includes(field)
					);

					if (missingFields.length > 0) {
						setError(`Missing required fields: ${missingFields.join(', ')}`);
						return;
					}

					// Transform data to match our data structure
					const transformedData = data.map((row, index) => ({
						id: index + 1,
						date: normalizeDate(row['Date']),
						schoolName: row['School name'],
						time: row['Day of the week'],
						leaderName: row['Leader'],
						schoolType: row['School type'],
						length: row['Length'],
						requiredSlots: parseInt(row['Number of slots']),
						neighborhoods: [] // Populate later based on your logic
					}));

					setEventFile(file);
					onEventDataUpload(transformedData);
					setError('');
				} catch (err) {
					setError('Error processing event file: ' + err.message);
				}
			};
			reader.readAsBinaryString(file);
		}
	};

	return (
		<Box sx={{ p: 3 }}>
			<Typography variant="h5" gutterBottom>
				Upload Data Files
			</Typography>
			
			{error && (
				<Alert severity="error" sx={{ mb: 2 }}>
					{error}
				</Alert>
			)}

			<Paper sx={{ p: 2, mb: 2 }}>
				<Typography variant="h6" gutterBottom>
					Ward Members Data
				</Typography>
				<Typography variant="body2" color="text.secondary" paragraph>
					Upload an Excel file containing ward member information with the following columns:
					Name, Base School, SHS availability, Visit School Day, Best days, Blackout Dates, Neighborhood, Country
				</Typography>
				<Stack direction="row" spacing={2}>
					<Button
						variant="contained"
						component="label"
						startIcon={<CloudUploadIcon />}
					>
						Upload Ward File
						<input
							type="file"
							hidden
							accept=".xlsx,.xls"
							onChange={handleWardFileUpload}
						/>
					</Button>
					<Button
						variant="outlined"
						startIcon={<DownloadIcon />}
						onClick={() => downloadTemplate('ward')}
					>
						Download Template
					</Button>
				</Stack>
				{wardFile && (
					<Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
						File uploaded: {wardFile.name}
					</Typography>
				)}
			</Paper>

			<Paper sx={{ p: 2 }}>
				<Typography variant="h6" gutterBottom>
					School Events Data
				</Typography>
				<Typography variant="body2" color="text.secondary" paragraph>
					Upload an Excel file containing school event information with the following columns:
					Day of the week, Date, School name, School type, Length, Leader, Number of slots
				</Typography>
				<Stack direction="row" spacing={2}>
					<Button
						variant="contained"
						component="label"
						startIcon={<CloudUploadIcon />}
					>
						Upload Events File
						<input
							type="file"
							hidden
							accept=".xlsx,.xls"
							onChange={handleEventFileUpload}
						/>
					</Button>
					<Button
						variant="outlined"
						startIcon={<DownloadIcon />}
						onClick={() => downloadTemplate('event')}
					>
						Download Template
					</Button>
				</Stack>
				{eventFile && (
					<Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
						File uploaded: {eventFile.name}
					</Typography>
				)}
			</Paper>
		</Box>
	);
};

export default FileUpload; 