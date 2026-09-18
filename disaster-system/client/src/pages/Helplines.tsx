import ModulePage from '../components/ModulePage';
import { useApi } from '../hooks/useApi';

export default function Helplines() {
  const { data: status } = useApi<{ tables: Record<string, number> }>('/meta/status');
  const calls = status?.tables?.helpline_calls ?? null;

  return (
    <ModulePage
      title="Emergency Helplines"
      subtitle="Call volumes, answer rates and response times per emergency service"
      module="helplines"
      endpoint="/analytics/helplines"
      filterProps={{ typeLabel: 'Emergency type', show: { severity: false } }}
      intro={
        calls === 0 ? (
          <div className="notice warn">
            <span>📵</span>
            <div>
              <b>No call statistics available.</b> The helpline call log is empty, so the charts below
              show a genuine “No data available” state instead of estimated numbers. Upload a call-log
              dataset (CSV/XLSX/JSON) in <b>Dataset Management</b> and load it into
              <b> Emergency Helplines</b> to populate this page.
            </div>
          </div>
        ) : (
          <div className="notice">
            <span>📞</span>
            <div>
              <b>{(calls ?? 0).toLocaleString('en-IN')} call records</b> in the helpline log. Services with
              no calls in the selected range intentionally render an empty state rather than placeholder data.
            </div>
          </div>
        )
      }
      slots={[
        { id: 'service_bar', span: 6, subtitle: 'Call volume per helpline' },
        { id: 'type_donut', span: 3, height: 300, subtitle: 'Reason for the call' },
        { id: 'status_by_service', span: 3, height: 300, subtitle: 'Answered / busy / missed' },
        { id: 'calls_over_time', span: 7, subtitle: 'Call volume over time' },
        { id: 'response_trend', span: 5, subtitle: 'Average minutes to answer' },
        { id: 'location_bar', span: 12, height: 340, subtitle: 'Top 15 locations by call volume' },
      ]}
    />
  );
}
