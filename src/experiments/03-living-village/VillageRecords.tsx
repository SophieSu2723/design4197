import type { WorldState } from './simulation';
import { developmentOf } from './development';

const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;

export default function VillageRecords({ world, plot }: { world: WorldState; plot: number }) {
  const { cells, riverLevel, runoffM3, dischargeM3, growthSites } = world.ecology;
  const mean = (key: 'soilMoisture' | 'vegetationHealth') => cells.reduce((sum, cell) => sum + cell[key], 0) / cells.length;
  const exportCsv = () => {
    const rows = ['day,season,weather,rainfall_mm,temperature_c,plot,moisture,health,growth,expected_yield,status,harvested_total'];
    world.history.forEach(day => day.plots.forEach(p => rows.push([
      day.day, day.season, day.kind, day.rainfallMm, day.temperatureC, p.id + 1,
      p.moisture, p.health ?? '', p.growth ?? '', p.expectedYield, p.status, day.harvested,
    ].join(','))));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'living-village-daily.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="village-records" aria-label="World records">
    <h2>Records</h2>
    <div className="village-card">
      <h3>Today · Day {world.day}</h3>
      {world.today.length ? <ol className="village-event-list">{world.today.map((event, index) => (
        <li key={index}><time>{event.time}</time><span>{event.description}</span></li>
      ))}</ol> : <p className="village-panel-hint">Start the simulation to record changes.</p>}
    </div>
    <details className="village-fold">
      <summary>Ecological cause and effect</summary>
      <p className="village-panel-hint">Rain changes soil moisture, river flow, plant growth and daily routines.</p>
      <dl className="village-facts">
        <div><dt>Season</dt><dd>{world.season}</dd></div>
        <div><dt>Rain / wind</dt><dd>{world.weather?.rainfallMm.toFixed(1) ?? '—'} mm / {developmentOf(world).windKph.toFixed(0)} km/h</dd></div>
        <div><dt>Temperature</dt><dd>{world.weather?.temperatureC.toFixed(1) ?? '—'} °C</dd></div>
        <div><dt>Soil moisture</dt><dd>{percent(mean('soilMoisture'))}</dd></div>
        <div><dt>River level</dt><dd>{riverLevel.toFixed(2)} m</dd></div>
        <div><dt>Runoff / discharge</dt><dd>{runoffM3.toFixed(2)} / {dischargeM3.toFixed(2)} m³</dd></div>
        <div><dt>Vegetation health</dt><dd>{percent(mean('vegetationHealth'))}</dd></div>
        <div><dt>New growth</dt><dd>{Object.keys(growthSites).length} patches</dd></div>
        <div><dt>Harvested strawberries</dt><dd>{world.harvested}</dd></div>
      </dl>
    </details>
    <details className="village-fold">
      <summary>Daily observations · Plot {plot + 1}</summary>
      <button onClick={exportCsv} disabled={!world.history.length}>Export all plots CSV</button>
      <div className="village-table-scroll" role="region" aria-label="Scrollable daily observations" tabIndex={0}>
        <table>
          <thead><tr>{['Day', 'Season', 'Weather', 'Rain mm', 'Temp °C', 'Moisture', 'Health', 'Growth', 'Expected yield', 'Status', 'Harvest total']
            .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{world.history.map(day => {
            const p = day.plots[plot];
            return <tr key={day.day}>
              <th scope="row">{day.day}</th><td>{day.season}</td><td>{day.kind}</td><td>{day.rainfallMm.toFixed(1)}</td>
              <td>{day.temperatureC.toFixed(1)}</td><td>{percent(p.moisture)}</td><td>{percent(p.health)}</td>
              <td>{percent(p.growth)}</td><td>{p.expectedYield}</td><td>{p.status}</td><td>{day.harvested}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
