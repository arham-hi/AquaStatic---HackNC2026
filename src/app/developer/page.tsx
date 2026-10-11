import { Page } from "@/components/shell/app-shell";
import { DeveloperPanel } from "@/components/developer/developer-panel";

export const metadata = { title: "Developer tools" };

export default function DeveloperPage() {
  return (
    <Page title="Developer tools" subtitle="Scenario controls and integration health. Internal only." wide>
      <DeveloperPanel />
    </Page>
  );
}
