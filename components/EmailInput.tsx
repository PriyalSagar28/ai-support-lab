"use client";

import { sampleEmails, formatSampleEmail } from "@/lib/data/sample-emails";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function EmailInput({ value, onChange }: Props) {
  return (
    <div className="field">
      <div className="field-row">
        <label htmlFor="email-input">Incoming email</label>
        <select
          defaultValue=""
          onChange={(e) => {
            const sample = sampleEmails.find((s) => s.id === e.target.value);
            if (sample) onChange(formatSampleEmail(sample));
          }}
        >
          <option value="" disabled>
            Load a sample email…
          </option>
          {sampleEmails.map((s) => (
            <option key={s.id} value={s.id}>
              {s.subject}
            </option>
          ))}
        </select>
      </div>
      <textarea
        id="email-input"
        rows={8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste or write a customer email here…"
      />
    </div>
  );
}
