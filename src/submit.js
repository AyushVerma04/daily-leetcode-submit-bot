require("dotenv").config();
const axios = require("axios");

// NOTE: LeetCode sometimes silently drops submissions from datacenter IPs
// (GitHub Actions uses Azure IPs). We verify the submission actually landed
// on the profile by checking recent submissions via GraphQL after submitting.

const SESSION = process.env.LEETCODE_SESSION;
const CSRF = process.env.LEETCODE_CSRF;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const QUESTION_SEARCH_LIMIT = Number(process.env.QUESTION_SEARCH_LIMIT || 50);
const MAX_RANDOM_TRIES = Number(process.env.MAX_RANDOM_TRIES || 25);
const INCLUDE_PAID_QUESTIONS =
  String(process.env.INCLUDE_PAID_QUESTIONS || "false").toLowerCase() === "true";

if (!SESSION || !CSRF || !GROQ_API_KEY) {
  console.error("❌ Missing required environment variables.");
  console.error(
    "   Required: LEETCODE_SESSION, LEETCODE_CSRF, GROQ_API_KEY"
  );
  process.exit(1);
}

console.log(`🔑 SESSION length: ${SESSION.length} chars`);
console.log(`🔑 CSRF length   : ${CSRF.length} chars`);
console.log(`🔑 GROQ key len  : ${GROQ_API_KEY.length} chars`);

// LeetCode requires these exact headers — any missing one can cause 403 or silent failure
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: `LEETCODE_SESSION=${SESSION}; csrftoken=${CSRF}`,
  // LeetCode checks for capital X-CSRFToken — lowercase causes 403
  "X-CSRFToken": CSRF,
  Referer: "https://leetcode.com/problemset/",
  Origin: "https://leetcode.com",
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

function makeSeededRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function dailySeed() {
  const today = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

async function graphqlRequest(query, variables) {
  const res = await axios.post(
    "https://leetcode.com/graphql",
    { query, variables },
    { headers: HEADERS, validateStatus: () => true }
  );

  if (res.status !== 200) {
    throw new Error(`GraphQL HTTP ${res.status}: ${JSON.stringify(res.data)}`);
  }

  if (res.data?.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(res.data.errors)}`);
  }

  return res.data?.data;
}

async function fetchProblemPage(skip, limit) {
  const query = `
    query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
      problemsetQuestionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
        total: totalNum
        questions: data {
          acRate
          difficulty
          freqBar
          frontendQuestionId: questionFrontendId
          isFavor
          paidOnly: isPaidOnly
          status
          title
          titleSlug
          topicTags {
            name
            id
            slug
          }
          hasSolution
          hasVideoSolution
        }
      }
    }
  `;

  const data = await graphqlRequest(query, {
    categorySlug: "",
    limit,
    skip,
    filters: {},
  });

  return data.problemsetQuestionList;
}

async function fetchQuestionDetails(titleSlug) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        content
        difficulty
        hints
        topicTags {
          name
          slug
        }
        codeSnippets {
          lang
          langSlug
          code
        }
      }
    }
  `;

  const data = await graphqlRequest(query, { titleSlug });
  return data.question;
}

async function chooseRandomQuestion() {
  console.log("\n🎲 Selecting a random daily problem...");

  const seedRng = makeSeededRandom(dailySeed());
  const firstPage = await fetchProblemPage(0, 1);
  const total = firstPage.total;

  if (!total || total < 1) {
    throw new Error("Could not fetch problem count from LeetCode.");
  }

  for (let attempt = 1; attempt <= MAX_RANDOM_TRIES; attempt++) {
    const skip = Math.floor(seedRng() * Math.max(1, total - QUESTION_SEARCH_LIMIT));
    const page = await fetchProblemPage(skip, QUESTION_SEARCH_LIMIT);
    const candidates = page.questions.filter((q) => {
      if (!INCLUDE_PAID_QUESTIONS && q.paidOnly) return false;
      return true;
    });

    if (!candidates.length) {
      continue;
    }

    const picked = candidates[Math.floor(seedRng() * candidates.length)];
    const detail = await fetchQuestionDetails(picked.titleSlug);
    const javaSnippet = detail?.codeSnippets?.find((s) => s.langSlug === "java");

    if (!javaSnippet) {
      console.log(
        `   Attempt ${attempt}/${MAX_RANDOM_TRIES}: ${picked.titleSlug} has no Java snippet, retrying...`
      );
      continue;
    }

    console.log(
      `✅ Picked: #${detail.questionFrontendId} ${detail.title} (${detail.difficulty})`
    );
    return {
      ...detail,
      javaStarterCode: javaSnippet.code,
    };
  }

  throw new Error(
    `Could not find a suitable random question in ${MAX_RANDOM_TRIES} attempts.`
  );
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCode(text) {
  const content = String(text || "").trim();
  const block = content.match(/```(?:java)?\s*([\s\S]*?)```/i);
  return (block ? block[1] : content).trim();
}

async function generateJavaSolution(question) {
  console.log("\n🧠 Generating Java solution using Groq...");

  const statement = stripHtml(question.content).slice(0, 8000);
  const prompt = [
    `You are solving a LeetCode problem in Java.`,
    `Return only valid Java code, no markdown, no explanations.`,
    `The class must remain named Solution.`,
    `Preserve the method signature from the starter code exactly.`,
    "",
    `Problem: #${question.questionFrontendId} ${question.title}`,
    `Difficulty: ${question.difficulty}`,
    `Topics: ${(question.topicTags || []).map((t) => t.name).join(", ") || "N/A"}`,
    "",
    `Statement: ${statement}`,
    "",
    "Starter code:",
    question.javaStarterCode,
  ].join("\n");

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an expert competitive programmer. Output only Java source code for LeetCode submission.",
        },
        { role: "user", content: prompt },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    }
  );

  if (res.status !== 200) {
    throw new Error(`Groq API HTTP ${res.status}: ${JSON.stringify(res.data)}`);
  }

  const raw = res.data?.choices?.[0]?.message?.content;
  const code = extractCode(raw);
  if (!code || !/class\s+Solution/.test(code)) {
    throw new Error("Groq response did not return valid Java Solution code.");
  }

  return code;
}

async function submitSolution(question, javaCode) {
  console.log(`\n🚀 Submitting ${question.title} to LeetCode (Java)...`);

  const submitHeaders = {
    ...HEADERS,
    Referer: `https://leetcode.com/problems/${question.titleSlug}/description/`,
  };

  const body = {
    lang: "java",
    question_id: String(question.questionId),
    typed_code: javaCode,
  };

  console.log(`   POST https://leetcode.com/problems/${question.titleSlug}/submit/`);
  console.log("   Body:", JSON.stringify({ ...body, typed_code: "[omitted]" }));

  // validateStatus: always resolve so we can log the full response on failure
  const res = await axios.post(
    `https://leetcode.com/problems/${question.titleSlug}/submit/`,
    body,
    {
      headers: submitHeaders,
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

  let username = "";
  try {
    // Decode username from session JWT (middle base64 segment)
    const payload = JSON.parse(
      Buffer.from(SESSION.split(".")[1], "base64").toString()
    );
    username = payload.username || payload.user_slug;
  } catch (_err) {
    console.warn("⚠️  Could not decode username from LEETCODE_SESSION; skipping profile verification.");
    return;
  }

  if (!username) {
    console.warn("⚠️  Username missing in session payload; skipping profile verification.");
    return;
  }

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
    const question = await chooseRandomQuestion();
    const javaCode = await generateJavaSolution(question);
    const submissionId = await submitSolution(question, javaCode);
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
