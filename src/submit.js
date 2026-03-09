require("dotenv").config();
const axios = require("axios");

// NOTE: LeetCode sometimes silently drops submissions from datacenter IPs
// (GitHub Actions uses Azure IPs). We verify the submission actually landed
// on the profile by checking recent submissions via GraphQL after submitting.

const SESSION = process.env.LEETCODE_SESSION;
const CSRF = process.env.LEETCODE_CSRF;

if (!SESSION || !CSRF) {
  console.error("❌ Missing LEETCODE_SESSION or LEETCODE_CSRF in environment.");
  console.error("   Set LEETCODE_SESSION and LEETCODE_CSRF as environment variables or in .env");
  process.exit(1);
}

console.log(`🔑 SESSION length: ${SESSION.length} chars`);
console.log(`🔑 CSRF length   : ${CSRF.length} chars`);

// Two Sum — hash map O(n) solution in JavaScript
const TWO_SUM_CODE = `/**
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
};`;

// LeetCode requires these exact headers — any missing one causes 403 or silent failure
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: `LEETCODE_SESSION=${SESSION}; csrftoken=${CSRF}`,
  // LeetCode checks for capital X-CSRFToken — lowercase causes 403
  "X-CSRFToken": CSRF,
  Referer: "https://leetcode.com/problems/two-sum/description/",
  Origin: "https://leetcode.com",
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

async function submitSolution() {
  console.log("\n🚀 Submitting Two Sum to LeetCode...");

  const body = {
    lang: "javascript",
    question_id: "1",
    typed_code: TWO_SUM_CODE,
  };

  console.log("   POST https://leetcode.com/problems/two-sum/submit/");
  console.log("   Body:", JSON.stringify({ ...body, typed_code: "[omitted]" }));

  // validateStatus: always resolve so we can log the full response on failure
  const res = await axios.post(
    "https://leetcode.com/problems/two-sum/submit/",
    body,
    {
      headers: HEADERS,
      validateStatus: () => true,
    }
  );

  console.log(`   HTTP Status: ${res.status}`);

  if (res.status === 403) {
    console.error("❌ 403 Forbidden — your CSRF token or session cookie is wrong/expired.");
    console.error("   Response body:", JSON.stringify(res.data));
    process.exit(1);
  }

  if (res.status === 401) {
    console.error("❌ 401 Unauthorized — your LEETCODE_SESSION cookie is wrong or expired.");
    console.error("   Response body:", JSON.stringify(res.data));
    process.exit(1);
  }

  if (res.status !== 200) {
    console.error(`❌ Unexpected HTTP ${res.status}`);
    console.error("   Response body:", JSON.stringify(res.data));
    process.exit(1);
  }

  const submissionId = res.data?.submission_id;
  if (!submissionId) {
    console.error("❌ No submission_id in response. Full response:");
    console.error(JSON.stringify(res.data, null, 2));
    process.exit(1);
  }

  console.log(`✅ Submission ID: ${submissionId}`);
  return submissionId;
}

async function pollResult(submissionId) {
  const checkUrl = `https://leetcode.com/submissions/detail/${submissionId}/check/`;
  const maxAttempts = 20;
  const delayMs = 2000;

  console.log("\n⏳ Polling for result...");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, delayMs));

    const res = await axios.get(checkUrl, {
      headers: HEADERS,
      validateStatus: () => true,
    });

    if (res.status !== 200) {
      console.error(`❌ Poll HTTP ${res.status}:`, JSON.stringify(res.data));
      process.exit(1);
    }

    const data = res.data;
    console.log(`  Attempt ${attempt}/${maxAttempts}: state = ${data.state}`);

    if (data.state === "SUCCESS" || data.state === "FAILURE" ||
        data.state === "RUNTIME_ERROR" || data.state === "COMPILE_ERROR") {
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

  const statusMsg = statusMap[data.status_code] || `Unknown status code: ${data.status_code}`;
  console.log(`\n📊 Result: ${statusMsg}`);

  if (data.status_code === 10) {
    console.log(`   Runtime  : ${data.status_runtime}`);
    console.log(`   Memory   : ${data.status_memory}`);
    console.log(`   Beat     : ${data.runtime_percentile?.toFixed(1) ?? "?"}% by runtime`);
  } else {
    // Print everything for debugging
    console.log("   Full result:", JSON.stringify(data, null, 2));
  }
}

async function verifyOnProfile(submissionId) {
  console.log("\n🔍 Verifying submission appears on profile...");

  // GraphQL query to fetch recent submissions for Two Sum (question slug: two-sum)
  const query = `
    query recentSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        id
        title
        timestamp
      }
    }
  `;

  // Decode username from session JWT (middle base64 segment)
  const payload = JSON.parse(
    Buffer.from(SESSION.split(".")[1], "base64").toString()
  );
  const username = payload.username || payload.user_slug;
  console.log(`   Checking profile: ${username}`);

  const res = await axios.post(
    "https://leetcode.com/graphql",
    { query, variables: { username, limit: 10 } },
    { headers: HEADERS, validateStatus: () => true }
  );

  if (res.status !== 200) {
    console.warn(`⚠️  Could not verify profile (HTTP ${res.status}) — submission may still have gone through.`);
    return;
  }

  const list = res.data?.data?.recentAcSubmissionList ?? [];
  const found = list.find((s) => String(s.id) === String(submissionId));

  if (found) {
    console.log(`✅ VERIFIED — submission ${submissionId} appears on profile!`);
    console.log(`   Title    : ${found.title}`);
    console.log(`   Time     : ${new Date(found.timestamp * 1000).toUTCString()}`);
  } else {
    console.error("❌ SUBMISSION NOT ON PROFILE — LeetCode likely blocked the request from this IP.");
    console.error("   Submission IDs from GraphQL:", list.map((s) => s.id).join(", ") || "(none)");
    console.error("   Expected ID:", submissionId);
    console.error("\n   ⚠️  FIX: LeetCode blocks datacenter IPs (GitHub Actions = Azure IP).");
    console.error("   Switch to a self-hosted runner on your own machine:");
    console.error("   https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners");
    process.exit(1);
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

    await verifyOnProfile(submissionId);
  } catch (err) {
    if (err.response) {
      console.error("❌ HTTP Error:", err.response.status, JSON.stringify(err.response.data));
    } else {
      console.error("❌ Error:", err.message);
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
