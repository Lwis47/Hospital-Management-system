'use strict';
const { db, save, uid, nextNum } = require('./db');
const { hashPassword } = require('./auth');
const { today, addDays, nowISO } = require('./util');

function seed() {
  if (db.users.length > 0) return;
  const t = today();

  const mkUser = (username, password, name, role, extra = {}) => {
    const u = { id: uid('usr'), username, passwordHash: hashPassword(password), name, role, phone: extra.phone || '', active: true, createdAt: nowISO(), ...extra };
    db.users.push(u);
    return u;
  };

  const admin = mkUser('admin', 'Admin@123', 'System Administrator', 'admin');
  const drAdams = mkUser('dr.adams', 'Doctor@123', 'Dr. Sarah Adams', 'doctor', { department: 'Internal Medicine', specialization: 'Cardiologist', consultationFee: 50 });
  const drOkafor = mkUser('dr.okafor', 'Doctor@123', 'Dr. James Okafor', 'doctor', { department: 'Surgery', specialization: 'General Surgeon', consultationFee: 60 });
  const drNair = mkUser('dr.nair', 'Doctor@123', 'Dr. Priya Nair', 'doctor', { department: 'Pediatrics', specialization: 'Pediatrician', consultationFee: 45 });
  mkUser('reception', 'Recept@123', 'Grace Moyo', 'receptionist');
  mkUser('nurse', 'Nurse@123', 'Daniel Reyes', 'nurse');
  mkUser('pharma', 'Pharma@123', 'Linda Chen', 'pharmacist');
  mkUser('lab', 'Lab@123', 'Samuel Otieno', 'labtech');
  mkUser('accounts', 'Accounts@123', 'Fatima Bello', 'accountant');

  for (const name of ['Internal Medicine', 'Surgery', 'Pediatrics', 'Obstetrics & Gynecology', 'Emergency', 'Orthopedics', 'ENT', 'Dermatology']) {
    db.departments.push({ id: uid('dep'), name });
  }

  const mkPatient = (firstName, lastName, dob, gender, phone, bloodGroup, allergies, insurance) => {
    const p = {
      id: uid('pat'), mrn: nextNum('mrn', 'MRN-'),
      firstName, lastName, dob, gender, phone,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      address: '12 Unity Road, Springfield', bloodGroup,
      allergies: allergies || [], insurance: insurance || null,
      emergencyContact: { name: 'Relative of ' + firstName, phone },
      createdAt: nowISO()
    };
    db.patients.push(p);
    return p;
  };

  const p1 = mkPatient('John', 'Banda', '1985-03-14', 'Male', '0771000001', 'O+', ['Penicillin'], { provider: 'National Health Insurance', policyNo: 'NH-100234' });
  const p2 = mkPatient('Mary', 'Zulu', '1990-07-22', 'Female', '0771000002', 'A+', [], { provider: 'MediCover', policyNo: 'MC-55871' });
  const p3 = mkPatient('Peter', 'Mwansa', '1978-11-02', 'Male', '0771000003', 'B+', ['Sulfa drugs'], null);
  const p4 = mkPatient('Aisha', 'Kamau', '2015-05-30', 'Female', '0771000004', 'O-', [], null);
  const p5 = mkPatient('David', 'Okello', '1962-01-19', 'Male', '0771000005', 'AB+', [], { provider: 'National Health Insurance', policyNo: 'NH-778812' });
  const p6 = mkPatient('Lucy', 'Tembo', '1995-09-08', 'Female', '0771000006', 'A-', ['Latex'], null);
  mkPatient('Brian', 'Phiri', '1988-12-25', 'Male', '0771000007', 'B-', [], null);
  mkPatient('Esther', 'Nkomo', '1970-04-11', 'Female', '0771000008', 'O+', ['Aspirin'], { provider: 'Seniors Care', policyNo: 'SC-3321' });

  const mkTest = (name, category, price, sampleType) => {
    const x = { id: uid('lt'), name, category, price, sampleType };
    db.labTests.push(x);
    return x;
  };
  const cbc = mkTest('Complete Blood Count (CBC)', 'Hematology', 15, 'Blood');
  mkTest('Malaria Smear', 'Parasitology', 8, 'Blood');
  const glucose = mkTest('Blood Glucose (Fasting)', 'Biochemistry', 6, 'Blood');
  mkTest('Urinalysis', 'Microbiology', 7, 'Urine');
  mkTest('Lipid Profile', 'Biochemistry', 22, 'Blood');
  mkTest('Liver Function Tests', 'Biochemistry', 25, 'Blood');
  mkTest('Renal Function Tests', 'Biochemistry', 24, 'Blood');
  mkTest('HIV Screening', 'Serology', 10, 'Blood');
  mkTest('X-Ray Chest', 'Radiology', 30, 'N/A');
  mkTest('Pregnancy Test (hCG)', 'Serology', 8, 'Urine');

  const mkDrug = (name, genericName, category, unit, stock, reorderLevel, price, batchNo, expiryDate) => {
    const d = { id: uid('drg'), name, genericName, category, unit, stock, reorderLevel, price, batchNo, expiryDate };
    db.drugs.push(d);
    return d;
  };
  const pcm = mkDrug('Paracetamol 500mg', 'Acetaminophen', 'Analgesic', 'Tablet', 1200, 200, 0.5, 'B-2291', addDays(t, 540));
  mkDrug('Amoxicillin 500mg', 'Amoxicillin', 'Antibiotic', 'Capsule', 800, 150, 1.2, 'B-1187', addDays(t, 400));
  mkDrug('Ibuprofen 400mg', 'Ibuprofen', 'NSAID', 'Tablet', 650, 150, 0.8, 'B-3320', addDays(t, 365));
  mkDrug('Metformin 500mg', 'Metformin HCl', 'Antidiabetic', 'Tablet', 90, 100, 0.9, 'B-4410', addDays(t, 500));
  mkDrug('Amlodipine 5mg', 'Amlodipine', 'Antihypertensive', 'Tablet', 400, 100, 1.1, 'B-4411', addDays(t, 480));
  mkDrug('ORS Sachet', 'Oral Rehydration Salts', 'Electrolyte', 'Sachet', 300, 50, 1.0, 'B-5501', addDays(t, 700));
  mkDrug('Artemether/Lumefantrine 20/120mg', 'Co-artem', 'Antimalarial', 'Tablet', 240, 60, 2.5, 'B-5502', addDays(t, 25));
  mkDrug('Ceftriaxone 1g Injection', 'Ceftriaxone', 'Antibiotic', 'Vial', 150, 40, 4.0, 'B-6601', addDays(t, 300));
  mkDrug('Omeprazole 20mg', 'Omeprazole', 'Antacid', 'Capsule', 500, 100, 1.0, 'B-6602', addDays(t, 420));
  mkDrug('Cetirizine 10mg', 'Cetirizine', 'Antihistamine', 'Tablet', 350, 80, 0.6, 'B-7701', addDays(t, 380));
  mkDrug('Insulin Soluble 100IU/ml', 'Human Insulin', 'Antidiabetic', 'Vial', 45, 20, 12.0, 'B-7702', addDays(t, 200));
  mkDrug('Salbutamol Inhaler', 'Salbutamol', 'Bronchodilator', 'Inhaler', 60, 15, 6.5, 'B-8801', addDays(t, 450));

  const mkWard = (name, type, dailyRate, bedCount) => {
    const w = { id: uid('wrd'), name, type, dailyRate };
    db.wards.push(w);
    const prefix = name.split(/\s+/).map(word => word[0]).join('').toUpperCase();
    for (let i = 1; i <= bedCount; i++) {
      db.beds.push({ id: uid('bed'), wardId: w.id, label: `${prefix}-${String(i).padStart(2, '0')}`, status: 'available', patientId: null });
    }
    return w;
  };
  const genM = mkWard('General Male', 'General', 20, 6);
  mkWard('General Female', 'General', 20, 6);
  mkWard('Private', 'Private', 60, 4);
  mkWard('ICU', 'Intensive Care', 120, 3);
  mkWard('Maternity', 'Maternity', 30, 4);
  mkWard('Pediatric', 'Pediatric', 25, 4);

  for (const [name, category, price] of [
    ['General Consultation', 'Consultation', 30],
    ['Specialist Consultation', 'Consultation', 60],
    ['Wound Dressing', 'Procedure', 12],
    ['Injection Administration', 'Procedure', 5],
    ['Nebulization', 'Procedure', 10],
    ['ECG', 'Diagnostic', 25],
    ['Normal Delivery', 'Obstetric', 250],
    ['Minor Surgery', 'Surgical', 400],
    ['Physiotherapy Session', 'Therapy', 20]
  ]) db.services.push({ id: uid('svc'), name, category, price });

  const mkAppt = (patient, doctor, date, time, reason, status) => {
    const a = { id: uid('apt'), patientId: patient.id, doctorId: doctor.id, date, time, reason, status, createdAt: nowISO() };
    db.appointments.push(a);
    return a;
  };
  const a1 = mkAppt(p1, drAdams, t, '09:00', 'Chest pain and shortness of breath', 'in-consultation');
  mkAppt(p2, drNair, t, '09:30', 'Child fever follow-up (guardian present)', 'scheduled');
  mkAppt(p3, drAdams, t, '10:00', 'Hypertension review', 'checked-in');
  mkAppt(p5, drOkafor, t, '11:00', 'Post-operative wound check', 'scheduled');
  mkAppt(p6, drNair, addDays(t, 1), '10:30', 'Routine check-up', 'scheduled');
  mkAppt(p4, drNair, addDays(t, 1), '09:00', 'Vaccination', 'scheduled');

  const bed = db.beds.find(b => b.wardId === genM.id);
  bed.status = 'occupied';
  bed.patientId = p5.id;
  db.admissions.push({
    id: uid('adm'), patientId: p5.id, bedId: bed.id, doctorId: drOkafor.id,
    admitDate: addDays(t, -2), dischargeDate: null,
    diagnosis: 'Post-appendectomy observation', status: 'admitted', notes: 'Stable. Monitor wound site.', createdAt: nowISO()
  });

  const enc = {
    id: uid('enc'), patientId: p1.id, doctorId: drAdams.id, appointmentId: a1.id,
    type: 'outpatient', date: t,
    vitals: { bp: '145/92', pulse: 88, temp: 36.8, weight: 78, height: 175, spo2: 97 },
    complaints: 'Chest pain on exertion for 3 days', diagnosis: '', notes: '',
    prescriptions: [], labOrderIds: [], status: 'open', followUpDate: null, createdAt: nowISO()
  };
  db.encounters.push(enc);
  const lo = {
    id: uid('lab'), encounterId: enc.id, patientId: p1.id, testId: cbc.id,
    status: 'ordered', result: '', resultDate: null, notes: 'Rule out anemia',
    orderedBy: drAdams.id, technicianId: null, createdAt: nowISO()
  };
  db.labOrders.push(lo);
  enc.labOrderIds.push(lo.id);

  const inv = {
    id: uid('inv'), number: nextNum('invoice', 'INV-'), patientId: p5.id,
    items: [
      { desc: 'Minor Surgery (appendectomy)', qty: 1, price: 400, total: 400 },
      { desc: `Bed charge — ${genM.name} (2 days)`, qty: 2, price: 20, total: 40 }
    ],
    total: 440, paid: 200, balance: 240, status: 'partial',
    payments: [{ amount: 200, method: 'Mobile Money', date: nowISO(), by: 'Fatima Bello' }],
    createdAt: nowISO()
  };
  db.invoices.push(inv);

  db.audit.unshift({ id: uid('aud'), userId: admin.id, userName: 'System Administrator', action: 'seed', entity: 'system', entityId: null, detail: 'Demo data initialized', date: nowISO() });
  save();
  console.log('Database seeded with demo data.');
}

module.exports = { seed };