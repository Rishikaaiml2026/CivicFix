# CivicFix – Smart Public Infrastructure Issue Tracker
> **College Hackathon 2026** | **Team:** Tech Titans

CivicFix is a complete, modern, full-stack civic-tech web application designed to solve urban infrastructure maintenance bottlenecks: potholes, broken streetlights, damaged footpaths, water supply leaks, and overflowing garbage bins.

---

## 🌟 Key Highlights & Architecture

1. **Design & Theme**
   - Professional, responsive civic-tech UI built with Tailwind CSS, custom modern blue-and-white gradients, glassmorphism headers, responsive grids, and micro-animations.
   - Distinct semantic status pills: `Submitted`, `Under Review`, `Assigned`, `In Progress`, `Resolved`, `Reopened`.
   - Dynamic priority indicators: `Low`, `Medium`, `High`, `Urgent` (with pulsing alert).

2. **Landing Page**
   - CivicFix brand navigation with quick links and 10-language selector.
   - Hero section with live platform vitality statistics calculated from the SQLite database.
   - "How It Works" 4-step interactive pipeline.
   - Interactive infrastructure categories grid with direct report shortcuts.
   - Live Leaflet map with category icons and status filters.
   - Direct Tracking ID search bar with a visual 5-node stepper timeline.

3. **Citizen Portal**
   - Fast, interactive complaint reporting form:
     - Title & Description with built-in **Voice Dictation (Web Speech API 🎙️)**
     - Category selection & citizen severity assessment
     - Drag-and-drop photo upload with instant preview
     - Interactive Leaflet location picker with draggable pin
     - **"Use My GPS Location"** one-click HTML5 geolocation
     - Citizen contact info (or anonymous option)
   - Automatically generates unique tracking ID: `CF-YYYY-XXXXX`
   - Instant confirmation dialog with 1-click clipboard copy and track button.

4. **Smart Duplicate Detection**
   - **Haversine Geospatial Proximity**: Computes great-circle distance in meters between coordinates.
   - **NLP Text Similarity**: Tokenizes words, filters stopwords, computes Jaccard similarity and token overlap between titles and descriptions.
   - **Proactive Interception**: Intercepts submission before database save if potential duplicate is detected within 300 meters with high similarity.
   - **Duplicate Comparison Card**: Displays distance in meters, photo thumbnail, address, current progress status, and citizen support count.
   - Gives citizens two clear choices:
     - **"👍 Support Existing Report (+1 Upvote)"**: Escalates the existing issue without creating redundant paperwork.
     - **"Submit as New Separate Report"**: Preserves citizen freedom to submit anyway if distinct. Never automatically deletes or discards reports.

5. **Protected Staff & Admin Dashboard (`/staff.html`)**
   - Protected operations center with real-time KPI tiles: Total, Pending, In-Progress, Resolved, and Overdue (> 7 days SLA breach).
   - Multi-filtering & search bar: search by Tracking ID, keyword, address; filter by Status, Department, Priority, and Sort order.
   - **Inspection & Update Modal**:
     - Photo proof inspection and interactive GPS mini-map.
     - Department reassignment (Roads, Waste, Electrical, Water, Parks).
     - Priority escalation (Low, Medium, High, Urgent).
     - Status workflow: `Submitted` ➔ `Under Review` ➔ `Assigned` ➔ `In Progress` ➔ `Resolved` / `Reopened`.
     - **Mandatory Resolution Notes Enforcement**: Form strictly requires resolution notes and allows resolution photo proof before status can be marked as `Resolved`.
     - Complete immutable status audit timeline with timestamps, actor names, roles, and notes.
   - **1-Click Demo Accounts for Judges**: One-tap sign in as City Admin, Roads Inspector, Sanitation Officer, or Electrical Engineer.

6. **Interactive Leaflet & OpenStreetMap (`Leaflet 1.9.4`)**
   - Custom SVG markers categorized by issue type:
     - 🚧 Roads & Potholes (Orange)
     - 💡 Streetlights & Electrical (Yellow)
     - 🚶 Footpaths & Sidewalks (Teal)
     - 💧 Water Leaks & Drainage (Blue)
     - ♻️ Garbage & Sanitation (Green)
     - 🌳 Parks & Forestry (Teal/Emerald)
   - Interactive popups with thumbnail, address, status, supporters count, and link to track.
   - Filterable by status (`All`, `Submitted`, `In Progress`, `Resolved`).

7. **Database-Driven Analytics Dashboard (`/analytics.html`)**
   - Powered by Chart.js, zero hardcoded numbers:
     - **Issues by Category** (Doughnut Chart)
     - **Issues by Workflow Status** (Bar Chart)
     - **Monthly Reporting & Resolution Trends** (Smooth Area Line Chart)
     - **Department Workload & Efficiency** (Stacked Bar Chart: Resolved vs In-Progress vs Pending)
     - **Average Resolution Time by Category** (Horizontal Bar Chart in days)
     - KPI Summary tiles: Total, Resolved, Resolution Rate %, Avg Fix Time, Overdue Count.

8. **CivicBot AI Chatbot & Voice Assistant**
   - Floating municipal conversational assistant.
   - **Natural Language Civic Q&A**: Answers how to report potholes, streetlights, garbage schedules, water leaks, and emergency helplines.
   - **Smart Tracking ID Auto-Lookup**: Type or speak a tracking ID (e.g. `Where is CF-2026-10492?`) and CivicBot automatically retrieves the record from SQLite and displays a live card with progress and link.
   - **Voice Assistant**:
     - Speech-to-Text (STT) for hands-free voice dictation in chat and form fields.
     - Text-to-Speech (TTS) speaker toggle to read responses aloud for accessibility.

9. **Multi-Language Support (i18n)**
   - 10 Comprehensive Languages:
     1. English
     2. Hindi (हिंदी)
     3. Telugu (తెలుగు)
     4. Tamil (தமிழ்)
     5. Marathi (मराठी)
     6. Bengali (বাংলা)
     7. Kannada (ಕನ್ನಡ)
     8. Spanish (Español)
     9. French (Français)
     10. German (Deutsch)
   - Real-time language switching without page reload.

10. **Pre-Seeded Realistic Demo Records**
    - 8+ diverse infrastructure issues across all categories, including:
      - In Progress pothole on MG Road (`CF-2026-10492`)
      - Near-duplicate pothole within 35 meters (`CF-2026-10515`) to immediately showcase duplicate detection!
      - Verified resolved streetlight issue with resolution notes (`CF-2026-10280`)
      - Urgent sanitation issue (`CF-2026-10588`)
      - Overdue water supply leak (`CF-2026-10112`)
      - Reopened road repair issue (`CF-2026-10399`)

---

## 🚀 How to Run CivicFix

### Option 1: Double-Click (Easiest)
Simply double-click:
```
start.bat
```
This automatically starts the server at `http://localhost:5000` and opens your default browser!

### Option 2: PowerShell
```powershell
.\start.ps1
```

### Option 3: Command Line
```cmd
run_node.bat server.js
```

Then visit:
- **Public Citizen Portal:** `http://localhost:5000/`
- **Staff Operations Center:** `http://localhost:5000/staff.html`
- **Analytics Dashboard:** `http://localhost:5000/analytics.html`

---

## 🔑 Demo Accounts for Evaluation

| Role | Email | Password | Quick Action |
|---|---|---|---|
| **City Admin** | `admin@civicfix.gov` | `admin123` | Click "👑 City Admin" button on login modal |
| **Roads Inspector** | `staff.roads@civicfix.gov` | `staff123` | Click "🚧 Roads Inspector" |
| **Sanitation Officer** | `staff.waste@civicfix.gov` | `staff123` | Click "♻️ Sanitation Officer" |
| **Electrical Engineer** | `staff.lighting@civicfix.gov` | `staff123` | Click "💡 Electrical Eng." |

---

## 🧪 Hackathon Demonstration Walkthrough

1. **Test Reporting & Duplicate Detection**:
   - On the homepage, click **"Report an Issue"**.
   - Choose category: **Potholes & Road Damage**.
   - Enter Title: `Deep crater on MG Road near City Center Mall`.
   - Set coordinates near default (`12.9716, 77.5946`).
   - Click **Submit Complaint**.
   - **Watch**: The Smart Duplicate Detection modal pops up showing the existing `CF-2026-10492` report located 35m away with 18 supporters!
   - Click **"👍 Support Existing Report (+1 Upvote)"** to see live upvote escalation, OR click **"Submit as New Separate Report"** to test fresh filing.

2. **Test Complaint Tracking**:
   - In the Track Complaint box, enter: `CF-2026-10492`.
   - View the 5-node visual progress stepper, assigned department, and audit timeline.

3. **Test CivicBot Voice & AI**:
   - Click the robot icon at bottom-right.
   - Click the quick chip: **"Where is CF-2026-10492?"**.
   - Watch CivicBot query the database and present the live tracking card!
   - Click the microphone icon to test voice input.
   - Click the speaker icon to test voice read-aloud.

4. **Test Multi-Language**:
   - In the top navigation bar, change language to **हिंदी (Hindi)** or **తెలుగు (Telugu)** or **Español**.
   - All headers, how-it-works cards, categories, and form fields change instantly.

5. **Test Staff Workflow & Mandatory Resolution Notes**:
   - Open `/staff.html` and click **"🚧 Roads Inspector"**.
   - Find complaint `CF-2026-10492` and click **"Inspect & Update"**.
   - Change status to **Resolved**.
   - Notice the green alert requiring **Resolution Notes**. Enter notes: `Filled with asphalt on 24-Oct` and click Save.
   - Check the status audit history update.

6. **Test Analytics**:
   - Open `/analytics.html` to inspect real-time Chart.js graphs populated dynamically from SQLite.
