# 🤖 LeetCode Daily Submit Bot

Automatically picks a **random LeetCode problem** each day, generates a **Java** solution with Groq, and submits it using GitHub Actions.

---

## 📁 Project Structure

```
leetcode-streak-bot/
├── .github/
│   └── workflows/
│       └── submit.yml       ← GitHub Actions cron job
├── src/
│   └── submit.js            ← Random question + Groq Java submission logic
├── .env.example             ← Template for environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## ⚙️ Setup

### 1. Get your LeetCode cookies

1. Log in to [leetcode.com](https://leetcode.com) in your browser
2. Open **DevTools** (F12) → **Application** tab → **Cookies** → `https://leetcode.com`
3. Copy the values of:
   - `LEETCODE_SESSION`
   - `csrftoken`

> ⚠️ These expire periodically (usually every ~30 days). You'll need to refresh them.

---

### 2. Add GitHub Secrets

Go to your repo on GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these secrets:

| Secret Name        | Value                        |
|--------------------|------------------------------|
| `LEETCODE_SESSION` | Your `LEETCODE_SESSION` cookie |
| `LEETCODE_CSRF`    | Your `csrftoken` cookie       |
| `GROQ_API_KEY`     | Your Groq API key             |

Optional repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable Name             | Default                    |
|---------------------------|----------------------------|
| `GROQ_MODEL`              | `llama-3.3-70b-versatile` |
| `QUESTION_SEARCH_LIMIT`   | `50`                       |
| `MAX_RANDOM_TRIES`        | `25`                       |
| `INCLUDE_PAID_QUESTIONS`  | `false`                    |

---

### 3. Enable GitHub Actions

Go to **Actions** tab in your repo and enable workflows if prompted.

The workflow runs daily at **2:30 AM UTC (8:00 AM IST)**. You can change the cron schedule in `.github/workflows/submit.yml`.

---

### 4. Run manually (optional)

To trigger it immediately: **Actions** → **LeetCode Daily Submit** → **Run workflow**

---

## 🖥️ Run Locally

```bash
# Install dependencies
npm install

# Copy and fill in your credentials
cp .env.example .env
# Edit .env with LEETCODE_SESSION, LEETCODE_CSRF, and GROQ_API_KEY

# Run
node src/submit.js
```

---

## 🔐 Legal & Ethical Notes

- This bot submits only under **your own account** using your own session credentials
- It is personal automation — similar to using the LeetCode website yourself
- Avoid deceptive behavior like intentional wrong submissions to manipulate profile stats
- Do **not** share your session cookies with anyone
- LeetCode cookies expire; update your GitHub secrets when they do

---

## 📅 Schedule

Default cron: `30 2 * * *` → **2:30 AM UTC = 8:00 AM IST**

Use [crontab.guru](https://crontab.guru) to customize the schedule.
