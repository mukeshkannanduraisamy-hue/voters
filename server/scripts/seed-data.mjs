/**
 * Reference data for the master tables.
 *
 * Party emblems are inline SVG encoded as Base64 data URLs and stored in
 * party_master.symbol_img, so they render with no CDN, no file server and no
 * broken-image state. Admins replace them by uploading a file in the UI.
 */

const svg = (body, bg) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${bg}"/>${body}</svg>`
  ).toString('base64');

const SUN = '<circle cx="32" cy="34" r="12" fill="#fff"/><g stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M32 8v8M32 52v4M12 34h-6M58 34h-6M18 20l5 5M46 20l-5 5M18 48l5-5M46 48l-5-5"/></g>';
const LEAVES = '<path d="M30 50c-10-4-14-16-10-26 10 2 16 12 14 22z" fill="#fff"/><path d="M36 50c10-4 14-16 10-26-10 2-16 12-14 22z" fill="#fff" opacity=".85"/><path d="M32 50v8" stroke="#fff" stroke-width="3" stroke-linecap="round"/>';
const LOTUS = '<path d="M32 46c-12 0-20-8-20-16 6-2 12 0 16 4-2-8 0-16 4-20 4 4 6 12 4 20 4-4 10-6 16-4 0 8-8 16-20 16z" fill="#fff"/>';
const HAND = '<path d="M22 46V26a4 4 0 018 0v-6a4 4 0 018 0v4a4 4 0 018 0v18a12 12 0 01-12 12h-4a8 8 0 01-8-8z" fill="#fff"/>';
const MANGO = '<path d="M32 14c10 0 18 10 18 22S42 54 32 54 14 46 14 36s8-22 18-22z" fill="#fff"/><path d="M32 14c2-4 6-6 10-6-2 4-5 6-10 6z" fill="#fff" opacity=".7"/>';
const MIC = '<rect x="26" y="10" width="12" height="24" rx="6" fill="#fff"/><path d="M18 30a14 14 0 0028 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M32 44v10M24 54h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/>';
const FLAG = '<path d="M18 10v44" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M22 14h26l-7 9 7 9H22z" fill="#fff"/>';
const POT = '<path d="M22 26h20c4 6 5 12 3 18a14 14 0 01-26 0c-2-6-1-12 3-18z" fill="#fff"/><path d="M26 26c0-4 2-8 6-8s6 4 6 8" stroke="#fff" stroke-width="3" fill="none"/>';
const SCALE = '<path d="M32 12v36M20 50h24" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M12 24h40" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M6 34a8 8 0 0012 0zM46 34a8 8 0 0012 0z" fill="#fff"/>';
const STAR = '<path d="M32 12l6 14 15 1-11 10 3 15-13-8-13 8 3-15-11-10 15-1z" fill="#fff"/>';

export const PARTIES = [
  { name: 'DMK',         name_ta: 'திராவிட முன்னேற்றக் கழகம்', party_code: 'DMK',     color_code: '#DC2626', symbol_img: svg(SUN, '#DC2626') },
  { name: 'AIADMK',      name_ta: 'அ.இ.அ.தி.மு.க',            party_code: 'AIADMK',  color_code: '#16A34A', symbol_img: svg(LEAVES, '#16A34A') },
  { name: 'BJP',         name_ta: 'பாரதிய ஜனதா கட்சி',        party_code: 'BJP',     color_code: '#EA580C', symbol_img: svg(LOTUS, '#EA580C') },
  { name: 'INC',         name_ta: 'இந்திய தேசிய காங்கிரஸ்',    party_code: 'INC',     color_code: '#2563EB', symbol_img: svg(HAND, '#2563EB') },
  { name: 'PMK',         name_ta: 'பாட்டாளி மக்கள் கட்சி',     party_code: 'PMK',     color_code: '#CA8A04', symbol_img: svg(MANGO, '#CA8A04') },
  { name: 'NTK',         name_ta: 'நாம் தமிழர் கட்சி',         party_code: 'NTK',     color_code: '#B91C1C', symbol_img: svg(MIC, '#B91C1C') },
  { name: 'TVK',         name_ta: 'தமிழக வெற்றிக் கழகம்',      party_code: 'TVK',     color_code: '#991B1B', symbol_img: svg(FLAG, '#991B1B') },
  { name: 'VCK',         name_ta: 'விடுதலை சிறுத்தைகள் கட்சி', party_code: 'VCK',     color_code: '#4338CA', symbol_img: svg(POT, '#4338CA') },
  { name: 'MDMK',        name_ta: 'ம.தி.மு.க',                party_code: 'MDMK',    color_code: '#0F766E', symbol_img: svg(FLAG, '#0F766E') },
  { name: 'Neutral',     name_ta: 'நடுநிலை',                  party_code: 'NEUTRAL', color_code: '#64748B', symbol_img: svg(SCALE, '#64748B') },
  { name: 'Independent', name_ta: 'சுயேச்சை',                 party_code: 'IND',     color_code: '#7C3AED', symbol_img: svg(STAR, '#7C3AED') },
];

export const CASTES = [
  { name: 'Vanniyar',       name_ta: 'வன்னியர்',        category: 'MBC' },
  { name: 'Gounder',        name_ta: 'கவுண்டர்',        category: 'BC' },
  { name: 'Mudaliar',       name_ta: 'முதலியார்',       category: 'BC' },
  { name: 'Naidu',          name_ta: 'நாயுடு',          category: 'BC' },
  { name: 'Nadar',          name_ta: 'நாடார்',          category: 'BC' },
  { name: 'Chettiar',       name_ta: 'செட்டியார்',      category: 'BC' },
  { name: 'Yadhavar',       name_ta: 'யாதவர்',          category: 'BC' },
  { name: 'Muslim',         name_ta: 'முஸ்லிம்',        category: 'BCM' },
  { name: 'Thevar',         name_ta: 'தேவர்',           category: 'MBC' },
  { name: 'Kuravar',        name_ta: 'குறவர்',          category: 'MBC' },
  { name: 'Valayar',        name_ta: 'வலையர்',          category: 'MBC' },
  { name: 'Adi Dravidar',   name_ta: 'ஆதி திராவிடர்',   category: 'SC' },
  { name: 'Pallar',         name_ta: 'பள்ளர்',          category: 'SC' },
  { name: 'Arunthathiyar',  name_ta: 'அருந்ததியர்',     category: 'SC' },
  { name: 'Irular',         name_ta: 'இருளர்',          category: 'ST' },
  { name: 'Malayali',       name_ta: 'மலையாளி',         category: 'ST' },
  { name: 'Brahmin',        name_ta: 'பிராமணர்',        category: 'OC' },
  { name: 'Not Disclosed',  name_ta: 'தெரிவிக்கவில்லை', category: 'OTHER' },
];

/** Six sectors covering the occupations actually found around Dharmapuri. */
export const JOB_SECTORS = [
  {
    category: 'Agriculture & Farming', category_ta: 'வேளாண்மை',
    jobs: [
      { name: 'Farmer',                name_ta: 'விவசாயி' },
      { name: 'Agricultural Labourer', name_ta: 'விவசாய கூலி' },
      { name: 'Sericulture / Silk Rearing', name_ta: 'பட்டுப்புழு வளர்ப்பு' },
      { name: 'Dairy & Cattle',        name_ta: 'கால்நடை வளர்ப்பு' },
      { name: 'Poultry',               name_ta: 'கோழி பண்ணை' },
      { name: 'Horticulture',          name_ta: 'தோட்டக்கலை' },
      { name: 'Coconut / Areca Grower',name_ta: 'தென்னை / பாக்கு விவசாயி' },
      { name: 'Fisherman',             name_ta: 'மீனவர்' },
    ],
  },
  {
    category: 'Daily Wage & Construction', category_ta: 'தினசரி கூலி',
    jobs: [
      { name: 'Mason',              name_ta: 'கொத்தனார்' },
      { name: 'Carpenter',          name_ta: 'தச்சர்' },
      { name: 'Painter',            name_ta: 'பெயிண்டர்' },
      { name: 'Electrician',        name_ta: 'மின் பணியாளர்' },
      { name: 'Plumber',            name_ta: 'குழாய் பணியாளர்' },
      { name: 'Stone Quarry Worker',name_ta: 'கல் குவாரி தொழிலாளி' },
    ],
  },
  {
    category: 'Factory & Manufacturing', category_ta: 'தொழிற்சாலை',
    jobs: [
      { name: 'Weaver',            name_ta: 'நெசவாளர்' },
      { name: 'Mill Worker',       name_ta: 'ஆலைத் தொழிலாளி' },
      { name: 'Power Loom Worker', name_ta: 'விசைத்தறி தொழிலாளி' },
      { name: 'Machine Operator',  name_ta: 'இயந்திர இயக்குநர்' },
      { name: 'Factory Labourer',  name_ta: 'தொழிற்சாலை கூலி' },
    ],
  },
  {
    category: 'Government & Services', category_ta: 'அரசுப் பணி',
    jobs: [
      { name: 'Government Teacher', name_ta: 'அரசு ஆசிரியர்' },
      { name: 'Police',             name_ta: 'காவலர்' },
      { name: 'Sanitation Worker',  name_ta: 'துப்புரவு பணியாளர்' },
      { name: 'Health Worker',      name_ta: 'சுகாதார பணியாளர்' },
      { name: 'Village Administrative Officer', name_ta: 'கிராம நிர்வாக அலுவலர்' },
      { name: 'Government Clerk',   name_ta: 'அரசு எழுத்தர்' },
    ],
  },
  {
    category: 'Business & Trade', category_ta: 'வணிகம்',
    jobs: [
      { name: 'Grocery Shop',      name_ta: 'மளிகைக் கடை' },
      { name: 'Auto Driver',       name_ta: 'ஆட்டோ ஓட்டுநர்' },
      { name: 'Lorry / Bus Driver',name_ta: 'லாரி / பேருந்து ஓட்டுநர்' },
      { name: 'Tailor',            name_ta: 'தையல் தொழிலாளி' },
      { name: 'Hotel / Tea Shop',  name_ta: 'ஹோட்டல் / டீ கடை' },
      { name: 'Petty Trader',      name_ta: 'சிறு வியாபாரி' },
      { name: 'Contractor',        name_ta: 'ஒப்பந்தக்காரர்' },
    ],
  },
  {
    category: 'Others / Students / Homemakers', category_ta: 'மற்றவை',
    jobs: [
      { name: 'Homemaker',    name_ta: 'இல்லத்தரசி' },
      { name: 'Student',      name_ta: 'மாணவர்' },
      { name: 'Retired',      name_ta: 'ஓய்வுபெற்றவர்' },
      { name: 'Unemployed',   name_ta: 'வேலையில்லாதவர்' },
      { name: 'Private Employee', name_ta: 'தனியார் ஊழியர்' },
      { name: 'Other',        name_ta: 'மற்றவை' },
    ],
  },
];

export const EDUCATION_LEVELS = [
  { name: 'Illiterate',                 name_ta: 'எழுத்தறிவு இல்லாதவர்' },
  { name: 'Primary (1st–5th)',          name_ta: 'தொடக்கக் கல்வி (1-5 ஆம் வகுப்பு)' },
  { name: 'Middle School (6th–8th)',    name_ta: 'நடுநிலைக் கல்வி (6-8 ஆம் வகுப்பு)' },
  { name: '10th / SSLC',                name_ta: '10 ஆம் வகுப்பு / எஸ்.எஸ்.எல்.சி' },
  { name: '12th / HSC',                 name_ta: '12 ஆம் வகுப்பு / உயர்நிலைக் கல்வி' },
  { name: 'Diploma / ITI',              name_ta: 'பட்டயம் / ஐ.டி.ஐ' },
  { name: 'Graduate (BA/BSc/BCom)',     name_ta: 'பட்டதாரி (பி.ஏ/பி.எஸ்.சி/பி.காம்)' },
  { name: 'Engineering (BE/BTech)',     name_ta: 'பொறியியல் பட்டதாரி (பி.இ/பி.டெக்)' },
  { name: 'Postgraduate (MA/MSc/MTech)', name_ta: 'முதுகலைப் பட்டதாரி (எம்.ஏ/எம்.எஸ்.சி/எம்.டெக்)' },
  { name: 'Professional (MBBS/LLB/MBA/CA)', name_ta: 'தொழில்முறைப் படிப்பு (எம்.பி.பி.எஸ்/எல்.எல்.பி/எம்.பி.ஏ/சி.ஏ)' },
  { name: 'PhD / Doctorate',            name_ta: 'முனைவர் பட்டம் (பிஎச்.டி)' },
  { name: 'Not Disclosed',              name_ta: 'தெரிவிக்கவில்லை' },
];
