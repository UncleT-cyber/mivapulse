# MivaPrep 🚀

**MivaPrep** is a highly scalable, dual-stream examination simulation workspace explicitly engineered to support university students through their entire academic journey—from foundational 100-Level concepts to 400-Level senior graduation requirements. 

Built originally to streamline revision workflows, this platform dynamically balances quick-fire objective testing with intensive, AI-driven written exam evaluations.

---

## 🎓 Tailored Academic Progression Architecture

The simulator is strategically split into two core assessment modules designed to evolve alongside university curriculum standards:

### 📱 100L: (Objective Testing)
* **Target Focus:** Core Multi-Choice Questions (MCQs) across introductory courses (e.g., CSS, Architecture, core computing principles).
* **Interactive Engine:** Features responsive option selection, real-time question progress bars, and instant submission handlers.
* **Granular Diagnostics:** Renders a clean performance evaluation screen breaking down accurate scoring ratios (e.g., Accuracy Rating, absolute number of Correct/Incorrect choices) to identify knowledge gaps rapidly.

### 🧠 200L - 400L+: Advanced Stage (Critical Synthesis - Essay)
* **Target Focus:** Case study evaluations, architectural trade-offs, and deep essay prompts (e.g., Monolithic vs. Microservices analysis).
* **Nexus AI Evaluator:** Integrates an advanced LLM framework directly into an analytical text interface to critique and grade comprehensive open-ended student scripts.

---

## ✨ Core Features

* **Dual-Stream Workspace:** Seamless toggle system between objective MCQ sessions and long-form essay submissions depending on study targets.
* **Dynamic Fallback Environment:** Configured with advanced programming logic (`${courseCode || "COS 301"}`) ensuring fallback safety metrics across all simulated course streams without breaking application code layouts.
* **GitHub Metrics Bridge:** An automated repository integration helper enabling students to push session analysis data directly to GitHub Issues for continuous revision tracking and historical progress auditing.
* **Optimized Study Layout:** Engineered with a focused, high-contrast custom dark-mode theme to eliminate optical strain during intense late-night preparation marathons.

---

## 🛠️ Technical Stack

* **Frontend:** Vanilla JavaScript (ES6+), HTML5 Semantic Structure, CSS3 (Modern Flexbox layouts & Custom Theme Variables).
* **Backend:** Node.js serverless route architecture (fully optimized for localized pipelines and edge deployments like Vercel).
* **AI Engine Framework:** Ollama / Large Language Models (Supports local execution or custom external endpoints).

---

## 🚀 Environment Execution & Network Configuration

This project accommodates multiple environment profiles depending on hardware availability, network firewalls, or connectivity configurations.

### 1. Frontend Development Setup
Simply run the project using your preferred local environment (e.g., VS Code **Live Server** extension, or executing `npm run dev` if binding to a Node compilation framework).

### 2. AI Stream Evaluation Workflows
To evaluate complex 300L/400L written scripts, implement **one** of the following infrastructural profiles inside your backend route configuration (`/api/evaluate-essay`):

#### ⚡ Option A: Local AI Loopback (Recommended for offline study)
Run an open-source model directly on your local hardware bypassing strict cross-origin resource limitations:
OLLAMA_ORIGINS="*" OLLAMA_HOST="127.0.0.1" ollama serve

🌐 Option B: Cloud AI Engine Integration (No local installation needed)
If you prefer not to tax your laptop's local RAM/GPU or are working through restricted networking environments (such as a Cellular Mobile Hotspot using Carrier-Grade NAT / CGNAT which blocks incoming connections), update your host router configuration:

Hardcode or configure your API host variables to point straight to a managed cloud endpoint provider like Groq, DeepSeek, or OpenRouter.

Pass your private provider API token directly via secure headers (Authorization: Bearer <KEY>).


---

### 📤 Commit and Lock It In
