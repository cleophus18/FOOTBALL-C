const CREST_COLORS = [
  ["#1667b1", "#75c7ff"],
  ["#c63843", "#ffd16b"],
  ["#177b68", "#75e0a5"],
  ["#7046a8", "#d3a5ff"],
  ["#bb6a20", "#ffd07a"],
  ["#2875a0", "#b1edff"],
  ["#a33f74", "#f1a7ca"],
  ["#687d2b", "#d5e77a"],
  ["#3d5068", "#a8c9ed"],
  ["#aa4d2d", "#ffc098"],
  ["#24727e", "#8ee4df"],
  ["#64533a", "#e7ca8a"],
];

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function initials(name, shortName) {
  const abbreviation = String(shortName ?? "").trim();
  if (abbreviation && abbreviation.length <= 4) return abbreviation.toUpperCase();
  return String(name).replace(/\b(?:FC|AFC|CF|SC|CD|AC|AS|RC|SV|TSV|VfB|VfL|1\.)\b/gi, "")
    .split(/[^A-Za-z0-9À-ž]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
}

export function clubCrestColors(name) {
  const value = hash(String(name || "Club").normalize("NFD").toLowerCase());
  return CREST_COLORS[value % CREST_COLORS.length];
}

function crestMark(variant, accent) {
  if (variant === 0) {
    return `<path d="M32 24l8 8-8 8-8-8z" fill="${accent}"/><path d="M32 28v8M28 32h8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  if (variant === 1) {
    return `<circle cx="32" cy="32" r="8" fill="none" stroke="${accent}" stroke-width="3"/><circle cx="32" cy="32" r="2.5" fill="#fff"/>`;
  }
  if (variant === 2) {
    return `<path d="M32 23l2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z" fill="${accent}"/>`;
  }
  return `<path d="M23 29h18M23 35h18" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="2.5" fill="#fff"/>`;
}

export function renderClubCrest(name, shortName = "", className = "") {
  const clubName = String(name || "Club");
  const value = hash(clubName.normalize("NFD").toLowerCase());
  const [base, accent] = clubCrestColors(clubName);
  const variant = (value >>> 8) % 4;
  const label = initials(clubName, shortName).slice(0, 4) || "FC";
  const labelSize = label.length > 3 ? 7 : label.length > 2 ? 9 : 11;
  const outerShape = variant % 2 === 0
    ? "M32 4 55 12v18c0 15-9 25-23 34C18 55 9 45 9 30V12z"
    : "M32 4 54 13v20c0 14-8 23-22 31-14-8-22-17-22-31V13z";
  const innerShape = variant % 2 === 0
    ? "M32 8 51 15v15c0 12-7 21-19 29-12-8-19-17-19-29V15z"
    : "M32 8 50 16v17c0 11-7 19-18 26-11-7-18-15-18-26V16z";
  const classAttribute = className ? ` class="${escapeXml(className)}"` : "";
  return `<svg${classAttribute} viewBox="0 0 64 68" role="img" aria-label="${escapeXml(`${clubName} custom crest`)}" xmlns="http://www.w3.org/2000/svg"><path d="${outerShape}" fill="#07111f" stroke="${accent}" stroke-width="2"/><path d="${innerShape}" fill="${base}" stroke="#fff" stroke-opacity=".75" stroke-width="1"/><path d="M17 17h30v4H17z" fill="${accent}" opacity=".88"/>${crestMark(variant, accent)}<text x="32" y="52" fill="#fff" font-family="Arial,sans-serif" font-size="${labelSize}" font-weight="800" letter-spacing=".5" text-anchor="middle">${escapeXml(label)}</text></svg>`;
}
