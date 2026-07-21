import * as XLSX from 'xlsx';

export const generateWardTemplate = () => {
  const template = [
    {
      'Name': 'Smith, John',
      'Base School': 'Maple High School',
      'SHS availability': 'Yes',
      'Visit School Day': 'Monday',
      'Best days': 'Tuesday, Wednesday, Thursday',
      'Blackout Dates': '2025-06-10, 2025-10-15',
      'Neighborhood': 'Hill',
      'Country': 'USA',
      'Gender': 'Male'
    },
    {
      'Name': 'Garcia, Maria',
      'Base School': 'Oak Middle School',
      'SHS availability': 'No',
      'Visit School Day': '',  // Example of empty visit school day
      'Best days': '',         // Example of empty preferred days
      'Blackout Dates': '',    // Example of empty blackout dates
      'Neighborhood': 'Terrace',
      'Country': 'Spain',
      'Gender': 'Female'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ward Members');
  
  // Add column widths
  const wscols = [
    { wch: 20 }, // Name
    { wch: 25 }, // Base School
    { wch: 15 }, // SHS availability
    { wch: 15 }, // Visit School Day
    { wch: 30 }, // Best days
    { wch: 30 }, // Blackout Dates
    { wch: 15 }, // Neighborhood
    { wch: 15 }, // Country
    { wch: 10 }  // Gender
  ];
  ws['!cols'] = wscols;

  return wb;
};

export const generateEventTemplate = () => {
  const template = [
    {
      'Day of the week': 'Monday',
      'Date': '2025-06-05',
      'School name': 'Maple High School',
      'School type': 'SHS',
      'Length': 'Full day',
      'Leader': 'John Smith',
      'Number of slots': '3'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'School Events');
  
  // Add column widths
  const wscols = [
    { wch: 15 }, // Day of the week
    { wch: 15 }, // Date
    { wch: 25 }, // School name
    { wch: 15 }, // School type
    { wch: 15 }, // Length
    { wch: 20 }, // Leader
    { wch: 15 }  // Number of slots
  ];
  ws['!cols'] = wscols;

  return wb;
};

export const downloadTemplate = (type) => {
  const wb = type === 'ward' ? generateWardTemplate() : generateEventTemplate();
  const fileName = type === 'ward' ? 'ward_members_template.xlsx' : 'school_events_template.xlsx';
  XLSX.writeFile(wb, fileName);
}; 