import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ClientApp from "@/components/ClientApp";

export default async function HomePage() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get("site_auth");

  if (!authCookie || authCookie.value !== "authenticated") {
    redirect("/login");
  }

  return <ClientApp />;
}
