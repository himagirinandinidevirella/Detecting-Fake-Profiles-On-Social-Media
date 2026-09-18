import ModulePage from '../components/ModulePage';

export default function Alerts() {
  return (
    <ModulePage
      title="Disaster Alerts"
      subtitle="Warning issued, acknowledged and resolved — visualised across type, severity and location"
      module="alerts"
      endpoint="/analytics/alerts"
      filterProps={{ typeLabel: 'Alert type' }}
      slots={[
        { id: 'status_donut', span: 4, height: 300, subtitle: 'Active vs resolved' },
        { id: 'severity_donut', span: 4, height: 300, subtitle: 'Severity mix' },
        { id: 'channel_bar', span: 4, height: 300, subtitle: 'Delivery channel reach' },
        { id: 'frequency_line', span: 8, subtitle: 'Issued vs resolved over time' },
        { id: 'type_bar', span: 4, subtitle: 'Alerts per disaster type' },
        { id: 'region_severity', span: 6, height: 320, subtitle: 'Stacked severity per region' },
        { id: 'location_bar', span: 6, height: 320, subtitle: 'Top 15 locations' },
        { id: 'resolution_heat', span: 12, subtitle: 'Average hours from issue to resolution' },
      ]}
    />
  );
}
