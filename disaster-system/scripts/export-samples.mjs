/**
 * Exports sample CSV datasets from the live database into client/public/samples.
 * These are the files offered as one-click downloads in the Dataset Management
 * module, so users can immediately exercise upload → analyse → compare.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'client', 'public', 'samples');
fs.mkdirSync(OUT, { recursive: true });

const esc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, columns) =>
  [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';

function write(name, rows, columns) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, toCsv(rows, columns));
  console.log(`wrote ${name} (${rows.length} rows)`);
}

for (const year of [2024, 2025]) {
  const rows = query(
    `SELECT type AS Disaster, location AS Location, region AS Region, occurred_on AS Date,
            severity AS Severity, affected_population AS Affected_People, casualties AS Casualties,
            displaced AS Displaced, status AS Status
     FROM disasters WHERE substr(occurred_on,1,4) = ? ORDER BY occurred_on`,
    [String(year)],
  );
  write(`disasters_${year}.csv`, rows, ['Disaster', 'Location', 'Region', 'Date', 'Severity', 'Affected_People', 'Casualties', 'Displaced', 'Status']);
}

const sos = query(
  `SELECT disaster_type AS Disaster_Type, location AS Location, region AS Region, reported_at AS Reported_At,
          priority AS Priority, status AS Status, category AS Category,
          response_minutes AS Response_Minutes, people_count AS People_Count
   FROM sos_requests ORDER BY reported_at LIMIT 900`,
);
write('sos_requests.csv', sos, ['Disaster_Type', 'Location', 'Region', 'Reported_At', 'Priority', 'Status', 'Category', 'Response_Minutes', 'People_Count']);

const donations = query(
  `SELECT campaign AS Campaign, disaster_type AS Disaster_Type, type AS Donation_Type, amount AS Amount,
          quantity AS Quantity, donor_type AS Donor_Type, region AS Region, donated_on AS Date
   FROM donations ORDER BY donated_on LIMIT 800`,
);
write('donations.csv', donations, ['Campaign', 'Disaster_Type', 'Donation_Type', 'Amount', 'Quantity', 'Donor_Type', 'Region', 'Date']);
