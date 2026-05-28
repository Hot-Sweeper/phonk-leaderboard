import { redirect } from "next/navigation";

export default function HypeRedirectPage() {
  redirect("/rankings?entity=songs&mode=week&hype=1");
}
