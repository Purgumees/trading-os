const months = [
  "Jaanuar",
  "Veebruar",
  "Märts",
  "Aprill",
  "Mai",
  "Juuni",
  "Juuli",
  "August",
  "September",
  "Oktoober",
  "November",
  "Detsember",
];
export function macroDateLabel(date: string, daily = false): string {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(date);
  if (quarter) return `${quarter[2]}. kvartal ${quarter[1]}`;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(date);
  if (!match) return date;
  const month = months[Number(match[2]) - 1];
  if (!month) return date;
  return `${daily && match[3] ? `${Number(match[3])}. ` : ""}${month} ${match[1]}`;
}
