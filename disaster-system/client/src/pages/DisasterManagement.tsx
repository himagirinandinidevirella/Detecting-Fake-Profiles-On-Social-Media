import ModulePage from '../components/ModulePage';

export default function DisasterManagement() {
  return (
    <ModulePage
      title="Disaster Management"
      subtitle="Every recorded disaster event, analysed by type, severity, location and time"
      module="disasters"
      endpoint="/analytics/disasters"
      filterProps={{ typeLabel: 'Disaster type' }}
      slots={[
        { id: 'type_bar', span: 6, subtitle: 'Event count per disaster type' },
        { id: 'frequency_line', span: 6, subtitle: 'How often events occur over time' },
        { id: 'severity_donut', span: 4, height: 300, subtitle: 'Low → Critical mix' },
        { id: 'region_bar', span: 4, height: 300, subtitle: 'Events per region' },
        { id: 'type_severity_stack', span: 4, height: 300, subtitle: 'Stacked severity inside each type' },
        { id: 'monthly_trend', span: 6, subtitle: 'Trend with affected population' },
        { id: 'casualties_line', span: 6, subtitle: 'Casualties and displacement over time' },
        { id: 'location_bar', span: 6, height: 340, subtitle: 'Top 15 locations by event count' },
        { id: 'affected_bar', span: 6, height: 340, subtitle: 'Top 15 locations by people affected' },
      ]}
    />
  );
}
