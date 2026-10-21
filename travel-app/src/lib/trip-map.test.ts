import { describe, expect, it } from "vitest";
import { seedTrips } from "@/lib/data/demo-data";
import { getTripMapActivities } from "@/lib/trip-map";

describe("actividades del mapa", () => {
  it("conserva en la lista actividades sin coordenadas sin crear marcadores ficticios", () => {
    const source = seedTrips[0];
    const firstDay = source.itinerary[0];
    const activity = firstDay.items[0];
    const trip = {
      ...source,
      expenses: [],
      itinerary: [{
        ...firstDay,
        items: [
          { ...activity, id: "no-coordinates", lat: undefined, lng: undefined },
          { ...activity, id: "with-coordinates", lat: 31.6295, lng: -7.9811 },
        ],
      }],
    };

    const activities = getTripMapActivities(trip);

    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({ id: "no-coordinates", hasCoordinates: false });
    expect(activities[0]).not.toHaveProperty("lat");
    expect(activities[1]).toMatchObject({ id: "with-coordinates", hasCoordinates: true, lat: 31.6295, lng: -7.9811 });
    expect(activities.filter((entry) => entry.hasCoordinates)).toHaveLength(1);
  });
});
