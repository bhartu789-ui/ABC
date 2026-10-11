# TimeTable Pro — School Scheduling Studio

**A responsive school timetable builder, created by Bharat Kumar.**

TimeTable Pro helps teachers and school administrators set up classes, subjects, teaching staff and weekly teaching allocations, then generate a timetable with **no simultaneous teacher bookings**. It works fully offline after the files are loaded, without AI credits, server credentials, accounts, paid APIs or a backend database.

## Features

- Editable school name, academic year, working days (1–6), periods (1–10/day), period duration and break timing.
- Add/remove classes, teachers and colour-coded subjects.
- Define a teacher, subject and number of periods per week for each class.
- Automatically generate weekly school schedules with teacher conflict checking, class subject quotas and even distribution across days.
- Class and teacher timetable views, live teacher workload dashboard, timetable completeness checks.
- Manual lesson editing with validation. Select **Keep this period fixed** to preserve the lesson during regeneration.
- Print one class, one teacher or every class to A4 landscape PDF via the browser print dialogue.
- Export an Excel-compatible UTF-8 CSV with formula-injection protection.
- Automatically save your school data and schedule to **this browser only**. Export/import a JSON backup to move between devices.
- Demo workspace with 4 classes, 14 teachers, 8 subjects and 120 fully scheduled weekly lessons.
- Responsive teacher-first web UI, mobile layout and accessible form labels.

## Run locally

```bash
cd timetable-pro
python3 -m http.server 3000
# visit http://localhost:3000
```

Or deploy the folder as a static site to Vercel. No build step or environment variables are required. `npm install` is not necessary.

## Test

```bash
npm test
```

## Scheduling behavior

The dependency-free solver in `src/engine.js` schedules each class's subject/teacher allocations with multiple seeded heuristic attempts. For every proposed lesson it checks **both** the class's empty period and the teacher's availability at that exact day/period. It balances subject repetition across days where possible. It respects manually fixed periods, validates quotas and teacher collisions and labels a timetable as complete **only** if all allocations are fulfilled without clashes. Complex or infeasible inputs can lead to a partial timetable plus a warning; the algorithm is a practical heuristic, **not** a proof that every feasible timetable can be solved.

Manual changes cannot double-book a teacher or exceed weekly subject allocations. A teacher's total weekly periods cannot exceed the available periods per school week. If you alter an existing allocation's teacher or count, review the timetable and regenerate it as needed.

## Privacy / data storage

There is **no cloud database** in this MVP. Teacher names, allocations and timetables stay in browser localStorage on the user's current device. Clearing browser storage or using another device will not sync the content, so use the Download backup button regularly. Demo names and allocations are examples; replace them with the school's actual information before use.

## Future roadmap

- Teacher unavailability (days/periods off), room/lab capacity, split groups and double periods.
- Multiple school shifts and weekend calendars.
- User sign-in, cloud sync with secure roles and collaborative editing.
- PDF reports, substitution/absence scheduling and printable individual teacher schedules.

## Repository structure

```
timetable-pro/
  index.html          Main interface
  styles.css          Theme and responsive layout
  favicon.svg         App icon
  src/engine.js       Scheduling/validation engine
  src/app.js          User interactions and exports
  tests/engine.test.js Automated regression checks
  vercel.json         Static Vercel configuration
  package.json        Test scripts
```
