/**
 * Deterministic demo seed for the disaster database.
 *
 * NOTE: this creates *records* (rows of disaster data), not chart values.
 * Every KPI / chart in the app is aggregated from the database at request
 * time, and can be replaced by uploaded CSV/XLSX/JSON datasets.
 */
import { pathToFileURL } from 'node:url';
import { db, transaction } from './db.js';

/** Reproducible PRNG so the demo dataset is identical on every machine. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20260918;
// Re-initialised at the start of every seed() so a reseed is byte-for-byte identical.
let rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p) => rnd() < p;

export const REGIONS = {
  'North India': ['Delhi NCR', 'Punjab', 'Uttar Pradesh', 'Uttarakhand', 'Himachal Pradesh', 'Jammu & Kashmir', 'Rajasthan'],
  'South India': ['Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Telangana'],
  'East India': ['West Bengal', 'Odisha', 'Bihar', 'Jharkhand'],
  'West India': ['Maharashtra', 'Gujarat', 'Goa'],
  'Central India': ['Madhya Pradesh', 'Chhattisgarh'],
  'Northeast India': ['Assam', 'Meghalaya', 'Sikkim', 'Arunachal Pradesh'],
};

/** district -> [lat, lon] */
const GEO = {
  'Delhi NCR': [[28.61, 77.21], [28.45, 77.02], [28.53, 77.39]],
  Punjab: [[30.9, 75.85], [31.63, 74.87], [31.32, 75.57]],
  'Uttar Pradesh': [[26.85, 80.95], [25.31, 82.97], [26.76, 83.37]],
  Uttarakhand: [[30.31, 78.03], [30.42, 79.33], [30.28, 78.98]],
  'Himachal Pradesh': [[31.1, 77.17], [31.96, 77.1], [32.24, 77.19]],
  'Jammu & Kashmir': [[34.08, 74.79], [32.72, 74.85], [34.15, 74.9]],
  Rajasthan: [[26.91, 75.78], [26.23, 73.02], [25.75, 71.39]],
  'Tamil Nadu': [[13.08, 80.27], [11.01, 76.96], [10.79, 78.7]],
  Kerala: [[9.93, 76.26], [10.52, 76.21], [11.25, 75.78]],
  Karnataka: [[12.97, 77.59], [12.91, 74.85], [15.36, 75.12]],
  'Andhra Pradesh': [[16.5, 80.64], [17.68, 83.21], [14.44, 79.99]],
  Telangana: [[17.38, 78.48], [17.97, 79.59], [18.43, 79.12]],
  'West Bengal': [[22.57, 88.36], [26.72, 88.39], [26.32, 89.44]],
  Odisha: [[20.29, 85.82], [19.8, 85.85], [21.49, 86.93]],
  Bihar: [[25.59, 85.13], [26.15, 85.9], [26.45, 85.0]],
  Jharkhand: [[23.34, 85.31], [24.2, 84.87], [22.8, 86.2]],
  Maharashtra: [[19.07, 72.87], [18.52, 73.85], [21.14, 79.08]],
  Gujarat: [[23.02, 72.57], [21.17, 72.83], [23.24, 69.67]],
  Goa: [[15.49, 73.82], [15.3, 74.13], [15.26, 73.98]],
  'Madhya Pradesh': [[23.25, 77.41], [23.18, 79.98], [26.21, 78.18]],
  Chhattisgarh: [[21.25, 81.62], [22.08, 82.14], [21.19, 81.28]],
  Assam: [[26.14, 91.73], [27.47, 94.91], [24.83, 92.78]],
  Meghalaya: [[25.57, 91.89], [25.52, 90.2], [25.89, 90.63]],
  Sikkim: [[27.33, 88.61], [27.24, 88.44], [27.7, 88.55]],
  'Arunachal Pradesh': [[27.1, 93.62], [27.95, 96.17], [27.57, 93.85]],
};

const DISTRICT_NAME = {
  'Delhi NCR': ['New Delhi', 'Gurugram', 'Noida'],
  Punjab: ['Ludhiana', 'Amritsar', 'Patiala'],
  'Uttar Pradesh': ['Lucknow', 'Varanasi', 'Gorakhpur'],
  Uttarakhand: ['Dehradun', 'Chamoli', 'Rudraprayag'],
  'Himachal Pradesh': ['Shimla', 'Kullu', 'Manali'],
  'Jammu & Kashmir': ['Srinagar', 'Jammu', 'Anantnag'],
  Rajasthan: ['Jaipur', 'Jodhpur', 'Barmer'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Tiruchirappalli'],
  Kerala: ['Kochi', 'Thrissur', 'Kozhikode'],
  Karnataka: ['Bengaluru', 'Mangaluru', 'Hubballi'],
  'Andhra Pradesh': ['Vijayawada', 'Visakhapatnam', 'Nellore'],
  Telangana: ['Hyderabad', 'Warangal', 'Nizamabad'],
  'West Bengal': ['Kolkata', 'Siliguri', 'Cooch Behar'],
  Odisha: ['Bhubaneswar', 'Puri', 'Balasore'],
  Bihar: ['Patna', 'Darbhanga', 'Muzaffarpur'],
  Jharkhand: ['Ranchi', 'Hazaribagh', 'Jamshedpur'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur'],
  Gujarat: ['Ahmedabad', 'Surat', 'Bhuj'],
  Goa: ['Panaji', 'Margao', 'Ponda'],
  'Madhya Pradesh': ['Bhopal', 'Jabalpur', 'Gwalior'],
  Chhattisgarh: ['Raipur', 'Bilaspur', 'Korba'],
  Assam: ['Guwahati', 'Dibrugarh', 'Silchar'],
  Meghalaya: ['Shillong', 'Tura', 'Jowai'],
  Sikkim: ['Gangtok', 'Namchi', 'Mangan'],
  'Arunachal Pradesh': ['Itanagar', 'Pasighat', 'Tawang'],
};

const TYPES = ['Flood', 'Earthquake', 'Cyclone', 'Landslide', 'Drought', 'Wildfire', 'Heatwave', 'Cold Wave', 'Cloudburst'];

/** which disaster types are plausible in which region (weighted) */
const TYPE_WEIGHTS = {
  'North India': { Flood: 3, Earthquake: 3, Heatwave: 3, 'Cold Wave': 3, Landslide: 3, Cloudburst: 2, Drought: 2, Wildfire: 2, Cyclone: 0 },
  'South India': { Flood: 3, Cyclone: 3, Drought: 2, Heatwave: 2, Landslide: 2, Wildfire: 1, Earthquake: 0, 'Cold Wave': 0, Cloudburst: 1 },
  'East India': { Flood: 4, Cyclone: 3, Heatwave: 2, Drought: 1, Landslide: 1, Wildfire: 1, Earthquake: 1, 'Cold Wave': 1, Cloudburst: 1 },
  'West India': { Flood: 3, Cyclone: 3, Drought: 2, Heatwave: 2, Earthquake: 2, Landslide: 1, Wildfire: 1, 'Cold Wave': 0, Cloudburst: 1 },
  'Central India': { Flood: 3, Drought: 3, Heatwave: 3, Wildfire: 2, 'Cold Wave': 2, Earthquake: 1, Cyclone: 0, Landslide: 0, Cloudburst: 1 },
  'Northeast India': { Flood: 4, Landslide: 4, Earthquake: 4, Cloudburst: 2, 'Cold Wave': 2, Wildfire: 1, Drought: 1, Heatwave: 1, Cyclone: 0 },
};

const SEVERITIES = ['Low', 'Moderate', 'High', 'Critical'];
const DISASTER_STATUS = ['Resolved', 'Monitoring', 'Active'];

const SKILLS = ['Medical Aid', 'Search & Rescue', 'Logistics', 'Shelter Setup', 'Food Distribution', 'Counselling', 'Communications', 'Water & Sanitation', 'Drone Survey'];
const CAMPAIGNS = ['Flood Relief Fund', 'Rebuild Kerala', 'Cyclone Recovery Drive', 'Earthquake Response 2025', 'Drought Water Mission', 'Shelter For All', 'Medical Camp Drive', 'Winter Warmth Drive'];
const DONOR_TYPES = ['Individual', 'Corporate', 'NGO', 'Government', 'Diaspora'];
const DONATION_TYPES = ['Cash', 'Food', 'Medicine', 'Clothing', 'Shelter Material', 'Equipment'];
const SOS_CATEGORIES = ['Medical Emergency', 'Trapped', 'Missing Person', 'Food & Water', 'Evacuation', 'Power Failure', 'Stranded'];
const SERVICES = ['Police (100/112)', 'Fire (101)', 'Ambulance (102/108)', 'NDRF Control Room', 'State Disaster Cell', 'Electricity Helpline', 'Water Helpline', 'Tsunami Warning Cell'];
const EMERGENCY_TYPES = ['Flood Rescue', 'Fire', 'Medical', 'Building Collapse', 'Road Accident', 'Power Outage', 'Water Shortage', 'Missing Person'];
const SAFETY_CATEGORIES = ['Before / Preparedness', 'During Disaster', 'After Disaster', 'First Aid', 'Evacuation'];

function weightedPick(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function pickRegion() {
  const keys = Object.keys(REGIONS);
  return pick(keys);
}

function pickPlace(region) {
  const states = REGIONS[region];
  const state = pick(states);
  const i = int(0, GEO[state].length - 1);
  const [lat, lon] = GEO[state][i];
  return {
    state,
    district: DISTRICT_NAME[state][i],
    // jitter so points do not overlap perfectly
    lat: +(lat + (rnd() - 0.5) * 0.35).toFixed(4),
    lon: +(lon + (rnd() - 0.5) * 0.35).toFixed(4),
  };
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}
function isoDateTime(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Seasonal weight: floods/cyclones cluster in the monsoon, heatwaves in summer. */
function monthForType(type) {
  const table = {
    Flood: [6, 7, 7, 8, 8, 9, 5, 10],
    Cyclone: [5, 6, 10, 11, 11, 12],
    Landslide: [6, 7, 7, 8, 8, 9],
    Heatwave: [4, 5, 5, 6, 6],
    Drought: [2, 3, 4, 5, 12],
    Cold: [12, 1, 1, 2],
    Wildfire: [2, 3, 4, 5],
  };
  if (type === 'Cold Wave') return pick(table.Cold);
  if (type === 'Cloudburst') return pick(table.Flood);
  return pick(table[type] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
}

function dateFor(year, type) {
  const month = monthForType(type);
  const day = int(1, 28);
  const d = new Date(Date.UTC(year, month - 1, day, int(0, 23), int(0, 59)));
  return d;
}

const TODAY = new Date('2026-09-18T00:00:00Z');

function statusFor(date) {
  const ageDays = (TODAY - date) / 86400000;
  if (ageDays < 7) return chance(0.88) ? 'Active' : 'Monitoring';
  if (ageDays < 20) return chance(0.45) ? 'Active' : 'Monitoring';
  if (ageDays < 45) return chance(0.6) ? 'Monitoring' : 'Resolved';
  return 'Resolved';
}

function severityFor(type, affected) {
  if (type === 'Earthquake' || type === 'Cyclone') {
    if (affected > 90000) return 'Critical';
    if (affected > 40000) return 'High';
    if (affected > 12000) return 'Moderate';
    return pick(['Low', 'Moderate', 'High']);
  }
  if (affected > 120000) return 'Critical';
  if (affected > 55000) return 'High';
  if (affected > 15000) return 'Moderate';
  return 'Low';
}

const NAME_PREFIX = {
  Flood: ['Flash Flood', 'Riverine Flood', 'Urban Flood', 'Dam Overflow'],
  Earthquake: ['Seismic Event', 'Tremor', 'Earthquake'],
  Cyclone: ['Cyclonic Storm', 'Severe Cyclone', 'Depression Landfall'],
  Landslide: ['Hillside Landslide', 'Debris Flow', 'Slope Failure'],
  Drought: ['Drought Emergency', 'Water Scarcity'],
  Wildfire: ['Forest Fire', 'Wildfire Outbreak'],
  Heatwave: ['Severe Heatwave', 'Heat Wave'],
  'Cold Wave': ['Cold Wave', 'Frost Spell'],
  Cloudburst: ['Cloudburst', 'Extreme Rainfall Event'],
};

export function clearAll() {
  const tables = [
    'camp_occupancy', 'alerts', 'sos_requests', 'relief_camps', 'volunteers',
    'donations', 'helpline_calls', 'safety_tips', 'safety_resource_usage',
    'dataset_rows', 'datasets', 'disasters',
  ];
  transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  });
}

const AFFECTED_BASE = {
  Flood: 45000, Earthquake: 30000, Cyclone: 60000, Landslide: 8000, Drought: 70000,
  Wildfire: 6000, Heatwave: 55000, 'Cold Wave': 25000, Cloudburst: 9000,
};

function makeDisaster(region, place, type, occurred) {
  const base = AFFECTED_BASE[type] || 20000;
  const affected = Math.max(120, Math.round(base * (0.25 + rnd() * 1.9)));
  const severity = severityFor(type, affected);
  const status = statusFor(occurred);
  const casualtyRate = { Critical: 0.0016, High: 0.0005, Moderate: 0.00012, Low: 0.00003 }[severity];
  return {
    name: `${pick(NAME_PREFIX[type])} — ${place.district}`,
    type,
    severity,
    location: `${place.district}, ${place.state}`,
    region,
    lat: place.lat,
    lon: place.lon,
    occurred_on: iso(occurred),
    status,
    affected_population: affected,
    casualties: Math.round(affected * casualtyRate * (0.4 + rnd())),
    displaced: Math.round(affected * (0.08 + rnd() * 0.25)),
    damage_crore: +((affected / 1000) * (2 + rnd() * 22)).toFixed(2),
  };
}

export function seed({ years = [2024, 2025, 2026], counts = { perYear: 260 }, recentDays = 30, recentCount = 28 } = {}) {
  rnd = mulberry32(SEED);
  const disasters = [];
  for (const year of years) {
    const total = year === 2026 ? Math.round(counts.perYear * 0.68) : counts.perYear;
    for (let i = 0; i < total; i++) {
      const region = pickRegion();
      const place = pickPlace(region);
      const type = weightedPick(TYPE_WEIGHTS[region]);
      const occurred = dateFor(year, type);
      if (occurred > TODAY) continue;
      disasters.push(makeDisaster(region, place, type, occurred));
    }
  }

  /* Current-situation batch: recent events so the "Active" KPIs are meaningful. */
  for (let i = 0; i < recentCount; i++) {
    const region = pickRegion();
    const eligible = TYPES.filter((t) => (TYPE_WEIGHTS[region][t] || 0) > 0 && ['Cold Wave', 'Drought'].includes(t) === false);
    const type = pick(eligible.length ? eligible : TYPES);
    const place = pickPlace(region);
    const occurred = new Date(TODAY.getTime() - int(0, recentDays) * 86400000);
    occurred.setUTCHours(int(0, 23), int(0, 59));
    disasters.push(makeDisaster(region, place, type, occurred));
  }

  transaction(() => {
    const insD = db.prepare(`INSERT INTO disasters
      (name,type,severity,location,region,lat,lon,occurred_on,status,affected_population,casualties,displaced,damage_crore,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'seed')`);
    for (const d of disasters) {
      const info = insD.run(d.name, d.type, d.severity, d.location, d.region, d.lat, d.lon, d.occurred_on, d.status, d.affected_population, d.casualties, d.displaced, d.damage_crore);
      d.id = Number(info.lastInsertRowid);
    }

    /* ---------------- Alerts ---------------- */
    const insA = db.prepare(`INSERT INTO alerts (disaster_id,title,type,severity,location,region,status,channel,issued_at,resolved_at,source)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'seed')`);
    const channels = ['SMS Broadcast', 'Mobile App', 'Siren Network', 'Email', 'Radio', 'Social Media'];
    for (const d of disasters) {
      const nAlerts = d.severity === 'Critical' ? int(2, 4) : d.severity === 'High' ? int(1, 3) : chance(0.7) ? 1 : 0;
      for (let i = 0; i < nAlerts; i++) {
        const issued = new Date(`${d.occurred_on}T00:00:00Z`);
        issued.setUTCDate(issued.getUTCDate() - int(0, 3));
        issued.setUTCHours(int(0, 23), int(0, 59));
        const resolved = d.status === 'Resolved' || (d.status === 'Monitoring' && chance(0.4));
        const resolvedAt = resolved ? new Date(issued.getTime() + int(3, 260) * 3600 * 1000) : null;
        insA.run(
          d.id,
          `${pick(['Red', 'Orange', 'Yellow', 'Blue'])} alert: ${d.type} in ${d.location}`,
          d.type,
          d.severity,
          d.location,
          d.region,
          resolvedAt ? 'Resolved' : d.status === 'Active' ? 'Active' : pick(['Active', 'Acknowledged']),
          pick(channels),
          isoDateTime(issued),
          resolvedAt ? isoDateTime(resolvedAt) : null,
        );
      }
    }

    /* ---------------- SOS requests ---------------- */
    const insS = db.prepare(`INSERT INTO sos_requests
      (disaster_id,disaster_type,severity,location,region,lat,lon,priority,status,category,reported_at,responded_at,response_minutes,people_count,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'seed')`);
    const sosStatuses = ['Pending', 'Dispatched', 'In Progress', 'Resolved', 'Resolved', 'Cancelled'];
    for (const d of disasters) {
      const n = Math.max(0, Math.round(Math.log2(1 + d.affected_population / 9000) * (0.6 + rnd() * 1.6)));
      for (let i = 0; i < n; i++) {
        const reported = new Date(`${d.occurred_on}T00:00:00Z`);
        reported.setUTCDate(reported.getUTCDate() + int(0, 6));
        reported.setUTCHours(int(0, 23), int(0, 59));
        if (reported > TODAY) continue;
        const priority = chance(d.severity === 'Critical' ? 0.55 : 0.22) ? 'Critical' : 'Normal';
        const status = d.status === 'Resolved' ? pick(['Resolved', 'Resolved', 'Cancelled']) : pick(sosStatuses);
        const done = status === 'Resolved';
        const minutes = done ? +(int(4, priority === 'Critical' ? 130 : 260) + rnd()).toFixed(1) : null;
        insS.run(
          d.id, d.type, d.severity, d.location, d.region,
          +(d.lat + (rnd() - 0.5) * 0.2).toFixed(4), +(d.lon + (rnd() - 0.5) * 0.2).toFixed(4),
          priority, status, pick(SOS_CATEGORIES),
          isoDateTime(reported),
          minutes ? isoDateTime(new Date(reported.getTime() + minutes * 60000)) : null,
          minutes, int(1, 24),
        );
      }
    }

    /* ---------------- Relief camps ---------------- */
    const insC = db.prepare(`INSERT INTO relief_camps
      (name,disaster_id,disaster_type,location,region,lat,lon,capacity,occupancy,food_units,water_litres,medicine_kits,blankets,medical_staff,status,established_on,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'seed')`);
    const insO = db.prepare('INSERT INTO camp_occupancy (camp_id,recorded_on,occupancy,capacity) VALUES (?,?,?,?)');
    const bigOnes = disasters.filter((d) => d.affected_population > 30000);
    for (let i = 0; i < Math.min(bigOnes.length, 240); i++) {
      const d = bigOnes[i];
      const capacity = int(250, 2400);
      const rate = 0.25 + rnd() * 0.8;
      const occupancy = Math.min(capacity, Math.round(capacity * rate));
      const established = new Date(`${d.occurred_on}T00:00:00Z`);
      established.setUTCDate(established.getUTCDate() + int(0, 3));
      const days = int(14, 60);
      const status = occupancy >= capacity ? 'Full' : d.status === 'Resolved' && chance(0.4) ? 'Closed' : 'Operational';
      const info = insC.run(
        `${pick(['Community', 'Primary School', 'Stadium', 'Town Hall', 'Polytechnic', 'Temple Ground', 'Marriage Hall'])} Relief Camp ${i + 1}`,
        d.id, d.type, d.location, d.region,
        +(d.lat + (rnd() - 0.5) * 0.15).toFixed(4), +(d.lon + (rnd() - 0.5) * 0.15).toFixed(4),
        capacity, occupancy,
        int(200, 4000), int(1000, 22000), int(20, 600), int(50, 1800), int(1, 22),
        status, iso(established),
      );
      const campId = Number(info.lastInsertRowid);
      let occ = Math.round(occupancy * 0.15);
      for (let day = 0; day < days; day++) {
        const dt = new Date(established.getTime() + day * 86400000);
        if (dt > TODAY) break;
        const trend = day < days * 0.35 ? 1 + rnd() * 0.35 : 1 - rnd() * 0.08;
        occ = Math.max(0, Math.min(capacity, Math.round(occ * trend + (rnd() - 0.5) * capacity * 0.05)));
        insO.run(campId, iso(dt), occ, capacity);
      }
    }

    /* ---------------- Volunteers ---------------- */
    const insV = db.prepare(`INSERT INTO volunteers (name,skill,disaster_type,location,region,status,registered_on,deployments,hours_logged,source)
      VALUES (?,?,?,?,?,?,?,?,?,'seed')`);
    const first = ['Aarav', 'Diya', 'Vivaan', 'Ananya', 'Kabir', 'Isha', 'Rohan', 'Meera', 'Arjun', 'Nisha', 'Karan', 'Priya', 'Sameer', 'Ritu', 'Imran', 'Lakshmi', 'Joseph', 'Fatima', 'Tenzin', 'Rahul'];
    const last = ['Sharma', 'Nair', 'Patel', 'Reddy', 'Iyer', 'Khan', 'Das', 'Singh', 'Mehta', 'Bose', 'Chopra', 'Verma', 'Gupta', 'Rao', 'Pillai'];
    for (let i = 0; i < 1800; i++) {
      const region = pickRegion();
      const place = pickPlace(region);
      const reg = new Date(Date.UTC(2023, int(0, 11), int(1, 28)));
      reg.setUTCDate(reg.getUTCDate() + int(0, 1000));
      if (reg > TODAY) continue;
      insV.run(
        `${pick(first)} ${pick(last)}`,
        pick(SKILLS),
        pick(TYPES),
        `${place.district}, ${place.state}`,
        region,
        pick(['Available', 'Available', 'Assigned', 'Assigned', 'On Leave']),
        iso(reg),
        int(0, 18),
        int(0, 420),
      );
    }

    /* ---------------- Donations ---------------- */
    const insDn = db.prepare(`INSERT INTO donations (campaign,disaster_id,disaster_type,type,amount,quantity,donor_type,location,region,donated_on,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,'seed')`);
    for (let i = 0; i < 3200; i++) {
      const d = pick(disasters);
      const dt = new Date(`${d.occurred_on}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + int(-2, 45));
      if (dt > TODAY) continue;
      const type = pick(DONATION_TYPES);
      const amount = type === 'Cash'
        ? Math.round(int(500, 500000) * (chance(0.08) ? 12 : 1))
        : 0;
      insDn.run(
        pick(CAMPAIGNS), d.id, d.type, type, amount,
        amount ? 0 : int(10, 5000),
        pick(DONOR_TYPES), d.location, d.region, iso(dt),
      );
    }

    /* ---------------- Emergency helpline calls ----------------
       Intentionally sparse: the "Tsunami Warning Cell" service receives no calls in
       the demo dataset, and the Helpline page must therefore be able to render a
       genuine "No data available" state for that filter instead of fake numbers. */
    const insH = db.prepare(`INSERT INTO helpline_calls (service,emergency_type,location,region,called_at,response_minutes,status,outcome,source)
      VALUES (?,?,?,?,?,?,?,?,'seed')`);
    for (const d of disasters) {
      const n = Math.round(Math.log2(1 + d.affected_population / 25000) * (0.5 + rnd() * 2));
      for (let i = 0; i < n; i++) {
        const dt = new Date(`${d.occurred_on}T00:00:00Z`);
        dt.setUTCDate(dt.getUTCDate() + int(0, 5));
        dt.setUTCHours(int(0, 23), int(0, 59));
        if (dt > TODAY) continue;
        const service = pick(SERVICES.filter((s) => s !== 'Tsunami Warning Cell'));
        const answered = chance(0.82);
        insH.run(
          service,
          pick(EMERGENCY_TYPES),
          d.location,
          d.region,
          isoDateTime(dt),
          answered ? +(int(1, 45) + rnd()).toFixed(1) : null,
          answered ? pick(['Answered', 'Answered', 'Busy']) : 'Missed',
          answered ? pick(['Resolved on call', 'Team dispatched', 'Escalated to district']) : null,
        );
      }
    }

    /* ---------------- Safety tips + usage ---------------- */
    const insT = db.prepare('INSERT INTO safety_tips (title,disaster_type,category,audience,content,published_on) VALUES (?,?,?,?,?,?)');
    const tipIds = [];
    const audiences = ['General Public', 'Schools', 'Coastal Communities', 'Farmers', 'Urban Residents', 'Field Responders'];
    for (const type of TYPES) {
      for (const cat of SAFETY_CATEGORIES) {
        const published = new Date(Date.UTC(2023, int(0, 11), int(1, 28)));
        published.setUTCDate(published.getUTCDate() + int(0, 900));
        if (published > TODAY) continue;
        const info = insT.run(
          `${cat.split(' ')[0]} guidance for ${type.toLowerCase()}`,
          type,
          cat,
          pick(audiences),
          `Practical checklist for ${cat} during a ${type.toLowerCase()} event in the Indian context.`,
          iso(published),
        );
        tipIds.push({ id: Number(info.lastInsertRowid), type, cat, published });
      }
    }
    const insU = db.prepare('INSERT INTO safety_resource_usage (tip_id,disaster_type,category,resource_type,viewed_at) VALUES (?,?,?,?,?)');
    const resourceTypes = ['Tip', 'Checklist', 'Video', 'Field Guide', 'Poster'];
    for (const t of tipIds) {
      const views = t.cat.startsWith('Before') ? int(30, 160) : t.cat === 'During Disaster' ? int(40, 220) : int(10, 120);
      for (let i = 0; i < views; i++) {
        const dt = new Date(t.published.getTime() + int(1, 900) * 86400000);
        if (dt > TODAY) continue;
        insU.run(t.id, t.type, t.cat, pick(resourceTypes), isoDateTime(dt));
      }
    }
  });

  return {
    disasters: disasters.length,
    ...Object.fromEntries(
      ['alerts', 'sos_requests', 'relief_camps', 'camp_occupancy', 'volunteers', 'donations', 'helpline_calls', 'safety_tips', 'safety_resource_usage']
        .map((t) => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]),
    ),
  };
}

/** Seeds the database when it is empty (first run of the server). */
export function ensureSeeded() {
  const c = db.prepare('SELECT COUNT(*) AS c FROM disasters').get().c;
  if (c > 0) return null;
  return seed();
}

/* Run directly: `npm run seed` (rebuilds the demo dataset from scratch). */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  clearAll();
  console.log('Demo dataset rebuilt:', JSON.stringify(seed(), null, 2));
}
