# 🤖 LeetCode Daily Submit Bot

Automatically submits a **Two Sum** solution to LeetCode every day using GitHub Actions — keeping your streak alive without opening your laptop.

---

## 📁 Project Structure

```
leetcode-streak-bot/
├── .github/
│   └── workflows/
│       └── submit.yml       ← GitHub Actions cron job
├── src/
│   └── submit.js            ← Core submission logic
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

Add these two secrets:

| Secret Name        | Value                        |
|--------------------|------------------------------|
| `LEETCODE_SESSION` | Your `LEETCODE_SESSION` cookie |
| `LEETCODE_CSRF`    | Your `csrftoken` cookie       |

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
# Edit .env with your LEETCODE_SESSION and LEETCODE_CSRF

# Run
node src/submit.js
```

---

## 🔐 Legal & Ethical Notes

- This bot submits only under **your own account** using your own session credentials
- It is personal automation — similar to using the LeetCode website yourself
- Do **not** share your session cookies with anyone
- LeetCode cookies expire; update your GitHub secrets when they do

---

## 📅 Schedule

Default cron: `30 2 * * *` → **2:30 AM UTC = 8:00 AM IST**

Use [crontab.guru](https://crontab.guru) to customize the schedule.
