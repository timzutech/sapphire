/* Demo/sample data for development. Creates a clearly-labelled demo office (offices.is_demo = true).
 * Usage: npm run db:seed   (idempotent: re-running replaces the demo office) */
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL is not set');
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';
const sql = postgres(url, { max: 1, onnotice: () => {}, types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } } });

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = (d: string) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };

async function main() {
  const [{ today }] = await sql`select (now() at time zone 'Africa/Lagos')::date::text as today`;
  await sql.begin(async (tx) => {
    const old = await tx`select id from offices where slug = 'demo-office'`;
    if (old.length) {
      const oid = old[0].id;
      // remove dependent rows that block cascade (users are kept and reused)
      await tx`delete from office_transactions where office_id = ${oid}`;
      await tx`delete from fine_payments where office_id = ${oid}`;
      await tx`delete from offices where id = ${oid}`;
    }
    const [office] = await tx`insert into offices (name, slug, timezone, currency, locale, is_demo) values ('Lagos Growth Office (Demo)', 'demo-office', 'Africa/Lagos', 'NGN', 'en-NG', true) returning id`;
    const O = office.id as string;
    const { bootstrapOfficeRaw } = await import('./seed-helpers');
    await bootstrapOfficeRaw(tx, O);

    const people = [
      ['admin@demo.officehub.test', 'Tolu Bankole', 'admin', 'Office Manager'],
      ['ada@demo.officehub.test', 'Ada Okafor', 'member', 'Sales Associate'],
      ['emeka@demo.officehub.test', 'Emeka Nwosu', 'member', 'Sales Associate'],
      ['fatima@demo.officehub.test', 'Fatima Bello', 'member', 'Team Lead'],
      ['kunle@demo.officehub.test', 'Kunle Adeyemi', 'member', 'Sales Associate'],
      ['ngozi@demo.officehub.test', 'Ngozi Eze', 'member', 'Sales Associate'],
      ['ibrahim@demo.officehub.test', 'Ibrahim Musa', 'member', 'Trainee'],
      ['chioma@demo.officehub.test', 'Chioma Obi', 'member', 'Trainee'],
    ] as const;
    const ids: string[] = [];
    for (const [email, name] of people) {
      const [u] = await tx`insert into users (email, full_name, password_hash, phone) values (${email}, ${name}, app.hash_password(${PASSWORD}), ${`080${int(10000000, 99999999)}`})
        on conflict ((lower(email))) do update set full_name = excluded.full_name, password_hash = excluded.password_hash, must_change_password = false returning id`;
      ids.push(u.id);
    }
    await tx`update users set is_super_admin = true where id = ${ids[0]}`;
    const admin = ids[0]!;
    const members = ids.slice(1);
    // act as the office administrator so database guard triggers apply admin rules
    await tx`select set_config('app.user_id', ${admin}, true), set_config('app.office_id', ${O}, true)`;
    const [teamA] = await tx`insert into teams (office_id, name, description) values (${O}, 'Eagles', 'Field sales') returning id`;
    const [teamB] = await tx`insert into teams (office_id, name, description) values (${O}, 'Falcons', 'Referral sales') returning id`;
    const joined = addDays(today, -75);
    for (let i = 0; i < ids.length; i++) {
      await tx`insert into memberships (office_id, user_id, role, team_id, title, joined_on) values
        (${O}, ${ids[i]!}, ${people[i]![2]}, ${i === 0 ? null : i % 2 ? teamA.id : teamB.id}, ${people[i]![3]}, ${i === 7 ? addDays(today, -20) : joined})`;
      await tx`insert into personal_accounts (office_id, user_id, name, kind, opening_balance, opening_date) values
        (${O}, ${ids[i]!}, 'Cash', 'cash', ${int(5, 40) * 1000}, ${joined}), (${O}, ${ids[i]!}, 'Savings', 'savings', ${int(0, 20) * 5000}, ${joined})`;
    }
    const levels = await tx`insert into levels (office_id, name, rank, criteria) values (${O}, 'Level 2', 2, '₦500k personal sales in a quarter'), (${O}, 'Team Leader', 3, 'Leads a team of 3+ active members') returning id, rank`;
    const lvl = await tx`select id, rank from levels where office_id = ${O} order by rank`;
    for (const [i, m] of members.entries()) {
      await tx`insert into member_levels (office_id, user_id, level_id, achieved_on, set_by, note) values (${O}, ${m}, ${lvl[0]!.id}, ${joined}, ${admin}, 'Initial level')`;
      if (i < 4) await tx`insert into member_levels (office_id, user_id, level_id, achieved_on, set_by) values (${O}, ${m}, ${lvl[1]!.id}, ${addDays(today, -40)}, ${admin})`;
      if (i === 2) await tx`insert into member_levels (office_id, user_id, level_id, achieved_on, set_by) values (${O}, ${m}, ${levels[1]!.id}, ${addDays(today, -10)}, ${admin})`;
    }

    // attendance for the last 60 days (working days), ending yesterday + some today
    for (let d = addDays(today, -60); d <= today; d = addDays(d, 1)) {
      if (dow(d) > 5) continue;
      for (const [i, m] of ids.entries()) {
        if (d === today && rnd() < 0.5) continue;
        if (i === 7 && d < addDays(today, -20)) continue;
        const reliability = [0.97, 0.95, 0.85, 0.97, 0.8, 0.9, 0.75, 0.88][i]!;
        const r = rnd();
        const status = r < reliability * 0.8 ? 'present' : r < reliability ? 'late' : r < reliability + 0.03 ? 'excused' : 'absent';
        const hh = status === 'present' ? int(7, 8) : int(9, 10);
        await tx`insert into attendance_records (office_id, user_id, att_date, status, source, check_in_at)
          values (${O}, ${m}, ${d}, ${status}, ${status === 'absent' || status === 'excused' ? 'admin' : 'self'},
          ${status === 'present' || status === 'late' ? tx`(${`${d} ${String(hh).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`}::timestamp at time zone 'Africa/Lagos')` : null})`;
      }
    }

    // prospects
    const first = ['Bola', 'Chinedu', 'Damilola', 'Efe', 'Funmi', 'Gbenga', 'Halima', 'Ifeanyi', 'Jumoke', 'Kemi', 'Lanre', 'Musa', 'Nkechi', 'Oluwaseun', 'Peter', 'Rukayat', 'Segun', 'Tobi', 'Uche', 'Yemi'];
    const last = ['Adebayo', 'Okeke', 'Ibrahim', 'Johnson', 'Olawale', 'Eze', 'Usman', 'Afolabi', 'Nnamdi', 'Ogunleye'];
    const sources = ['Referral', 'Market visit', 'Instagram', 'Church event', 'Cold call', 'Walk-in'];
    const stages = ['new', 'contacted', 'follow_up', 'interested', 'in_progress', 'converted', 'not_interested'];
    let pc = 0;
    for (const m of [...members, null, null]) {
      const n = m ? int(6, 14) : 6;
      for (let k = 0; k < n; k++) {
        pc++;
        const created = addDays(today, -int(0, 70));
        const stage = pick(stages);
        await tx`insert into prospects (office_id, owner_id, visibility, name, phone, source, stage, estimated_value, last_contact_on, next_follow_up, next_action, notes, created_by, created_at, converted_at)
          values (${O}, ${m}, ${m ? 'private' : 'office'}, ${`${pick(first)} ${pick(last)}`}, ${`070${String(10000000 + pc * 7919).slice(0, 8)}`}, ${pick(sources)}, ${stage},
            ${int(2, 40) * 10000}, ${stage === 'new' ? null : addDays(created, int(1, 5))},
            ${['converted', 'not_interested'].includes(stage) ? null : addDays(today, int(-4, 10))},
            ${stage === 'converted' ? null : pick(['Call back', 'Send price list', 'Book a demo', 'Visit shop'])}, null,
            ${m ?? admin}, ${`${created} 10:00+01`}, ${stage === 'converted' ? tx`${`${addDays(created, int(3, 12) > 70 ? 0 : int(3, 12))} 15:00+01`}::timestamptz` : null})`;
      }
    }
    await tx`update prospects set converted_at = least(converted_at, now()) where office_id = ${O} and converted_at is not null`;

    // tasks
    const titles = ['Follow up with 10 warm leads', 'Prepare weekly sales report', 'Attend product training', 'Update prospect list', 'Organise market outreach', 'Share testimonial video', 'Complete onboarding checklist', 'Call dormant clients'];
    for (const m of members) {
      for (let k = 0; k < int(3, 6); k++) {
        const due = addDays(today, int(-20, 14));
        const status = due < today ? pick(['completed', 'completed', 'completed', 'pending', 'in_progress']) : pick(['pending', 'in_progress', 'completed']);
        await tx`select set_config('app.fake_now', ${`${addDays(due, -int(0, 3))}T14:00:00+01:00`}, true)`;
        await tx`insert into tasks (office_id, title, description, assignee_id, created_by, kind, start_date, due_date, priority, status, progress, created_at)
          values (${O}, ${pick(titles)}, 'Assigned during the weekly planning meeting.', ${m}, ${admin}, 'assigned', ${addDays(due, -7)}, ${due}, ${pick(['low', 'medium', 'high', 'urgent'])}, ${status},
          ${status === 'in_progress' ? int(20, 80) : 0}, ${`${addDays(due, -7)} 09:00+01`})`;
      }
      await tx`insert into tasks (office_id, title, assignee_id, created_by, kind, due_date, priority) values (${O}, 'Read “The Psychology of Selling” ch. 3', ${m}, ${m}, 'personal', ${addDays(today, 5)}, 'low')`;
    }
    await tx`select set_config('app.fake_now', '', true)`;

    // personal finances
    const pcat = await tx`select id, kind, name from finance_categories where office_id = ${O} and scope = 'personal'`;
    for (const m of ids) {
      const [cash] = await tx`select id from personal_accounts where user_id = ${m} and office_id = ${O} and name = 'Cash'`;
      const [sav] = await tx`select id from personal_accounts where user_id = ${m} and office_id = ${O} and name = 'Savings'`;
      for (let k = 0; k < 18; k++) {
        const d = addDays(today, -int(0, 85));
        const isIncome = rnd() < 0.45;
        const cat = pick(pcat.filter((c) => c.kind === (isIncome ? 'income' : 'expense')));
        const status = isIncome ? pick(['approved', 'approved', 'recorded', 'pending']) : 'recorded';
        await tx`insert into personal_transactions (office_id, user_id, account_id, type, amount, category_id, txn_date, description, status, reviewed_by, reviewed_at, client_token)
          values (${O}, ${m}, ${cash.id}, ${isIncome ? 'income' : 'expense'}, ${isIncome ? int(10, 120) * 1000 : int(1, 25) * 1000}, ${cat.id}, ${d}, ${cat.name},
          ${status}, ${status === 'approved' ? admin : null}, ${status === 'approved' ? tx`now()` : null}, gen_random_uuid())`;
      }
      await tx`insert into personal_transactions (office_id, user_id, account_id, to_account_id, type, amount, txn_date, description, client_token)
        values (${O}, ${m}, ${cash.id}, ${sav.id}, 'transfer', ${int(5, 30) * 1000}, ${addDays(today, -int(1, 30))}, 'Monthly savings', gen_random_uuid())`;
    }

    // office books
    const [cashAcct] = await tx`select id from office_accounts where office_id = ${O} and kind = 'cash'`;
    const [bank] = await tx`select id from office_accounts where office_id = ${O} and kind = 'bank'`;
    await tx`update office_accounts set opening_balance = 250000, opening_date = ${addDays(today, -90)} where id = ${bank.id}`;
    await tx`update office_accounts set opening_balance = 20000, opening_date = ${addDays(today, -90)} where id = ${cashAcct.id}`;
    const ocat = await tx`select id, kind, name, system_key from finance_categories where office_id = ${O} and scope = 'office'`;
    for (let k = 0; k < 26; k++) {
      const isIncome = rnd() < 0.45;
      const cat = pick(ocat.filter((c) => c.kind === (isIncome ? 'income' : 'expense') && !c.system_key));
      await tx`insert into office_transactions (office_id, account_id, type, amount, category_id, txn_date, description, counterparty, recorded_by)
        values (${O}, ${rnd() < 0.7 ? bank.id : cashAcct.id}, ${isIncome ? 'income' : 'expense'}, ${isIncome ? int(20, 150) * 1000 : int(5, 60) * 1000}, ${cat.id},
        ${addDays(today, -int(0, 88))}, ${cat.name}, ${isIncome ? 'Members' : pick(['Ikeja Stationers', 'PHCN', 'Uber', 'Venue partner'])}, ${admin})`;
    }
    for (const c of ocat.filter((x) => x.kind === 'expense').slice(0, 4)) {
      for (const mo of [0, -1, -2]) {
        const month = `${addDays(`${today.slice(0, 7)}-15`, mo * 30).slice(0, 7)}-01`;
        await tx`insert into budgets (office_id, category_id, month, amount) values (${O}, ${c.id}, ${month}, ${int(4, 12) * 10000}) on conflict do nothing`;
      }
    }
    await tx`insert into office_obligations (office_id, kind, counterparty, description, amount, due_date, created_by) values
      (${O}, 'payable', 'Venue partner', 'Hall booking for quarterly summit', 85000, ${addDays(today, 12)}, ${admin}),
      (${O}, 'receivable', 'Partner company', 'Sponsorship for training day', 120000, ${addDays(today, 20)}, ${admin})`;

    // expenses
    const ecat = ocat.filter((c) => c.kind === 'expense');
    for (const [i, st] of ['pending', 'pending', 'approved', 'paid', 'rejected', 'draft'].entries()) {
      const [e] = await tx`insert into expenses (office_id, title, category_id, amount, expense_date, payment_method, responsible_user_id, vendor, description, status, submitted_by, submitted_at, paid_account_id)
        values (${O}, ${['Printer toner', 'Training snacks', 'Flyers for outreach', 'Internet subscription', 'Taxi to client', 'Whiteboard markers'][i]!}, ${pick(ecat).id},
        ${int(3, 45) * 1000}, ${addDays(today, -int(1, 20))}, 'Transfer', ${members[i % members.length]!}, ${pick(['Jumia', 'Ikeja Stationers', 'MTN', 'Bolt'])},
        'Submitted with receipt', ${st}, ${i < 3 ? members[i]! : admin}, now(), ${st === 'paid' ? bank.id : null}) returning id, amount, category_id, title, expense_date`;
      if (st === 'paid') {
        await tx`insert into office_transactions (office_id, account_id, type, amount, category_id, txn_date, description, expense_id, recorded_by)
          values (${O}, ${bank.id}, 'expense', ${e.amount}, ${e.category_id}, ${e.expense_date}, ${`Expense: ${e.title}`}, ${e.id}, ${admin})`;
      }
    }

    // fines
    const fcat = await tx`select id, name, default_amount from fine_categories where office_id = ${O}`;
    const fineCash = ocat.find((c) => c.system_key === 'fine_collections')!;
    for (const [i, m] of members.slice(0, 5).entries()) {
      const c = fcat[i % fcat.length]!;
      const [f] = await tx`insert into fines (office_id, user_id, category_id, reason, amount, issued_on, due_date, issued_by)
        values (${O}, ${m}, ${c.id}, ${`${c.name} on ${addDays(today, -int(5, 30))}`}, ${c.default_amount}, ${addDays(today, -int(3, 25))}, ${addDays(today, int(-3, 10))}, ${admin}) returning id, amount`;
      if (i % 2 === 0) {
        const amt = i === 0 ? f.amount : Number(f.amount) / 2;
        const [p] = await tx`insert into fine_payments (office_id, fine_id, user_id, amount, paid_on, method, status, submitted_by)
          values (${O}, ${f.id}, ${m}, ${amt}, ${addDays(today, -2)}, 'Cash', 'confirmed', ${admin}) returning id`;
        await tx`insert into office_transactions (office_id, account_id, type, amount, category_id, txn_date, description, counterparty, fine_payment_id, recorded_by)
          values (${O}, ${cashAcct.id}, 'income', ${amt}, ${fineCash.id}, ${addDays(today, -2)}, 'Fine payment', 'Member', ${p.id}, ${admin})`;
      }
      if (i === 3) await tx`insert into fine_disputes (office_id, fine_id, raised_by, reason) values (${O}, ${f.id}, ${m}, 'I was at a client meeting approved by my team lead.')`;
    }

    // plan, goals, challenge, announcements
    const month = `${today.slice(0, 7)}-01`;
    const [plan] = await tx`insert into office_plans (office_id, month, title, summary, status, published_at, created_by)
      values (${O}, ${month}, 'Momentum month', 'Focus on converting warm prospects and completing product training.', 'published', now(), ${admin}) returning id`;
    const acts: [string, string, number, boolean][] = [
      ['training', 'Product masterclass', 3, true], ['meeting', 'Monthly office meeting', 1, false], ['prospecting', 'Ikeja market outreach', 8, true],
      ['workshop', 'Objection handling workshop', 12, true], ['incentive', 'Top converter dinner', 25, false], ['deadline', 'Quarter targets due', 27, false],
    ];
    for (const [kind, title, day, reg] of acts) {
      const [a] = await tx`insert into plan_activities (office_id, plan_id, kind, title, description, starts_at, ends_at, location, requires_registration, capacity)
        values (${O}, ${plan.id}, ${kind}, ${title}, 'See the office notice board for details.', ${`${month.slice(0, 8)}${String(day).padStart(2, '0')} 10:00`}::timestamp at time zone 'Africa/Lagos',
        ${`${month.slice(0, 8)}${String(day).padStart(2, '0')} 13:00`}::timestamp at time zone 'Africa/Lagos', 'Main office', ${reg}, ${reg ? 20 : null}) returning id, starts_at`;
      if (reg) for (const m of members.slice(0, 5)) {
        const past = new Date(a.starts_at) < new Date();
        await tx`insert into activity_registrations (office_id, activity_id, user_id, status) values (${O}, ${a.id}, ${m}, ${past ? pick(['attended', 'attended', 'absent']) : 'registered'})`;
      }
    }
    const q = month;
    await tx`insert into goals (office_id, scope, title, description, category, unit, target_value, current_value, start_date, end_date, progress_mode, metric, created_by, responsible_user_id) values
      (${O}, 'office', 'Office income this month', 'Total office income recorded in the books.', 'earnings', 'NGN', 1500000, 0, ${q}, ${addDays(addDays(q, 32).slice(0, 8) + '01', -1)}, 'auto', 'office_income', ${admin}, ${admin}),
      (${O}, 'office', 'Convert 15 prospects', 'Prospects moved to Converted this month.', 'conversion', 'prospects', 15, 0, ${q}, ${addDays(addDays(q, 32).slice(0, 8) + '01', -1)}, 'auto', 'prospects_converted', ${admin}, ${admin}),
      (${O}, 'office', 'Adopt the new CRM', 'Every member logs prospects in OfficeHub.', 'tools', 'members', 7, 5, ${q}, ${addDays(addDays(q, 32).slice(0, 8) + '01', -1)}, 'manual', null, ${admin}, ${admin})`;
    await tx`insert into goals (office_id, scope, title, category, unit, target_value, start_date, end_date, progress_mode, metric, metric_param, created_by)
      values (${O}, 'office', '4 members at Level 2 or above', 'progression', 'members', 4, ${addDays(today, -60)}, ${addDays(today, 30)}, 'auto', 'members_at_level', ${lvl[1]!.id}, ${admin})`;
    for (const m of members.slice(0, 4)) {
      await tx`insert into goals (office_id, scope, user_id, title, category, unit, target_value, start_date, end_date, progress_mode, metric, created_by, responsible_user_id) values
        (${O}, 'individual', ${m}, 'Add 10 prospects this month', 'prospecting', 'prospects', 10, ${q}, ${addDays(addDays(q, 32).slice(0, 8) + '01', -1)}, 'auto', 'prospects_added', ${admin}, ${m}),
        (${O}, 'individual', ${m}, 'Attend 18 days this month', 'attendance', 'days', 18, ${q}, ${addDays(addDays(q, 32).slice(0, 8) + '01', -1)}, 'auto', 'attendance_days', ${admin}, ${m})`;
    }
    const [chal] = await tx`insert into challenges (office_id, name, description, start_date, end_date, participation, metric, unit, target_value, requires_verification, reward, status, created_by)
      values (${O}, 'October conversion sprint', 'Convert as many prospects as possible. Ties go to whoever got there first.', ${q}, ${addDays(addDays(q, 32).slice(0, 8) + '01', -1)},
      'individual', 'prospects_converted', 'conversions', 5, true, '₦20,000 bonus for the top 2', 'published', ${admin}) returning id`;
    const [chal2] = await tx`insert into challenges (office_id, name, description, start_date, end_date, participation, metric, unit, target_value, requires_verification, reward, status, created_by)
      values (${O}, 'Weekly sales log', 'Log each verified sale (value in ₦ thousands).', ${addDays(today, -14)}, ${addDays(today, 14)}, 'individual', 'manual', 'sales', 100, true, 'Recognition at the office meeting', 'published', ${admin}) returning id`;
    for (const m of members.slice(0, 6)) {
      await tx`insert into challenge_participants (office_id, challenge_id, user_id, team_id) select ${O}, ${chal.id}, ${m}, team_id from memberships where user_id = ${m} and office_id = ${O}`;
      await tx`insert into challenge_participants (office_id, challenge_id, user_id, team_id) select ${O}, ${chal2.id}, ${m}, team_id from memberships where user_id = ${m} and office_id = ${O}`;
      for (let k = 0; k < int(1, 3); k++) {
        await tx`insert into challenge_submissions (office_id, challenge_id, user_id, value, description, occurred_on, status, reviewed_by, client_token)
          values (${O}, ${chal2.id}, ${m}, ${int(5, 30)}, 'Sale to a returning customer', ${addDays(today, -int(0, 10))}, ${k === 0 ? 'pending' : 'approved'}, ${k === 0 ? null : admin}, gen_random_uuid())`;
      }
    }
    await tx`insert into announcements (office_id, title, body, pinned, created_by) values
      (${O}, 'Welcome to OfficeHub', 'This is a demo office filled with sample data. Explore attendance, prospects, tasks and finances.', true, ${admin}),
      (${O}, 'Product masterclass registration', 'Register for this month''s product masterclass from the Office Plan page. Seats are limited to 20.', false, ${admin})`;
    for (const m of ids) {
      await tx`insert into notifications (office_id, user_id, kind, title, body, link) values (${O}, ${m}, 'announcement', 'Welcome to OfficeHub', 'Explore your dashboard to get started.', '/dashboard')`;
    }
    await tx`insert into audit_logs (office_id, actor_id, action, entity_type, summary) values (${O}, ${admin}, 'seed', 'office', 'Demo data generated')`;
  });
  console.log(`Seeded demo office. Sign in as admin@demo.officehub.test or ada@demo.officehub.test with password ${PASSWORD}`);
}

main().then(() => sql.end()).catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
