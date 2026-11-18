import { goalNames, goals } from './behavior';
import { placeNames } from './places';
import { routeLength } from './population';
import type { VillagerState } from './population';
import type { WorldState } from './simulation';
import { followsWornTrail } from './trails';

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function ResidentInspector({ resident, world, onClose }: {
  resident: VillagerState;
  world: WorldState;
  onClose: () => void;
}) {
  const { activity, route, routeIssue, destinationTarget, status } = resident;
  const target = destinationTarget ?? activity?.target;
  const destination = target ? placeNames[target] : resident.destination && resident.id === 'mina' ? 'Su’s farmhouse' : '—';
  const movement = routeIssue ? 'Blocked' : route.length ? 'Walking' : (resident.dwellSeconds ?? 0) > 0 ? 'At destination' : 'Waiting';
  const weight = activity?.weights;
  const total = weight ? goals.reduce((sum, goal) => sum + weight[goal], 0) : 0;
  const foraging = world.population.foraging;
  const trails = world.population.trails;
  const wornSegments = trails ? route.slice(1).filter((point, i) => followsWornTrail(trails, route[i], point)).length : 0;
  const influence = activity?.factors?.filter(factor => factor.multiplier > 1)
    .sort((a, b) => b.multiplier - a.multiplier)[0];
  const reason = status === 'invited' ? 'Mina is waiting for you to choose a home and bakery site.'
    : resident.taskReason ?? activity?.reason
      ?? (activity?.goal === 'RETURN_HOME' && !weight ? 'Mina returns home at the end of the daily routine.'
        : influence ? `${influence.label} made this activity more likely.`
          : total > 0 ? 'This activity was drawn from today’s weighted choices.'
          : world.day === 0 ? 'Start the simulation to see the first daily routine.'
            : 'The next task appears when the resident starts it.');

  return <section className="resident-inspector" aria-labelledby="resident-inspector-title">
    <header>
      <h2 id="resident-inspector-title">{resident.name} · {resident.profession}</h2>
      <button onClick={onClose} aria-label="Close resident inspector">Close</button>
    </header>
    <h3>{resident.currentGoal}</h3>
    <p className="resident-task-reason">{reason}</p>
    {routeIssue && <p className="resident-route-blocked">{routeIssue === 'interrupted'
      ? 'Conditions changed along the route and no replacement route was found.'
      : 'No walkable route to this destination was found.'}</p>}
    <dl className="resident-inspector-facts">
      <div><dt>Destination</dt><dd>{destination}</dd></div>
      <div><dt>Status</dt><dd>{movement}{route.length > 0 && ` · ${routeLength(resident.position, route).toFixed(1)} m left`}</dd></div>
      {(resident.deliveryLeg || (resident.cargoFood ?? 0) > 0) && <div><dt>Food carried</dt><dd>{(resident.cargoFood ?? 0).toFixed(1)}</dd></div>}
      {(resident.wildFood ?? 0) > 0 && <div><dt>Wild food carried</dt><dd>{resident.wildFood}</dd></div>}
    </dl>
    <details className="village-fold">
      <summary>Decision details</summary>
      <dl className="resident-inspector-facts">
        <div><dt>{activity ? 'Energy at choice' : 'Energy'}</dt><dd>{percent(activity?.energy ?? resident.energy)}</dd></div>
        {(activity || resident.socialNeed !== undefined) && <div><dt>{activity ? 'Social need at choice' : 'Social need'}</dt><dd>{percent(activity?.socialNeed ?? resident.socialNeed ?? 0)}</dd></div>}
        {resident.id === 'su' && foraging && <>
          <div><dt>Known wild patches</dt><dd>{Object.keys(foraging.known).length}</dd></div>
          <div><dt>Wild food gathered</dt><dd>{foraging.gathered}</dd></div>
        </>}
        {wornSegments > 0 && <div><dt>Remaining on worn paths</dt><dd>{wornSegments} m</dd></div>}
      </dl>
      {activity && weight && total > 0 && <div className="resident-choice">
      <h4>Choice odds · {activity.part}</h4>
      <ul>{goals.filter(goal => weight[goal] > 0).sort((a, b) => weight[b] - weight[a]).map(goal => (
        <li key={goal} className={goal === activity.goal ? 'resident-choice-selected' : undefined}>
          <span>{goalNames[goal]}{goal === activity.goal && ' · chosen'}</span><b>{percent(weight[goal] / total)}</b>
        </li>
      ))}</ul>
      {!!activity.factors?.length && <>
        <h4>What changed the chosen activity’s weight</h4>
        <ul>{activity.factors.map(factor => <li key={factor.label}><span>{factor.label}</span><b>×{factor.multiplier.toFixed(2)}</b></li>)}</ul>
      </>}
      </div>}
      {!!resident.recentGoals?.length && <details className="village-fold">
        <summary>Planned activities · last {resident.recentGoals.length} days</summary>
        <ul className="village-event-list">{[...resident.recentGoals].reverse().map(day => (
          <li key={day.day}><time>Day {day.day}</time><span>{day.goals.map(goal => goalNames[goal]).join(' · ')}</span></li>
        ))}</ul>
      </details>}
    </details>
  </section>;
}
