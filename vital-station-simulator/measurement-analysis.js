export const measurementRanges = Object.freeze({
  systolic: [90, 139],
  diastolic: [60, 89],
  pulse: [50, 100],
  spo2: [95, 100],
  temperature: [36.1, 37.9],
});

export const measurementLimits = Object.freeze({
  systolic: [50, 300],
  diastolic: [30, 200],
  pulse: [20, 250],
  spo2: [50, 100],
  temperature: [30, 45],
  pain: [0, 10],
});

export function validateMeasurement(record) {
  const errors = {};
  if (!record.patientId?.trim()) errors.patientId = 'Enter a patient ID.';
  const measured = new Date(record.measuredAt);
  if (!record.measuredAt || Number.isNaN(measured.getTime())) errors.measuredAt = 'Enter a valid measurement date and time.';
  else if (measured.getTime() > Date.now() + 5 * 60 * 1000) errors.measuredAt = 'Measurement time cannot be in the future.';

  for (const [field, [min, max]] of Object.entries(measurementLimits)) {
    const raw = record[field];
    if (field === 'pain' && (raw === '' || raw === null || raw === undefined)) continue;
    if (raw === '' || raw === null || raw === undefined || !Number.isFinite(Number(raw))) {
      errors[field] = 'Enter a value.';
      continue;
    }
    const value = Number(raw);
    if (value < min || value > max) errors[field] = `Enter a value from ${min} to ${max}.`;
  }

  if (!errors.systolic && !errors.diastolic && Number(record.systolic) - Number(record.diastolic) < 10) {
    errors.systolic = 'Systolic pressure must be at least 10 mmHg higher than diastolic.';
    errors.diastolic = 'Diastolic pressure must be at least 10 mmHg lower than systolic.';
  }
  if (!record.source) errors.source = 'Select the measurement source.';
  return errors;
}

export function localDayKey(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function sortMeasurements(records) {
  return [...records].sort((left, right) => new Date(left.measuredAt) - new Date(right.measuredAt));
}

export function summarizeRecords(records, startDate, endDate, now = new Date()) {
  const sorted = sortMeasurements(records);
  const filtered = sorted.filter(record => {
    const key = localDayKey(record.measuredAt);
    return (!startDate || key >= startDate) && (!endDate || key <= endDate);
  });
  const latest = filtered.at(-1) || null;
  const previous = filtered.at(-2) || null;
  const metrics = ['systolic', 'diastolic', 'pulse', 'spo2', 'temperature'];
  const statistics = Object.fromEntries(metrics.map(metric => {
    const values = filtered.map(record => Number(record[metric])).filter(Number.isFinite);
    if (!values.length) return [metric, null];
    return [metric, {
      count: values.length,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      first: values[0],
      last: values.at(-1),
    }];
  }));
  const days = [];
  if (startDate && endDate) {
    const cursor = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    while (cursor <= end && days.length < 366) {
      const key = localDayKey(cursor);
      const daily = filtered.filter(record => localDayKey(record.measuredAt) === key);
      days.push({ date: key, records: daily });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const measuredDays = days.filter(day => day.records.length).length;
  const expectedDays = days.length;
  const missingDays = days.filter(day => !day.records.length).map(day => day.date);
  return {
    records: filtered,
    latest,
    previous,
    statistics,
    days,
    measurementCount: filtered.length,
    measuredDays,
    expectedDays,
    missingDays,
    asOf: now.toISOString(),
  };
}

export function readingFlags(record) {
  if (!record) return [];
  const flags = [];
  const add = (level, metric, value, reason) => flags.push({ level, metric, value, reason });
  if (record.systolic >= 180 || record.diastolic >= 120) add('urgent', 'Blood pressure', `${record.systolic}/${record.diastolic} mmHg`, 'Entered value is at or above the 180/120 mmHg prompt threshold; seek prompt professional assessment.');
  else if (record.systolic > measurementRanges.systolic[1] || record.diastolic > measurementRanges.diastolic[1]) add('review', 'Blood pressure', `${record.systolic}/${record.diastolic} mmHg`, `Above the illustrative adult reference ${measurementRanges.systolic[0]}–${measurementRanges.systolic[1]}/${measurementRanges.diastolic[0]}–${measurementRanges.diastolic[1]} mmHg; context matters.`);
  if (record.pulse <= 40 || record.pulse >= 130) add('urgent', 'Pulse', `${record.pulse} bpm`, 'Outside the informational prompt range 40–130 bpm; assessment depends on symptoms and clinical context.');
  else if (record.pulse < measurementRanges.pulse[0] || record.pulse > measurementRanges.pulse[1]) add('review', 'Pulse', `${record.pulse} bpm`, `Outside the illustrative adult reference ${measurementRanges.pulse[0]}–${measurementRanges.pulse[1]} bpm.`);
  if (record.spo2 <= 90) add('urgent', 'SpO₂', `${record.spo2}%`, 'At or below the informational prompt threshold of 90%; seek prompt professional assessment, especially if unwell.');
  else if (record.spo2 < measurementRanges.spo2[0]) add('review', 'SpO₂', `${record.spo2}%`, `Below the illustrative reference of ${measurementRanges.spo2[0]}%; measurement quality and personal baseline matter.`);
  if (record.temperature >= 39.4 || record.temperature < 35) add('urgent', 'Temperature', `${record.temperature.toFixed(1)} °C`, 'Outside the informational prompt range 35–39.4 °C; seek professional assessment.');
  else if (record.temperature >= 38) add('review', 'Temperature', `${record.temperature.toFixed(1)} °C`, 'At or above 38 °C; follow the person’s care plan and seek clinical guidance.');
  if (Number(record.pain) >= 8) add('review', 'Pain score', `${record.pain}/10`, 'High patient-reported pain score; follow the person’s care plan and seek clinical guidance.');
  const symptoms = String(record.symptoms || '').toLowerCase();
  if (/chest pain|difficulty breathing|shortness of breath|sudden weakness|faint|confusion|severe pain/.test(symptoms)) add('urgent', 'Reported symptoms', 'Patient-reported', 'The entered symptoms include a potentially serious sign; seek prompt professional assessment or local emergency help.');
  return flags;
}

export function metricChange(previous, latest, metric) {
  if (!previous || !latest || !Number.isFinite(Number(previous[metric])) || !Number.isFinite(Number(latest[metric]))) return null;
  const before = Number(previous[metric]);
  const after = Number(latest[metric]);
  const difference = after - before;
  return { before, after, difference, percent: before === 0 ? null : (difference / Math.abs(before)) * 100 };
}

export function analyzePatientHistory(records, patientId, startDate, endDate, analyzedAt = new Date()) {
  const patientRecords = sortMeasurements(records.filter(record => record.patientId === patientId));
  const selected = patientRecords.filter(record => {
    const day = localDayKey(record.measuredAt);
    return (!startDate || day >= startDate) && (!endDate || day <= endDate);
  });
  const latest = selected.at(-1) || null;
  const previous = selected.at(-2) || null;
  const flags = readingFlags(latest);
  const changes = previous ? ['systolic', 'diastolic', 'pulse', 'spo2', 'temperature'].map(metric => ({
    metric,
    ...metricChange(previous, latest, metric),
  })) : [];
  const days = new Set(selected.map(record => localDayKey(record.measuredAt)));
  const dataQuality = [];
  if (!latest) dataQuality.push('No saved measurements for this patient in the selected date range.');
  else if (!previous) dataQuality.push('Only one saved reading is available in this range; changes and trends cannot be determined.');
  if (latest?.source === 'external') dataQuality.push('External-device values were transcribed by the user; this prototype does not verify the device, connect to it, or confirm its measurements.');
  else if (latest) dataQuality.push('Latest values were manually entered; this prototype does not verify the measuring device or technique.');
  let historicalTrend = 'Not enough historical data to determine a trend.';
  if (days.size >= 2) {
    const trendMetrics = ['pulse', 'spo2', 'temperature'];
    const metricSummary = trendMetrics.map(metric => {
      const values = selected.map(record => Number(record[metric])).filter(Number.isFinite);
      if (values.length < 2) return null;
      const first = values[0];
      const last = values.at(-1);
      const delta = last - first;
      const unit = metric === 'pulse' ? ' bpm' : metric === 'spo2' ? '%' : ' °C';
      return `${metric}: ${first} to ${last}${unit} across ${values.length} readings`;
    }).filter(Boolean);
    historicalTrend = `${selected.length} saved reading(s) across ${days.size} date(s). ${metricSummary.length ? metricSummary.join('; ') + '.' : 'Not enough repeated values for metric trends.'} Changes are descriptive and do not imply a cause.`;
  }

  const summary = latest
    ? `Latest saved measurements for ${patientId}: blood pressure ${latest.systolic}/${latest.diastolic} mmHg, pulse ${latest.pulse} bpm, SpO₂ ${latest.spo2}%, and temperature ${Number(latest.temperature).toFixed(1)} °C. Measured ${new Date(latest.measuredAt).toLocaleString()} (${latest.sourceLabel || 'user-entered'}).`
    : `No saved measurements for ${patientId} in the selected date range.`;
  const changesSummary = changes.length
    ? changes.map(change => {
      const label = change.metric === 'spo2' ? 'SpO₂' : change.metric === 'temperature' ? 'Temperature' : change.metric;
      const unit = change.metric === 'systolic' || change.metric === 'diastolic' ? ' mmHg' : change.metric === 'pulse' ? ' bpm' : change.metric === 'spo2' ? '%' : ' °C';
      return `${label}: ${change.difference > 0 ? '+' : ''}${change.difference.toFixed(change.metric === 'temperature' ? 1 : 0)}${unit}`;
    }).join('; ')
    : 'Not enough historical data to compare with a previous reading.';
  const urgent = flags.some(flag => flag.level === 'urgent');
  const review = flags.some(flag => flag.level === 'review');
  return {
    provider: 'Rule-based fallback · no external AI service configured',
    patientId,
    analyzedAt: analyzedAt.toISOString(),
    recordCount: selected.length,
    latest,
    previous,
    latestSummary: summary,
    observedChanges: changesSummary,
    historicalTrend,
    concerns: flags,
    dataQuality,
    nextStep: urgent ? 'Prompt professional assessment is advised based on the visible rule-based flags. Seek local emergency help for severe symptoms.' : review ? 'Professional review is advisable for the flagged measurement(s); interpretation depends on clinical context.' : 'Continue recording measurements as directed by the care team. Readings without flags do not establish that a person is safe.',
    disclaimer: 'Informational decision support only. This prototype does not diagnose, predict emergencies, or recommend changing treatment.',
  };
}
