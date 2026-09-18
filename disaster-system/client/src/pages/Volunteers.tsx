import ModulePage from '../components/ModulePage';

export default function Volunteers() {
  return (
    <ModulePage
      title="Volunteer Analytics"
      subtitle="Workforce capacity: skills, availability and deployment history"
      module="volunteers"
      endpoint="/analytics/volunteers"
      filterProps={{ typeLabel: 'Specialisation', show: { severity: false } }}
      slots={[
        { id: 'available_donut', span: 4, height: 300, subtitle: 'Available vs assigned vs on leave' },
        { id: 'type_donut', span: 4, height: 300, subtitle: 'Volunteers per disaster type' },
        { id: 'region_bar', span: 4, height: 300, subtitle: 'Volunteers per region' },
        { id: 'registration_trend', span: 7, subtitle: 'New registrations over time' },
        { id: 'deployments_bar', span: 5, subtitle: 'Average missions per volunteer' },
        { id: 'skill_bar', span: 6, subtitle: 'Head-count per skill' },
        { id: 'location_bar', span: 6, height: 330, subtitle: 'Top 15 locations' },
        { id: 'skill_status', span: 12, height: 330, subtitle: 'Who is deployable right now' },
      ]}
    />
  );
}
