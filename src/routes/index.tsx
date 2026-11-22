import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/game/game";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "President: Rise to Power — Crossia Game" },
    { name: "description", content: "Build a civilian career and begin your American political story in President: Rise to Power, a mobile life simulation by Crossia Game." },
    { property: "og:title", content: "President: Rise to Power — Crossia Game" },
    { property: "og:description", content: "A new name, a new beginning. Create your character in this mobile political life simulation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Game,
});
