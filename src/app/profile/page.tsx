import { Page } from "@/components/shell/app-shell";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <Page title="Profile & settings" subtitle="What people see, what you hear about, and how you reach us.">
      <ProfileView />
    </Page>
  );
}
