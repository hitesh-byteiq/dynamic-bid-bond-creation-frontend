import { createFileRoute } from "@tanstack/react-router";

import { AutofillFlow } from "@/components/AutofillFlow";

export const Route = createFileRoute("/template-intake")({
  head: () => ({
    meta: [
      { title: "Document Autofill Tool | Dynamic Form Fill AI" },
      {
        name: "description",
        content: "Upload a bond form, provide business information, and review the completed PDF.",
      },
    ],
  }),
  component: AutofillFlow,
});
