/**
 * The survey form as it shipped before the Form Builder existed, expressed in
 * the builder's own field language. This seeds version 1 so day one of the
 * builder starts from exactly the form agents already know, not a blank page.
 *
 * `bind` is the important bit. Six of these answers live in dedicated
 * vms_voter_surveys columns that the dashboards, analytics breakdowns and the
 * Excel export all read directly. Those fields stay fully governable from the
 * builder — relabel, reorder, require, hide, translate — but their values keep
 * flowing into the real columns. Only fields with `bind: null` are free-form
 * custom fields stored in vms_survey_answers.
 */

export const FIELD_TYPES = [
  'text', 'textarea', 'number', 'phone', 'date',
  'select', 'multiselect', 'radio', 'boolean', 'party',
  'section', 'divider', 'notice',
];

/** Types that never hold an answer — they are layout/─presentation only. */
export const STRUCTURAL_TYPES = new Set(['section', 'divider', 'notice']);

/** Types whose answer is a list rather than a scalar. */
export const MULTI_TYPES = new Set(['multiselect']);

/** Columns on vms_voter_surveys a field may bind to, and how to coerce them. */
export const SYSTEM_BINDINGS = {
  phone_number:    { kind: 'text' },
  caste_id:        { kind: 'masterId', master: 'caste' },
  job_id:          { kind: 'masterId', master: 'job' },
  party_id:        { kind: 'masterId', master: 'party' },
  education_id:    { kind: 'masterId', master: 'education' },
  other_job_text:  { kind: 'text' },
  remarks:         { kind: 'text' },
};

export const DEFAULT_FIELDS = [
  {
    key: 'sec_intel', type: 'section', width: 'full', active: true,
    label: 'Survey intelligence', labelTa: 'கணக்கெடுப்பு தகவல்',
    hint: 'All fields below are optional', hintTa: 'கீழே உள்ள அனைத்து புலங்களும் விருப்பத்தேர்வு',
  },
  {
    key: 'phone_number', type: 'phone', bind: 'phone_number', width: 'full', active: true,
    required: false,
    label: 'Voter phone number', labelTa: 'வாக்காளர் கைபேசி எண்',
    hint: '10 digits starting with 6, 7, 8 or 9', hintTa: '6, 7, 8 அல்லது 9 இல் தொடங்கும் 10 இலக்கங்கள்',
    placeholder: '9840112233',
    validation: { regex: '^[6-9]\\d{9}$', regexMessage: 'Enter a valid 10-digit number starting 6-9' },
  },
  {
    key: 'caste_id', type: 'select', bind: 'caste_id', width: 'half', active: true, required: false,
    label: 'Caste / community', labelTa: 'சாதி / சமூகம்',
    source: { kind: 'master', master: 'caste' },
  },
  {
    key: 'education_id', type: 'select', bind: 'education_id', width: 'half', active: true, required: false,
    label: 'Education', labelTa: null,
    source: { kind: 'master', master: 'education' },
  },
  {
    key: 'job_sector', type: 'select', bind: null, width: 'half', active: true, required: false,
    label: 'Occupation sector', labelTa: 'தொழில் துறை',
    source: { kind: 'master', master: 'job_sector' },
    transient: true, // a filter for job_id below; not stored as an answer
  },
  {
    key: 'job_id', type: 'select', bind: 'job_id', width: 'half', active: true, required: false,
    label: 'Specific sub-job', labelTa: 'குறிப்பிட்ட வேலை',
    source: { kind: 'master', master: 'job', parentField: 'job_sector' },
  },
  {
    key: 'other_job_text', type: 'text', bind: 'other_job_text', width: 'full', active: true, required: false,
    label: 'Custom job note', labelTa: 'தனிப்பயன் வேலை குறிப்பு',
    placeholder: 'e.g. பட்டுப்புழு வளர்ப்பு',
  },
  {
    key: 'party_id', type: 'party', bind: 'party_id', width: 'full', active: true, required: false,
    label: 'Political leaning', labelTa: 'அரசியல் சாய்வு',
    source: { kind: 'master', master: 'party' },
  },
  {
    key: 'remarks', type: 'textarea', bind: 'remarks', width: 'full', active: true, required: false,
    label: 'Remarks', labelTa: 'குறிப்புகள்',
    hint: 'Optional note for the supervisor', hintTa: 'மேற்பார்வையாளருக்கான விருப்பக் குறிப்பு',
    placeholder: 'e.g. House locked, revisit in the evening',
    rows: 2,
  },
];
