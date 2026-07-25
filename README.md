# Web App with Netlify & Grok AI

A lightweight web application equipped with Progressive Web App (PWA) features and integrated with xAI's Grok API via Netlify Serverless Functions. 

⚡ **Live site deployed automatically via GitHub integration.**

---

## 📁 Project Structure

```text
├── index.html                # Main entry HTML page
├── manifest.json             # Web App Manifest for PWA support
├── sw.js                     # Service Worker for offline capabilities
├── netlify.toml              # Netlify build & deployment configuration
├── netlify/
│   └── functions/
│       └── grok.js           # Serverless endpoint for xAI/Grok integration
├── CHANGELOG.md              # Project history and release notes
├── package.json              # Node dependencies & scripts
└── .gitignore                # Git ignore configuration