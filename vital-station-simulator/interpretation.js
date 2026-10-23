export const referenceRanges = Object.freeze({
  systolic: Object.freeze([90, 139]),
  diastolic: Object.freeze([60, 89]),
  pulse: Object.freeze([50, 100]),
  spo2: Object.freeze([95, 100]),
  temperature: Object.freeze([36.1, 37.9]),
});

const urgentThresholds = Object.freeze({
  systolic: 180,
  diastolic: 120,
  pulseHigh: 130,
  pulseLow: 40,
  spo2: 90,
  temperatureHigh: 39.4,
  temperatureLow: 35,
});

export function interpretMeasurements(data) {
  const flags = [];
  const add = (level, text) => flags.push({ level, text });
  const [sysLow, sysHigh] = referenceRanges.systolic;
  const [diaLow, diaHigh] = referenceRanges.diastolic;
  const [pulseLow, pulseHigh] = referenceRanges.pulse;
  const [spo2Low] = referenceRanges.spo2;

  if (data.systolic >= urgentThresholds.systolic || data.diastolic >= urgentThresholds.diastolic) {
    add('urgent', `Entered blood pressure is at or above ${urgentThresholds.systolic}/${urgentThresholds.diastolic} mmHg systolic/diastolic threshold. Prompt professional assessment is advised; follow local emergency guidance if symptoms are severe.`);
  } else if (data.systolic < 90) {
    add('review', 'Entered systolic pressure is below 90 mmHg. Context and repeat measurement by a qualified professional may be important.');
  } else if (data.systolic > sysHigh || data.diastolic > diaHigh) {
    add('review', `Entered pressure is above the illustrative adult reference of ${sysLow}–${sysHigh}/${diaLow}–${diaHigh} mmHg. This is not a diagnosis; discuss with a clinician.`);
  }

  if (data.pulse >= urgentThresholds.pulseHigh || data.pulse <= urgentThresholds.pulseLow) {
    add('urgent', `Entered pulse is outside the demo prompt range (${urgentThresholds.pulseLow}–${urgentThresholds.pulseHigh} bpm). Seek prompt professional assessment, especially if unwell.`);
  } else if (data.pulse < pulseLow || data.pulse > pulseHigh) {
    add('review', `Entered pulse is outside the illustrative adult reference of ${pulseLow}–${pulseHigh} bpm. Age, rest, symptoms, and context affect interpretation.`);
  }

  if (data.spo2 <= urgentThresholds.spo2) {
    add('urgent', `Entered SpO₂ is ${urgentThresholds.spo2}% or lower. Seek prompt professional assessment; do not rely on this demo for care decisions.`);
  } else if (data.spo2 < spo2Low) {
    add('review', `Entered SpO₂ is below the illustrative reference of ${spo2Low}%. Device technique, baseline, and clinical context matter.`);
  }

  if (data.temperature >= urgentThresholds.temperatureHigh || data.temperature < urgentThresholds.temperatureLow) {
    add('urgent', `Entered temperature is at or beyond the demo prompt threshold (${urgentThresholds.temperatureLow}–${urgentThresholds.temperatureHigh} °C). Prompt professional assessment is advised, particularly with symptoms.`);
  } else if (data.temperature >= 38) {
    add('review', 'Entered temperature is 38 °C or higher. Follow the patient’s care plan and seek clinical guidance.');
  }

  const symptoms = data.symptoms.toLowerCase();
  if (/chest pain|difficulty breathing|shortness of breath|sudden weakness|faint|confusion|severe pain/.test(symptoms)) {
    add('urgent', 'The symptom text includes a potentially serious symptom. Seek prompt professional assessment or local emergency help; do not rely on this prototype.');
  }

  return flags;
}
