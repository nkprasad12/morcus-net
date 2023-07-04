import { checkPresent } from "@/common/assert";
import fetch from "node-fetch";

const GITHUB_ISSUES_API =
  "https://api.github.com/repos/nkprasad12/morcus-net/issues";

export namespace GitHub {
  export async function reportIssue(
    message: string,
    commit: string
  ): Promise<void> {
    const firstLine = message.split("\n")[0].slice(0, 50);
    const commitLink = `https://github.com/nkprasad12/morcus-net/commit/${commit}`;
    const body = {
      title: `User Report: ${firstLine}`,
      body: [`Built at: ${commitLink}`, message].join("\n"),
      labels: ["userReport"],
    };

    const response = await fetch(GITHUB_ISSUES_API, {
      method: "post",
      body: JSON.stringify(body),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${checkPresent(process.env.GITHUB_TOKEN)}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to create GitHub issue!");
    }
  }
}
