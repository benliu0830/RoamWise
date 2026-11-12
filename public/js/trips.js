export const isCompleted = (plan) => plan?.status === 'completed';
export function completeTrip(plan, completedAt = new Date().toISOString()) {
  if (!plan?.id || !Array.isArray(plan.days) || !plan.days.some((day) => day.stops?.length))
    throw new Error('Choose an itinerary before completing a trip.');
  if (isCompleted(plan)) return plan;
  return {
    ...JSON.parse(JSON.stringify(plan)),
    status: 'completed',
    completedAt,
    tripStarted: false
  };
}
export function lastTripDay(plan) {
  return Math.max(0, ...plan.days.map((day, index) => (day.stops.length ? index : 0)));
}
export function tripCollection(plans, activePlan) {
  return [
    ...new Map(
      [
        ...plans,
        ...(activePlan &&
        !isCompleted(activePlan) &&
        !plans.some((p) => p.id === activePlan.id && isCompleted(p))
          ? [activePlan]
          : [])
      ].map((p) => [p.id, p])
    ).values()
  ];
}
