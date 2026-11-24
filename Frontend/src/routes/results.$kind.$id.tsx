import { createFileRoute } from "@tanstack/react-router";
import { ResultsPage } from "@/components/ResultPages";

// URL: /results/resume/12, /results/career/5, /results/scholarship/3, /results/jobs/8
export const Route = createFileRoute("/results/$kind/$id")({
  head: () => ({ meta: [{ title: "Your results — CareerBridge" }] }),
  component: ResultsRoute,
});

function ResultsRoute() {
  const { kind, id } = Route.useParams();
  return <ResultsPage kind={kind} id={Number(id)} />;
}