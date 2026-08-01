# MivaPrep 🎓

An interactive, AI-assisted examination preparation platform built for university students. **MivaPrep** combines robust multiple-choice practice modules with an AI-powered essay examiner to deliver instant feedback, performance analytics, and realistic exam simulation.

---

## 📸 Overview

<div align="center">
  <img width="496" alt="MivaPrep Mobile View" src="https://github.com/user-attachments/assets/a35d056b-78d8-4977-b91f-767388348608" />
</div>

---

## ✨ Features

* **📚 Extensive Question Bank:** Course-organized multiple-choice testing for Web Development, Mathematics, Computer Science, and more.
* **🤖 AI Essay Examiner:** Real-time AI cognitive evaluation pipeline powered by Anthropic's Claude API.
* **📊 Deep Analytics & Summaries:** Instant scoring performance breakdowns, accuracy charts, and item-by-item review logs.
* **⚡ Universal Rendering:** Built-in auto-escape and LaTeX/MathJax triggers to dynamically display technical code tags, mathematical formulas, and physics equations.
* **🌙 Sleek Modern UI:** Dark-mode optimized, accessible, and fully responsive mobile UI.

---

## 🤖 AI Essay Examiner

The **Nexus AI Essay Examiner** evaluates student written responses in real time, delivering structured breakdowns similar to a human university examiner:

* 🎯 **Overall Metric Score**
* 💪 **Identified Key Strengths**
* ⚠️ **Areas of Weakness**
* 💡 **Actionable Suggestions for Improvement**

> ℹ️ **Note on API Quotas:**  
> The AI examiner currently operates on the Anthropic Claude API free tier. During high-traffic periods, essay evaluations may occasionally be temporarily throttled until the API quota resets.

---

## 🛠️ Tech Stack

* **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+), MathJax v3 Engine
* **Backend:** Node.js, Express.js
* **AI Integration:** Anthropic Claude API
* **Deployment & Hosting:** Vercel Serverless Functions

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies
```bash
git clone [https://github.com/your-username/mivaprep.git](https://github.com/your-username/mivaprep.git)
cd mivaprep
npm install
2. Set Up Environment Variables
Create a .env file in the root directory and add your API credentials:

Code snippet
CLAUDE_API_KEY=your_claude_api_key_here
3. Run Locally with Vercel CLI
Bash
npx vercel dev
Open http://localhost:3000 in your browser to view the application.

🎯 Project Goals
Help university students prepare effectively for semester examinations.

Refine critical thinking and essay-writing skills through instant AI feedback loops.

Provide a high-performance, accessible learning hub tailored for MIVA Open University students.

Continuously expand test modules and question banks across diverse academic disciplines.

🤝 Contributing
Contributions are welcome! Whether it's reporting bugs, adding new question banks, or suggesting feature enhancements:

Fork the repository

Create your feature branch (git checkout -b feature/NewFeature)

Commit your changes (git commit -m "feat: Add new CSC question bank")

Push to the branch (git push origin feature/NewFeature)

Open a Pull Request

📄 License
Distributed under the MIT License. See LICENSE for more information.
