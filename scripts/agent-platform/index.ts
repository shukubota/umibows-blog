import { GoogleGenAI } from "@google/genai";

const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "global";

async function main() {
  const project = GOOGLE_CLOUD_PROJECT;
  const location = GOOGLE_CLOUD_LOCATION;
  const client = new GoogleGenAI({
    project,
    location,
    vertexai: true,
  });
  const response = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "How does AI work?",
  });

  console.dir(response, { depth: null });
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch((error) => {
    console.error(error);
  });
