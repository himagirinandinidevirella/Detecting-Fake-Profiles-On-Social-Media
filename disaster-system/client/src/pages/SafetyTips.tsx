import ModulePage from '../components/ModulePage';

export default function SafetyTips() {
  return (
    <ModulePage
      title="Safety Tips & Preparedness"
      subtitle="Guidance coverage and real resource usage — usage charts appear only when usage data exists"
      module="safety"
      endpoint="/analytics/safety"
      filterProps={{ typeLabel: 'Disaster type', show: { severity: false, status: false, location: false } }}
      intro={
        <div className="notice">
          <span>🛡️</span>
          <div>
            The coverage chart below always reflects the safety library itself. The usage charts are driven by
            recorded resource views — if no usage rows exist they render <b>“No data available”</b> instead of
            invented numbers.
          </div>
        </div>
      }
      slots={[
        { id: 'tips_by_type', span: 6, subtitle: 'Published guidance per disaster type' },
        { id: 'viewed_categories', span: 3, height: 300, subtitle: 'Most viewed categories' },
        { id: 'resource_usage', span: 3, height: 300, subtitle: 'Views per resource format' },
        { id: 'content_trend', span: 7, subtitle: 'Content engagement over time' },
        { id: 'type_views', span: 5, subtitle: 'Views per disaster type' },
        { id: 'category_resource', span: 12, height: 330, subtitle: 'Which formats are used for which guidance' },
      ]}
    />
  );
}
