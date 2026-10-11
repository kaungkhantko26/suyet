import { EventGridSkeleton } from "@/components/events/event-grid";
import { Container, Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <Container className="py-14">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      <Skeleton className="mt-8 h-12 w-full" />
      <div className="mt-8"><EventGridSkeleton /></div>
    </Container>
  );
}
