import { createFileRoute } from "@tanstack/react-router";

const TITLE = "Privacy Policy — President: Rise to Power";
const DESC = "How President: Rise to Power by Crossia Game handles your data, including local saves and Unity Ads.";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPolicy,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-y-auto">
      <article className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Crossia Game</p>
        <h1 className="mt-1 text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-muted-foreground">President: Rise to Power · Last updated: November 17, 2026</p>

        <Section title="Introduction">
          <p>This Privacy Policy explains how Crossia Game ("we", "us") handles information when you play President: Rise to Power (the "Game"). By playing the Game, you agree to this policy.</p>
        </Section>
        <Section title="No accounts or registration">
          <p>The Game does not require registration, login or a player account. We do not ask for your name, email address or other personal contact details to play.</p>
        </Section>
        <Section title="Game progress saved on your device">
          <p>Your game progress, settings and preferences (such as language) are stored locally on your device. We do not receive this data. Uninstalling the Game or clearing its data may permanently delete your progress.</p>
        </Section>
        <Section title="Advertising (Unity Ads)">
          <p>The Game uses Unity Ads, provided by Unity Technologies, to show advertisements, including optional rewarded video ads that give in-game rewards when watched.</p>
          <p>To deliver, measure and prevent fraud in advertising, Unity Ads may collect and process information such as:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Device identifiers and device information (model, operating system, language)</li>
            <li>Advertising IDs (such as the Google Advertising ID)</li>
            <li>IP address and approximate location derived from it</li>
            <li>Advertising interaction data (ads viewed, clicked or completed)</li>
          </ul>
          <p>This data is handled by Unity under its own policies. Learn more in{" "}
            <a className="text-primary underline" href="https://unity.com/legal/game-player-and-app-user-privacy-faq" target="_blank" rel="noopener noreferrer">Unity's Game Player and App User Privacy FAQ</a>.
          </p>
          <p>You can reset your advertising ID or opt out of personalized ads in your device settings (on Android: Settings → Google → Ads).</p>
        </Section>
        <Section title="Children's privacy">
          <p>The Game is not directed at children under 13, and we do not knowingly collect personal information from children. If you believe a child has provided personal information, please contact us and we will help address it.</p>
        </Section>
        <Section title="Data security">
          <p>Because we do not run player accounts, we hold no personal player data on our own servers. Game data stays on your device. Information processed by Unity Ads is protected under Unity's security practices. No method of storage or transmission is completely secure.</p>
        </Section>
        <Section title="Changes to this policy">
          <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with a new "Last updated" date. Continued use of the Game means you accept the updated policy.</p>
        </Section>
        <Section title="Contact us">
          <p>Developer: Crossia Game</p>
          <p>Email:{" "}
            <a className="text-primary underline" href="mailto:crossiagame@gmail.com">crossiagame@gmail.com</a>
          </p>
        </Section>
      </article>
    </main>
  );
}
