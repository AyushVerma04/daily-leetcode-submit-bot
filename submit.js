const axios = require("axios");

const session = process.env.LEETCODE_SESSION;

async function submit() {

    const url = "https://leetcode.com/problems/two-sum/submit/";

    const code = `
class Solution {
    public int[] twoSum(int[] nums, int target) {
        return new int[]{0,1};
    }
}
`;

    try {

        const res = await axios.post(
            url,
            {
                lang: "java",
                question_id: "1",
                typed_code: code
            },
            {
                headers: {
                    cookie: `LEETCODE_SESSION=${session}`,
                    "content-type": "application/json"
                }
            }
        );

        console.log("Submission sent");

    } catch (err) {
        console.log(err);
    }

}

submit();