import { TripCalendar } from "@/features/calendar/components/trip-calendar";

export default function CalendarioPage() {
  return (
    <main className="calendar-page mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <TripCalendar />
    </main>
  );
}
