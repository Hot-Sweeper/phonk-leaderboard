import "dotenv/config";
import { cancelAllRunning } from "../src/lib/update-runner";

async function main() {
  const count = await cancelAllRunning();
  console.log(JSON.stringify({ cancelled: count }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});