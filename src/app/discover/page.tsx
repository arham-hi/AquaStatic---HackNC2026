import { redirect } from "next/navigation";

// Discover merged into Connect. Keep old links working.
export default async function Discover({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q ? `?q=${encodeURIComponent(sp.q)}` : typeof sp.item === "string" ? `?item=${encodeURIComponent(sp.item)}` : "";
  redirect(`/connect${q}`);
}
