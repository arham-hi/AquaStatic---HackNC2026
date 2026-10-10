import { Page } from "@/components/shell/app-shell";
import { TransitPage } from "@/components/transit/transit-page";

export const metadata = { title: "Bus" };

export default function Transit() {
  return (
    <Page title="Bus" subtitle="Chapel Hill Transit routes and stops around campus." wide>
      <TransitPage />
    </Page>
  );
}
