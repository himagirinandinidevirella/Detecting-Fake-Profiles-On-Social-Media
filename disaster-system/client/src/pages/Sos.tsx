import ModulePage from '../components/ModulePage';

export default function Sos() {
  return (
    <ModulePage
      title="SOS Analytics"
      subtitle="Distress requests, priority mix and response performance"
      module="sos"
      endpoint="/analytics/sos"
      filterProps={{ typeLabel: 'Disaster type' }}
      slots={[
        { id: 'status_donut', span: 4, height: 300, subtitle: 'Workflow state of every request' },
        { id: 'priority_donut', span: 4, height: 300, subtitle: 'Critical vs normal priority' },
        { id: 'category_bar', span: 4, height: 300, subtitle: 'What people are asking for' },
        { id: 'timeline', span: 7, subtitle: 'Request volume over time' },
        { id: 'response_time', span: 5, subtitle: 'Average and slowest response (minutes)' },
        { id: 'type_bar', span: 6, subtitle: 'Requests per disaster type' },
        { id: 'location_bar', span: 6, height: 330, subtitle: 'Top 15 locations' },
        { id: 'priority_by_region', span: 6, subtitle: 'Priority split per region' },
        { id: 'response_scatter', span: 6, subtitle: 'Each dot: one request' },
      ]}
    />
  );
}
