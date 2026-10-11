import { redirect } from "next/navigation";

export const metadata = { title: "Bus" };

export default function Transit() {
  redirect("/map?buses=1");
}
