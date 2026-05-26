import "dotenv/config";
import { runSongUpdate } from "../src/lib/update-runner";

async function main() {
  const trigger = process.argv[2] || "manual";
  const mode = (process.argv[3] as "delta" | "full") || "delta";
  const result = await runSongUpdate(trigger, mode);
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
