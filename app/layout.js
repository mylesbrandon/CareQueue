import "./globals.css";
import { AppSidebar } from "../components/app-sidebar";

export const metadata = {
  title: "CareQueue",
  description: "Morning assignment and aging management for care-management operations"
};

export default function RootLayout({ children }) {
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());

  return (
    <html lang="en">
      <body>
        <div className="app-frame">
          <AppSidebar todayLabel={todayLabel} />
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
