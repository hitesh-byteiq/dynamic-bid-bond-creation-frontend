import { createFileRoute } from "@tanstack/react-router";

import { AutofillFlow } from "@/components/AutofillFlow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Document Autofill Tool | Dynamic Form Fill AI" },
      {
        name: "description",
        content: "Upload a bond form, provide business information, and review the completed PDF.",
      },
      { property: "og:title", content: "Document Autofill Tool | Dynamic Form Fill AI" },
      {
        property: "og:description",
        content: "Upload a bond form, provide business information, and review the completed PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutofillFlow,
});
