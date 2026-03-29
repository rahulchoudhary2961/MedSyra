const parseHolidayDates = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseWeeklyOffDays = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const getWeekdayName = (dateValue) => {
  const [year, month, day] = String(dateValue || "")
    .split("-")
    .map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return weekdayNames[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || null;
};

const toMinutes = (value) => {
  if (!value) {
    return null;
  }

  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
};

const isDoctorAvailableForSlot = (doctor, appointmentDate, appointmentTime, durationMinutes) => {
  const workingStart = toMinutes(doctor?.work_start_time);
  const workingEnd = toMinutes(doctor?.work_end_time);
  const breakStart = toMinutes(doctor?.break_start_time);
  const breakEnd = toMinutes(doctor?.break_end_time);
  const slotStart = toMinutes(appointmentTime);
  const slotEnd = slotStart + Math.max(Number(durationMinutes) || 0, 15);
  const holidays = new Set(parseHolidayDates(doctor?.holiday_dates));
  const weeklyOffDays = new Set(parseWeeklyOffDays(doctor?.weekly_off_days));
  const weekdayName = getWeekdayName(appointmentDate);

  if (holidays.has(appointmentDate)) {
    return false;
  }

  if (weekdayName && weeklyOffDays.has(weekdayName)) {
    return false;
  }

  if (workingStart !== null && workingEnd !== null) {
    if (slotStart < workingStart || slotEnd > workingEnd) {
      return false;
    }
  }

  if (breakStart !== null && breakEnd !== null) {
    const overlapsBreak = slotStart < breakEnd && slotEnd > breakStart;
    if (overlapsBreak) {
      return false;
    }
  }

  return true;
};

module.exports = {
  parseHolidayDates,
  parseWeeklyOffDays,
  getWeekdayName,
  isDoctorAvailableForSlot
};
