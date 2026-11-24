import { createFileRoute } from "@tanstack/react-router";
import { AssessmentReportPage } from "@/components/AssessmentReport";

// URL: /assessment/12  (a finished career discovery report)
export const Route = createFileRoute("/assessment/$id")({
  head: () => ({ meta: [{ title: "Your career report — CareerBridge" }] }),
  component: AssessmentRoute,
});

function AssessmentRoute() {
  const { id } = Route.useParams();
  return <AssessmentReportPage id={Number(id)} />;
}
