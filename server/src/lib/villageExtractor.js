/**
 * Utility to extract clean village / habitation / street names from Election Commission
 * Tamil electoral roll section titles (section_title_ta).
 *
 * Example inputs and extracted outputs:
 *  - "58-பென்னாகரம் பிரிவு எண் மற்றும் பெயர் 1-மல்லிக்குட்ட (வ.கி) மற்றும் (ஊள்), வார்டு 3 ராமியம்பட்டி"
 *    -> "ராமியம்பட்டி"
 *  - "58-பென்னாகரம் பிரிவு எண் மற்றும் பெயர் 1-இராமகொண்டஅள்ளி (வ.கி) மற்றும் (ஊ), வார்டு 1 சொளப்பாடி"
 *    -> "சொளப்பாடி"
 *  - "58-பென்னாகரம் பிரிவு எண் மற்றும் பெயர் 2-இராமகொண்டஅள்ளி (வ.கி) மற்றும் (ஊ), வார்டு 1 புதூர் சொளப்பாடி"
 *    -> "புதூர் சொளப்பாடி"
 *  - "58-பென்னாகரம் பிரிவு எண் மற்றும் பெயர் 2-காள்ப்பனஹள்ளி (வ.கி) மற்றும் (ஊ), வார்டு 1 குப்பங்கரை"
 *    -> "குப்பங்கரை"
 *  - "58-பென்னாகரம் பிரிவு எண் மற்றும் பெயர் 4-பருவதனஅள்ளி (வ.கி) மற்றும் (ஊ), அண்ணாநகர், ஏரங்காடு"
 *    -> "ஏரங்காடு"
 *  - "58-பென்னாகரம் பிரிவு எண் மற்றும் பெயர் 2-பெய்ல்மேரி (வ.கி), மாங்கரை (ஊ), வார்டு 4 வீரகாரர் கொயில் தெரு"
 *    -> "வீரகாரர் கொயில் தெரு"
 */

const LOCALITY_DESCRIPTORS_RE = /தெரு|காலனி|நகர்|கொட்டாய்|சந்து|ரோடு|வளவு|வீதி/i;

export function extractVillageFromSection(title) {
  if (!title) return null;
  const s = String(title).trim();
  if (!s) return null;

  // Supplements / special additions
  if (s.startsWith('சேர்த்தல் பட்டியல்') || s.startsWith('நீக்கல் பட்டியல்')) {
    return 'சேர்த்தல் பட்டியல்';
  }

  // 1. Isolate text after administrative parentheticals: (வ.கி), (ஊ), (ப்), etc.
  let afterParen = s;
  const lastParenIdx = s.lastIndexOf(')');
  if (lastParenIdx !== -1) {
    afterParen = s.substring(lastParenIdx + 1).trim();
  } else {
    const commaIdx = s.lastIndexOf(',');
    if (commaIdx !== -1) {
      afterParen = s.substring(commaIdx + 1).trim();
    }
  }

  // Strip leading punctuation / spaces
  afterParen = afterParen.replace(/^[\s,;.-]+/, '').trim();

  // 2. Strip ward prefix if present:
  // e.g. "வார்டு 3 ராமியம்பட்டி" -> "ராமியம்பட்டி"
  // e.g. "வார்டு 2, 4 அத்திமரத்தூர்" -> "அத்திமரத்தூர்"
  // e.g. "வார்டு 1,2,3,4 பளிஞ்சரஅள்ளி" -> "பளிஞ்சரஅள்ளி"
  const withoutWard = afterParen
    .replace(/^வார்டு\s*[\d\s,/-]+/, '')
    .replace(/^[\s,;.-]+/, '')
    .trim();

  if (!withoutWard) return null;

  // Filter out malformed strings where section header was duplicated without any name
  if (withoutWard.includes('பிரிவு எண் மற்றும் பெயர்')) {
    return null;
  }

  // 3. Handle multi-part strings separated by comma (e.g. "அண்ணாநகர், ஏரங்காடு"):
  if (withoutWard.includes(',')) {
    const parts = withoutWard
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length > 1) {
      // Prefer the part that does NOT contain a street/locality descriptor (like நகர், தெரு, காலனி)
      const nonLocalityParts = parts.filter((p) => !LOCALITY_DESCRIPTORS_RE.test(p));
      if (nonLocalityParts.length === 1) {
        return nonLocalityParts[0];
      }
      if (nonLocalityParts.length > 1) {
        return nonLocalityParts[nonLocalityParts.length - 1];
      }
      // If all contain descriptors (e.g. "சாம்பள்ளி, அருந்ததியர் தெரு"), take the last part
      return parts[parts.length - 1];
    }
  }

  return withoutWard;
}

export default extractVillageFromSection;
