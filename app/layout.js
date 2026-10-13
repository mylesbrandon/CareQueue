import "./globals.css";
import { DemoProvider } from "../components/demo-provider";
import { AppSidebar } from "../components/app-sidebar";

export const metadata = {
  title: "CareQueue",
  description: "Morning assignment and aging management for care-management operations"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to workspace</a>
        <div className="app-frame">
          <AppSidebar />
          <main className="app-main" id="main-content"><DemoProvider>{children}</DemoProvider></main>
        </div>
      </body>
    </html>
  );
}
