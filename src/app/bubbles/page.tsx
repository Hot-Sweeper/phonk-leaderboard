import { redirect } from "next/navigation";

export default function BubblesPage() {
  redirect("/rankings?view=bubbles");
}