import os

os.makedirs('public/parties', exist_ok=True)

svgs = {
    'dmk.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="70%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#dc2626"/>
    </radialGradient>
    <linearGradient id="dmkFlag" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="50%" stop-color="#111827"/>
      <stop offset="50%" stop-color="#e11d48"/>
    </linearGradient>
  </defs>
  <!-- Background Circle Badge -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <!-- Rising Sun Motif (உதயசூரியன்) -->
  <path d="M 50 20 L 50 10 M 68 26 L 75 19 M 78 40 L 88 37 M 80 58 L 90 60 M 32 26 L 25 19 M 22 40 L 12 37 M 20 58 L 10 60 M 60 14 L 63 24 M 40 14 L 37 24 M 76 33 L 67 38 M 24 33 L 33 38" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>
  <!-- Two Mountain Peaks -->
  <polygon points="12,66 32,44 52,66" fill="#1e293b"/>
  <polygon points="48,66 68,44 88,66" fill="#0f172a"/>
  <!-- Glowing Rising Sun Core -->
  <circle cx="50" cy="46" r="16" fill="url(#sunGlow)"/>
  <!-- Bottom Sea / Horizon -->
  <path d="M 10 65 Q 30 62, 50 65 T 90 65 L 90 76 Q 70 79, 50 76 T 10 76 Z" fill="#e11d48"/>
  <rect x="10" y="74" width="80" height="14" rx="4" fill="#111827"/>
  <text x="50" y="85" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="900" letter-spacing="1">DMK</text>
</svg>''',

    'aiadmk.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="aiadmkFlag" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="35%" stop-color="#111827"/>
      <stop offset="35%" stop-color="#ffffff"/>
      <stop offset="65%" stop-color="#ffffff"/>
      <stop offset="65%" stop-color="#e11d48"/>
      <stop offset="100%" stop-color="#e11d48"/>
    </linearGradient>
  </defs>
  <!-- Background Badge -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <!-- Two Green Leaves Motif (இரட்டை இலை) -->
  <!-- Left Leaf -->
  <path d="M 50 58 C 44 48, 22 46, 26 28 C 36 28, 48 38, 50 58 Z" fill="#16a34a" stroke="#15803d" stroke-width="1.5"/>
  <path d="M 32 34 Q 40 44, 50 58" stroke="#86efac" stroke-width="1.5" fill="none"/>
  <!-- Right Leaf -->
  <path d="M 50 58 C 56 48, 78 46, 74 28 C 64 28, 52 38, 50 58 Z" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/>
  <path d="M 68 34 Q 60 44, 50 58" stroke="#bbf7d0" stroke-width="1.5" fill="none"/>
  <!-- Stem -->
  <path d="M 50 58 Q 50 68, 48 72" stroke="#15803d" stroke-width="3" stroke-linecap="round" fill="none"/>
  <!-- Flag Badge at bottom -->
  <g transform="translate(18, 76)">
    <rect width="64" height="14" rx="4" fill="url(#aiadmkFlag)" stroke="#cbd5e1" stroke-width="1"/>
    <text x="32" y="10.5" text-anchor="middle" fill="#111827" font-family="sans-serif" font-size="8" font-weight="900" letter-spacing="1">AIADMK</text>
  </g>
</svg>''',

    'bjp.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- Background Badge -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#fed7aa" stroke-width="2"/>
  <!-- Saffron Halo -->
  <circle cx="50" cy="46" r="32" fill="#fff7ed"/>
  <!-- Lotus Petals (தாமரை மலர்) -->
  <!-- Back Petals -->
  <path d="M 50 18 C 42 28, 38 42, 50 54 C 62 42, 58 28, 50 18 Z" fill="#f97316"/>
  <path d="M 32 26 C 24 38, 30 50, 44 56 C 38 46, 32 36, 32 26 Z" fill="#fb923c"/>
  <path d="M 68 26 C 76 38, 70 50, 56 56 C 62 46, 68 36, 68 26 Z" fill="#fb923c"/>
  <!-- Outer Petals -->
  <path d="M 22 38 C 16 50, 24 60, 40 62 C 30 56, 24 48, 22 38 Z" fill="#fdba74"/>
  <path d="M 78 38 C 84 50, 76 60, 60 62 C 70 56, 76 48, 78 38 Z" fill="#fdba74"/>
  <!-- Center Bud Core -->
  <path d="M 50 28 C 45 35, 44 46, 50 56 C 56 46, 55 35, 50 28 Z" fill="#ea580c"/>
  <!-- Green Base Leaves -->
  <path d="M 24 62 C 36 62, 45 66, 50 72 C 55 66, 64 62, 76 62 C 66 68, 58 72, 50 74 C 42 72, 34 68, 24 62 Z" fill="#16a34a"/>
  <!-- Bottom Badge -->
  <rect x="22" y="76" width="56" height="14" rx="4" fill="#ea580c"/>
  <text x="50" y="86.5" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="900" letter-spacing="1">BJP</text>
</svg>''',

    'inc.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- Background Badge with Tricolor ring -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
  <path d="M 50 4 A 46 46 0 0 1 96 50" fill="none" stroke="#ea580c" stroke-width="4"/>
  <path d="M 96 50 A 46 46 0 0 1 50 96" fill="none" stroke="#16a34a" stroke-width="4"/>
  <!-- Hand Symbol (கை சின்னம்) -->
  <g fill="#2563eb" stroke="#1e40af" stroke-width="1.5" stroke-linejoin="round">
    <!-- Palm & Fingers -->
    <!-- Thumb -->
    <path d="M 32 46 C 26 44, 25 36, 32 35 C 38 34, 40 42, 42 46 Z"/>
    <!-- Index Finger -->
    <path d="M 40 44 L 40 22 C 40 18, 46 18, 46 22 L 46 42 Z"/>
    <!-- Middle Finger -->
    <path d="M 47 42 L 47 16 C 47 12, 53 12, 53 16 L 53 42 Z"/>
    <!-- Ring Finger -->
    <path d="M 54 42 L 54 20 C 54 16, 60 16, 60 20 L 60 44 Z"/>
    <!-- Little Finger -->
    <path d="M 61 44 L 61 28 C 61 24, 66 24, 66 28 L 66 48 Z"/>
    <!-- Palm & Wrist -->
    <path d="M 32 45 C 32 58, 38 68, 44 72 L 58 72 C 64 68, 68 56, 66 47 Z"/>
  </g>
  <!-- Bottom Text Badge -->
  <rect x="22" y="77" width="56" height="13" rx="3.5" fill="#1d4ed8"/>
  <text x="50" y="87" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="8" font-weight="900" letter-spacing="1">CONGRESS</text>
</svg>''',

    'pmk.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="mangoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="30%" stop-color="#facc15"/>
      <stop offset="70%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#dc2626"/>
    </linearGradient>
  </defs>
  <!-- Background Badge -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#facc15" stroke-width="2"/>
  <!-- Mango Leaf -->
  <path d="M 52 24 C 52 14, 68 14, 72 20 C 66 26, 58 26, 52 24 Z" fill="#15803d"/>
  <path d="M 52 24 Q 62 18, 70 20" stroke="#86efac" stroke-width="1" fill="none"/>
  <!-- Stalk -->
  <path d="M 48 28 Q 50 20, 52 24" stroke="#713f12" stroke-width="3" fill="none"/>
  <!-- Ripe Mango (மாம்பழம்) -->
  <path d="M 46 26 C 64 24, 76 38, 72 54 C 68 68, 48 74, 38 68 C 26 62, 24 46, 32 36 C 36 30, 42 27, 46 26 Z" fill="url(#mangoGrad)" stroke="#c2410c" stroke-width="1.5"/>
  <!-- Mango tip curve -->
  <path d="M 38 68 C 36 71, 33 70, 32 67" stroke="#b45309" stroke-width="2" fill="none"/>
  <!-- Bottom Badge -->
  <rect x="25" y="76" width="50" height="14" rx="4" fill="#ca8a04"/>
  <text x="50" y="86.5" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="900" letter-spacing="1">PMK</text>
</svg>''',

    'ntk.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- Background Badge with Red & Yellow Border -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#dc2626" stroke-width="2.5"/>
  <!-- Yellow Sunray background -->
  <circle cx="50" cy="50" r="44" fill="#fef9c3"/>
  <!-- Megaphone / Mic Symbol (ஒலிவாங்கி) -->
  <path d="M 30 42 L 52 30 L 52 64 L 30 52 Z" fill="#dc2626" stroke="#991b1b" stroke-width="2"/>
  <rect x="20" y="42" width="12" height="10" rx="2" fill="#1f2937"/>
  <path d="M 28 52 L 28 66 L 36 66 L 36 52" fill="#374151"/>
  <!-- Sound Waves -->
  <path d="M 58 38 Q 66 47, 58 56" stroke="#ea580c" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M 64 32 Q 76 47, 64 62" stroke="#dc2626" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M 70 26 Q 86 47, 70 68" stroke="#b91c1c" stroke-width="4" stroke-linecap="round" fill="none"/>
  <!-- Bottom Badge -->
  <rect x="25" y="76" width="50" height="14" rx="4" fill="#dc2626"/>
  <text x="50" y="86.5" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="900" letter-spacing="1">NTK</text>
</svg>''',

    'tvk.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="tvkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#b91c1c"/>
      <stop offset="35%" stop-color="#dc2626"/>
      <stop offset="35%" stop-color="#eab308"/>
      <stop offset="65%" stop-color="#facc15"/>
      <stop offset="65%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#b91c1c"/>
    </linearGradient>
  </defs>
  <!-- Background Badge -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#eab308" stroke-width="2"/>
  <!-- TVK Flag Shield -->
  <rect x="14" y="20" width="72" height="46" rx="6" fill="url(#tvkGrad)" stroke="#78350f" stroke-width="1.5"/>
  <!-- Victory Star in center -->
  <polygon points="50,33 54,43 64,43 56,49 59,59 50,53 41,59 44,49 36,43 46,43" fill="#ffffff" stroke="#b45309" stroke-width="1"/>
  <!-- Trumpeting Elephants silhouettes (Left & Right) -->
  <circle cx="28" cy="43" r="5" fill="#ffffff"/>
  <circle cx="72" cy="43" r="5" fill="#ffffff"/>
  <!-- Bottom Badge -->
  <rect x="25" y="74" width="50" height="15" rx="4" fill="#b91c1c"/>
  <text x="50" y="85" text-anchor="middle" fill="#facc15" font-family="sans-serif" font-size="9" font-weight="900" letter-spacing="1">TVK</text>
</svg>''',

    'vck.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="vckFlag" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="50%" stop-color="#1d4ed8"/>
      <stop offset="50%" stop-color="#dc2626"/>
    </linearGradient>
  </defs>
  <!-- Background Badge -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#1d4ed8" stroke-width="2"/>
  <!-- Flag circle background -->
  <circle cx="50" cy="44" r="30" fill="url(#vckFlag)"/>
  <!-- Earthen Pot Symbol (பானை) in center -->
  <ellipse cx="50" cy="36" rx="9" ry="3.5" fill="#f8fafc" stroke="#1e293b" stroke-width="1"/>
  <path d="M 43 37 C 36 44, 34 52, 40 58 C 45 62, 55 62, 60 58 C 66 52, 64 44, 57 37 Z" fill="#ffffff" stroke="#0f172a" stroke-width="2"/>
  <!-- Bottom Badge -->
  <rect x="25" y="76" width="50" height="14" rx="4" fill="#1e3a8a"/>
  <text x="50" y="86.5" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="900" letter-spacing="1">VCK</text>
</svg>''',

    'neutral.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- Background Badge -->
  <circle cx="50" cy="50" r="48" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
  <!-- Balance Scale (நடுநிலை / தராசு) -->
  <!-- Beam -->
  <rect x="24" y="32" width="52" height="4" rx="2" fill="#475569"/>
  <!-- Center Pivot -->
  <polygon points="50,22 46,34 54,34" fill="#1e293b"/>
  <circle cx="50" cy="22" r="3.5" fill="#3b82f6"/>
  <!-- Left Pan -->
  <line x1="30" y1="36" x2="24" y2="52" stroke="#64748b" stroke-width="1.5"/>
  <line x1="30" y1="36" x2="36" y2="52" stroke="#64748b" stroke-width="1.5"/>
  <path d="M 20 52 Q 30 58, 40 52 Z" fill="#64748b"/>
  <!-- Right Pan -->
  <line x1="70" y1="36" x2="64" y2="52" stroke="#64748b" stroke-width="1.5"/>
  <line x1="70" y1="36" x2="76" y2="52" stroke="#64748b" stroke-width="1.5"/>
  <path d="M 60 52 Q 70 58, 80 52 Z" fill="#64748b"/>
  <!-- Stand -->
  <rect x="48" y="34" width="4" height="34" fill="#334155"/>
  <rect x="36" y="66" width="28" height="6" rx="2" fill="#1e293b"/>
  <!-- Bottom Badge -->
  <rect x="18" y="76" width="64" height="14" rx="4" fill="#475569"/>
  <text x="50" y="86.5" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="8" font-weight="800" letter-spacing="0.5">NEUTRAL</text>
</svg>''',

    'independent.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </radialGradient>
  </defs>
  <!-- Background Badge -->
  <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#0284c7" stroke-width="2"/>
  <!-- Star Symbol (சுயேச்சை நட்சத்திரம்) -->
  <polygon points="50,16 57,34 76,34 61,46 67,64 50,52 33,64 39,46 24,34 43,34" fill="url(#starGlow)" stroke="#0369a1" stroke-width="1.5"/>
  <!-- Star inner sparkle -->
  <circle cx="50" cy="40" r="3" fill="#ffffff"/>
  <!-- Bottom Badge -->
  <rect x="20" y="76" width="60" height="14" rx="4" fill="#0284c7"/>
  <text x="50" y="86.5" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="8" font-weight="900" letter-spacing="1">IND / OTHERS</text>
</svg>'''
}

for filename, content in svgs.items():
    filepath = os.path.join('public', 'parties', filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content.strip())
    print(f'Created {filepath}')

print('All 10 Party SVGs successfully generated!')
