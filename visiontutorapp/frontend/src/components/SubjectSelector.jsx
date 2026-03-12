/**
 * SubjectSelector — Dropdown for selecting study subject.
 */

const SUBJECTS = ['Math', 'Science', 'History', 'Coding', 'Other'];

export default function SubjectSelector({ value, onChange, disabled }) {
  return (
    <select
      id="subject-selector"
      className="subject-selector"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Select subject"
    >
      {SUBJECTS.map((subject) => (
        <option key={subject} value={subject}>
          {subject}
        </option>
      ))}
    </select>
  );
}
