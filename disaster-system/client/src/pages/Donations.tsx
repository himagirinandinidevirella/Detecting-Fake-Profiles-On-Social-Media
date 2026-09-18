import ModulePage from '../components/ModulePage';

export default function Donations() {
  return (
    <ModulePage
      title="Donation Analytics"
      subtitle="Money and material received, by campaign, disaster type and donor"
      module="donations"
      endpoint="/analytics/donations"
      filterProps={{ typeLabel: 'Disaster type', show: { severity: false, status: false } }}
      slots={[
        { id: 'over_time', span: 8, subtitle: 'Amount and contribution count over time' },
        { id: 'type_donut', span: 4, height: 300, subtitle: 'Cash vs in-kind split' },
        { id: 'campaign_bar', span: 6, subtitle: 'Funds raised per campaign' },
        { id: 'by_disaster', span: 6, subtitle: 'Amount and count per disaster type' },
        { id: 'monthly_trend', span: 5, subtitle: 'Monthly money received' },
        { id: 'donor_donut', span: 3, height: 300, subtitle: 'Where the money comes from' },
        { id: 'region_bar', span: 4, height: 300, subtitle: 'Amount per region' },
        { id: 'inkind_bar', span: 6, subtitle: 'Items donated per category' },
      ]}
    />
  );
}
