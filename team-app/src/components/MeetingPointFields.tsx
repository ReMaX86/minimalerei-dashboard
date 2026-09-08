import { TimeField } from './DateTimeField';

export interface MeetingPointFormValue {
  meeting_time_hall: string;
  meeting_time_carpool: string;
  meeting_point_carpool: string;
}

export const EMPTY_MEETING_POINT: MeetingPointFormValue = {
  meeting_time_hall: '',
  meeting_time_carpool: '',
  meeting_point_carpool: ''
};

// Heimspiele haben nur einen Treffpunkt (die Halle). Auswärtsspiele zeigen
// zusätzlich den Fahrgemeinschaft-Treffpunkt, für alle die nicht direkt zur
// gegnerischen Halle fahren.
export function MeetingPointFields({
  isHome,
  value,
  onChange
}: {
  isHome: boolean;
  value: MeetingPointFormValue;
  onChange: (next: MeetingPointFormValue) => void;
}) {
  return (
    <div className="space-y-2">
      {!isHome && (
        <div className="space-y-2">
          <TimeField
            label="Fahrgemeinschaft — Zeit"
            value={value.meeting_time_carpool}
            onChange={(v) => onChange({ ...value, meeting_time_carpool: v })}
          />
          <label className="block text-xs">
            <span className="font-semibold text-tbw-ink/50">Fahrgemeinschaft — Ort</span>
            <input
              type="text"
              placeholder="z. B. Parkplatz Schulzentrum"
              className="input mt-1"
              value={value.meeting_point_carpool}
              onChange={(e) => onChange({ ...value, meeting_point_carpool: e.target.value })}
            />
          </label>
        </div>
      )}
      <TimeField
        label={isHome ? 'Treffpunkt in der Halle' : 'Direkt zur Halle — Zeit'}
        value={value.meeting_time_hall}
        onChange={(v) => onChange({ ...value, meeting_time_hall: v })}
      />
    </div>
  );
}
