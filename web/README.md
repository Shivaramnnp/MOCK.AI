# MOCK.AI — Adaptive & Responsive Web Application

The complete, modern web edition of **MOCK.AI** (Focused Scholar AI Exam Platform), built with React 18, TypeScript, Tailwind CSS, Vite, and KaTeX. Fully adaptive and responsive across desktop, tablet, and mobile browsers.

---

## 🌟 Key Features & Architectural Capabilities

### 1. 📱 Adaptive & Responsive Across All Devices
- **Desktop (`> 1024px`)**: Top navigation with role switcher, wide canvas for MCQ Editor, side-by-side test navigator, full keyboard shortcuts (`1-4` or `A-D` to choose answers, `← / →` or `J/K` to navigate questions, `B` to toggle bookmark).
- **Tablet (`768px - 1024px`)**: Dual-column responsive layouts, touch-friendly palettes, collapsible menus.
- **Mobile (`< 768px`)**: Native-feeling bottom navigation bar (`MockAiBottomNav`) with active pill indicator, swipeable sheets, and touch-optimized controls.

### 2. 📥 10 Multi-Source MCQ Ingestion Pipelines
1. **PDF Document**: Drag-and-drop or select any textbook, syllabus, or exam PDF.
2. **Word / PPT**: Upload DOCX or PPTX lecture slides and notes.
3. **Topic Generation**: Type any topic (e.g. *Kinematics*, *Organic Chemistry*, *Constitutional Law*) + difficulty (*Easy, Medium, Hard, Competitive*) for instant AI test generation.
4. **YouTube Video**: Paste any YouTube link to extract transcript concepts and generate conceptual questions.
5. **Webpage URL**: Scrape articles, Wikipedia entries, or study materials.
6. **Gallery / Photos**: Upload textbook photos or diagram questions.
7. **Live Camera Scanner**: Scan physical pages in real-time via camera/webcam (`navigator.mediaDevices.getUserMedia`).
8. **Voice Dictation / Audio**: Record audio or speak questions aloud with live speech transcription (`Web Speech API`).
9. **Manual Entry**: Full interactive MCQ studio to compose questions from scratch.
10. **JSON Import / Export**: Paste or export structured question data.

### 3. 🧪 MCQ Studio & Real-Time LaTeX Formula Preview
- Rich question editor supporting mathematical and chemical formulas via **KaTeX** (`$E = mc^2$`, `$\int_{0}^{\pi} \sin(x) dx$`, `$\frac{a}{b}$`).
- **AI Fix All**: Automatic auditing of incomplete options, answer key verification, and derivation explanation generation.
- Full re-ordering, duplication, and option selection controls.

### 4. 🎯 Focused Scholar Exam Player
- Anxiety-reducing, high-focus interface.
- Pausable countdown timer with warning colors only in the final 10 seconds.
- Interactive question palette (color-coded for Answered, Current, Bookmarked, and Unanswered).
- Anti-cheat window blur / tab-switch monitor.
- Detailed submit confirmation breakdown.

### 5. 📊 Comprehensive Analytics & Learning Insights
- Animated circular score gauge with performance tier badges.
- Accuracy trend line chart across recent exams.
- **Weak Topics Detector**: Auto-detects error frequency by subject and offers 1-click targeted practice.
- Daily AI Learning Coach recommendations.
- Persistent Study Streak tracker with motivational flame badge.

### 6. 👥 Multi-Role Classroom & Community Ecosystem
- **Learner**: Self-paced independent study, test creation, and public marketplace.
- **Student**: Join teacher classrooms with a 6-character code, view assignments, and submit graded exams.
- **Teacher**: Create classes, generate join codes, assign tests with due dates, and monitor student score analytics.
- **Marketplace & Creator Studio**: Browse community exams by subject or publish your own tests.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or pnpm / yarn

### Installation & Development
```bash
# Navigate to web directory
cd web

# Install dependencies
npm install

# Start local development server (http://localhost:3000)
npm run dev

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

### Environment / API Configuration
API keys for **Google Gemini 2.5 Flash** and **Groq** are pre-configured in `src/services/storage.ts` using the values from `local.properties`. You can also dynamically update keys in the web app under **Settings → AI Models & API Keys**.
