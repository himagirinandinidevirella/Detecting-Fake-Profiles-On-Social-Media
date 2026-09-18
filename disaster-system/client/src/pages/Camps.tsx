import ModulePage from '../components/ModulePage';

export default function Camps() {
  return (
    <ModulePage
      title="Relief Camp Analytics"
      subtitle="Capacity, occupancy and essential supplies across every relief camp"
      module="camps"
      endpoint="/analytics/camps"
      filterProps={{ typeLabel: 'Disaster type', show: { severity: false } }}
      slots={[
        { id: 'capacity_vs_occupancy', span: 6, subtitle: 'Beds vs people sheltered, per region' },
        { id: 'available_donut', span: 3, height: 300, subtitle: 'Beds in use vs free' },
        { id: 'status_donut', span: 3, height: 300, subtitle: 'Operational / full / closed' },
        { id: 'occupancy_trend', span: 7, subtitle: 'Average occupancy vs capacity per camp' },
        { id: 'essentials_bar', span: 5, subtitle: 'Supplies available per occupant' },
        { id: 'resource_bar', span: 6, subtitle: 'Total stock held across camps' },
        { id: 'location_bar', span: 6, height: 330, subtitle: 'Top 15 locations by camp count' },
        { id: 'top_camps', span: 12, height: 340, subtitle: 'Largest camps — capacity vs occupancy' },
      ]}
    />
  );
}
