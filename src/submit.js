require("dotenv").config();
const axios = require("axios");

const SESSION = process.env.LEETCODE_SESSION;
const CSRF = process.env.LEETCODE_CSRF;

if (!SESSION || !CSRF) {
  console.error("❌ Missing LEETCODE_SESSION or LEETCODE_CSRF in environment.");
  process.exit(1);
}

// Two Sum — hash map O(n) solution in JavaScript
const TWO_SUM_CODE = `
/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
var twoSum = function(nums, target) {
    const map = {};
    for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (map[complement] !== undefined) return [map[complement], i];
        map[nums[i]] = i;
    }
};
`.trim();

const HEADERS = {
  "Content-Type": "application/json",
  Cookie: `LEETCODE_SESSION=${SESSION}; csrftoken=${CSRF}`,
  "x-csrftoken": CSRF,
  Referer: "https://leetcode.com/problems/two-sum/",
  Origin: "https://leetcode.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
};

async function submitSolution() {
  console.log("🚀 Submitting Two Sum to LeetCode...");

  const res = await axios.post(
    "https://leetcode.com/problems/two-sum/submit/",
    {
      lang: "javascript",
      question_id: "1",
      typed_code: TWO_SUM_CODE,
    },
    { headers: HEADERS }
  );

  const submissionId = res.data.submission_id;
  if (!submissionId) {
    console.error("❌ No submission_id returned:", res.data);
    process.exit(1);
  }

  console.log(`✅ Submission ID: ${submissionId}`);
  return submissionId;
}

async function pollResult(submissionId) {
  const checkUrl = `https://leetcode.com/submissions/detail/${submissionId}/check/`;
  const maxAttempts = 15;
  const delayMs = 2000;

  console.log("⏳ Polling for result...");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, delayMs));

    const res = await axios.get(checkUrl, { headers: HEADERS });
    const data = res.data;

    console.log(`  Attempt ${attempt}: state = ${data.state}`);

    if (data.state === "SUCCESS") {
      return data;
    }

    if (data.state === "FAILURE" || data.state === "RUNTIME_ERROR" || data.state === "COMPILE_ERROR") {
      return data;
    }
  }

  throw new Error("Timed out waiting for submission result.");
}

function printResult(data) {
  const statusMap = {
    10: "✅ Accepted",
    11: "❌ Wrong Answer",
    12: "⏱️  Memory Limit Exceeded",
    13: "⚡ Output Limit Exceeded",
    14: "⏱️  Time Limit Exceeded",
    15: "💥 Runtime Error",
    20: "🔨 Compile Error",
  };

  const statusMsg = statusMap[data.status_code] || `Status code: ${data.status_code}`;
  console.log(`\n📊 Result: ${statusMsg}`);

  if (data.status_code === 10) {
    console.log(`   Runtime  : ${data.status_runtime}`);
    console.log(`   Memory   : ${data.status_memory}`);
    console.log(`   Beat     : ${data.runtime_percentile?.toFixed(1) ?? "?"}% by runtime`);
  } else if (data.compile_error) {
    console.log(`   Error    : ${data.compile_error}`);
  } else if (data.runtime_error) {
    console.log(`   Error    : ${data.runtime_error}`);
  }
}

async function main() {
  try {
    const submissionId = await submitSolution();
    const result = await pollResult(submissionId);
    printResult(result);

    if (result.status_code !== 10) {
      process.exit(1);
    }
  } catch (err) {
    if (err.response) {
      console.error("❌ HTTP Error:", err.response.status, JSON.stringify(err.response.data));
    } else {
      console.error("❌ Error:", err.message);
    }
    process.exit(1);
  }
}

main();
